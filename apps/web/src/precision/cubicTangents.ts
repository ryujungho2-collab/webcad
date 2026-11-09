type V=[number,number,number];
/** Uniform natural (open) or periodic (closed) cubic interpolation, at most 60 points. */
export function c2Tangents(points:V[],closed:boolean):V[]{
 const n=points.length,a=Array.from({length:n},()=>Array(n+3).fill(0) as number[]);
 for(let i=0;i<n;i++){
  if(!closed&&(i===0||i===n-1)){a[i][i]=2;a[i][i===0?1:n-2]=1;for(let j=0;j<3;j++)a[i][n+j]=3*(i===0?points[1][j]-points[0][j]:points[n-1][j]-points[n-2][j]);}
  else{const prev=(i+n-1)%n,next=(i+1)%n;a[i][prev]+=1;a[i][i]+=4;a[i][next]+=1;for(let j=0;j<3;j++)a[i][n+j]=3*(points[next][j]-points[prev][j]);}
 }
 // Partial pivoting; the same bounded factorization solves XYZ together.
 for(let k=0;k<n;k++){let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;[a[k],a[pivot]]=[a[pivot],a[k]];const d=a[k][k];if(Math.abs(d)<1e-12)throw Error("C2 interpolation system is singular.");for(let j=k;j<n+3;j++)a[k][j]/=d;for(let i=k+1;i<n;i++){const f=a[i][k];for(let j=k;j<n+3;j++)a[i][j]-=f*a[k][j];}}
 const result:V[]=Array.from({length:n},()=>[0,0,0]);for(let i=n-1;i>=0;i--)for(let j=0;j<3;j++){let value=a[i][n+j];for(let k=i+1;k<n;k++)value-=a[i][k]*result[k][j];result[i][j]=value;}return result;
}
/** Analytic join diagnostics in the fitted source's uniform parameter and source XYZ. */
export function cubicJoinReport(poles:V[],closed:boolean){
 const n=(poles.length-1)/3,joins=closed?n:n-1;let maxFirstDerivativeGap=0,maxSecondDerivativeGap=0,maxCurvatureVectorGap=0,stationaryJoinCount=0;
 const curvature=(v:V,a:V)=>{const speed2=v.reduce((s,x)=>s+x*x,0);if(speed2<1e-18)return;const dot=v.reduce((s,x,i)=>s+x*a[i],0);return a.map((x,i)=>(x-v[i]*dot/speed2)/speed2) as V;};
 for(let i=0;i<joins;i++){const left=3*i,right=3*((i+1)%n),l=poles.slice(left,left+4),r=poles.slice(right,right+4),v=l[3].map((x,j)=>3*(x-l[2][j])) as V,w=r[1].map((x,j)=>3*(x-r[0][j])) as V,a=l[3].map((x,j)=>6*(x-2*l[2][j]+l[1][j])) as V,b=r[2].map((x,j)=>6*(x-2*r[1][j]+r[0][j])) as V;
 maxFirstDerivativeGap=Math.max(maxFirstDerivativeGap,Math.hypot(...v.map((x,j)=>x-w[j])));maxSecondDerivativeGap=Math.max(maxSecondDerivativeGap,Math.hypot(...a.map((x,j)=>x-b[j])));const c=curvature(v,a),d=curvature(w,b);if(!c||!d)stationaryJoinCount++;else maxCurvatureVectorGap=Math.max(maxCurvatureVectorGap,Math.hypot(...c.map((x,j)=>x-d[j])));
 }return {coordinates:"source XYZ mm",parameterization:"uniform span parameter",joinCount:joins,closedSeamIncluded:closed,maxFirstDerivativeGap,maxSecondDerivativeGap,maxCurvatureVectorGap,curvatureUnit:"1/mm",stationaryJoinCount};
}
