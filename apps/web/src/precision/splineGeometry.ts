import {validSpline,type CadSpline} from "@agent-webcad/cad-document";
type H=[number,number,number,number];type V=[number,number,number];
const blend=(a:H,b:H,t:number)=>a.map((v,i)=>v*(1-t)+b[i]*t) as H;
const point=(h:H)=>h.slice(0,3).map(v=>v/h[3]) as V;
const hom=(s:CadSpline)=>s.controlPoints.map((q,i)=>{const w=s.weights?.[i]??1;return [...q.map(v=>v*w),w] as H;});
function span(s:CadSpline,t:number){const n=s.controlPoints.length-1;if(t>=s.knots[n+1])return n;let k=s.degree;while(k<n&&s.knots[k+1]<=t)k++;return k;}
export function splinePoint(s:CadSpline,t:number):V{if(!validSpline(s)||t<s.domain[0]-1e-12||t>s.domain[1]+1e-12)throw Error("Invalid spline/domain.");t=Math.max(s.domain[0],Math.min(s.domain[1],t));const k=span(s,t),d=hom(s).slice(k-s.degree,k+1);for(let r=1;r<=s.degree;r++)for(let j=s.degree;j>=r;j--){const i=k-s.degree+j,den=s.knots[i+s.degree-r+1]-s.knots[i];d[j]=blend(d[j-1],d[j],den?(t-s.knots[i])/den:0);}return point(d[s.degree]);}
function insert(s:CadSpline,u:number):CadSpline{const p=s.degree,k=span(s,u),h=hom(s),n=h.length-1,m=s.knots.filter(v=>v===u).length,q:H[]=new Array(h.length+1);for(let i=0;i<=k-p;i++)q[i]=h[i];for(let i=k-m;i<=n;i++)q[i+1]=h[i];for(let i=k-p+1;i<=k-m;i++){const a=(u-s.knots[i])/(s.knots[i+p]-s.knots[i]);q[i]=blend(h[i-1],h[i],a);}const knots=[...s.knots];knots.splice(k+1,0,u);return {...s,knots,controlPoints:q.map(point),weights:q.map(v=>v[3])};}
/** Knot insertion is exact in homogeneous coordinates; trims do not sample. */
export function splineBezierSpans(source:CadSpline){if(!validSpline(source))throw Error("Invalid spline.");let s=structuredClone(source);const [a,b]=s.domain,values=[a,...new Set(s.knots.filter(t=>t>a&&t<b)),b];for(const t of values){const target=t===a||t===b?s.degree+1:s.degree;while(s.knots.filter(v=>v===t).length<target)s=insert(s,t);}
 const h=hom(s),result:{a:number;b:number;h:H[]}[]=[];for(let k=s.degree;k<h.length;k++)if(s.knots[k]<s.knots[k+1]&&s.knots[k]>=a&&s.knots[k+1]<=b)result.push({a:s.knots[k],b:s.knots[k+1],h:h.slice(k-s.degree,k+1)});return result;}
function split(h:H[]){const left=[h[0]],right=[h.at(-1)!];let row=h;while(row.length>1){row=row.slice(1).map((v,i)=>blend(row[i],v,.5));left.push(row[0]);right.unshift(row.at(-1)!);}return [left,right];}
const chordDistance=(p:V,a:V,b:V)=>{const v=b.map((x,i)=>x-a[i]),den=v.reduce((s,x)=>s+x*x,0),t=den?Math.max(0,Math.min(1,p.reduce((s,x,i)=>s+(x-a[i])*v[i],0)/den)):0;return Math.hypot(...p.map((x,i)=>x-a[i]-t*v[i]));};
/** Positive rational Bezier convex hull bounds every chord deviation. */
export function sampleSpline(s:CadSpline,tolerance=.02){if(!(tolerance>0&&Number.isFinite(tolerance)))throw Error("Invalid spline display tolerance.");const out:V[]=[];let budget=0;const visit=(h:H[],depth:number)=>{if(++budget>32768)throw Error("Spline sampling budget exceeded; increase tolerance.");const pts=h.map(point),a=pts[0],b=pts.at(-1)!;if(pts.every(p=>chordDistance(p,a,b)<=tolerance)){if(!out.length)out.push(a);out.push(b);return;}if(!depth)throw Error("Spline display tolerance did not converge.");for(const q of split(h))visit(q,depth-1);};for(const span of splineBezierSpans(s))visit(span.h,24);return out;}
export function splineClosed(s:CadSpline){return Math.hypot(...splinePoint(s,s.domain[0]).map((x,i)=>x-splinePoint(s,s.domain[1])[i]))<1e-7;}
/** Convergent control-polygon/chord length enclosure, no display-length substitution. */
export function splineLength(s:CadSpline,tolerance=1e-6){let budget=0;const length=(h:H[],eps:number,depth:number):number=>{if(++budget>65536)throw Error("Spline length budget exceeded.");const p=h.map(point),lo=Math.hypot(...p[0].map((x,i)=>x-p.at(-1)![i])),hi=p.slice(1).reduce((n,v,i)=>n+Math.hypot(...v.map((x,j)=>x-p[i][j])),0);if(hi-lo<=eps)return (hi+lo)/2;if(!depth)throw Error("Spline length did not converge.");return split(h).reduce((n,q)=>n+length(q,eps/2,depth-1),0);};const spans=splineBezierSpans(s);return spans.reduce((n,q)=>n+length(q.h,tolerance/spans.length,24),0);}

export function trimSpline(source:CadSpline):CadSpline{let s=structuredClone(source);for(const t of s.domain)while(s.knots.filter(v=>v===t).length<s.degree+1)s=insert(s,t);const first=s.knots.indexOf(s.domain[0])+s.degree,last=s.knots.indexOf(s.domain[1])-1;return {...s,controlPoints:s.controlPoints.slice(first-s.degree,last+1),weights:s.weights?.slice(first-s.degree,last+1),knots:s.knots.slice(first-s.degree,last+s.degree+2)};}

export function cropSpline(s:CadSpline,range:[number,number,number,number]):CadSpline[]{
 const roots=[s.domain[0],s.domain[1]];let budget=0;
 const splitValues=(p:number[])=>{let row=p,left=[p[0]],right=[p.at(-1)!];while(row.length>1){row=row.slice(1).map((v,i)=>(row[i]+v)/2);left.push(row[0]);right.unshift(row.at(-1)!);}return [left,right];};
 for(const span of splineBezierSpans(s))for(const [axis,bound] of [[0,range[0]],[0,range[2]],[1,range[1]],[1,range[3]]]){
  const coeff=span.h.map(h=>(h[axis]-bound*h[3])/Math.max(...span.h.map(q=>q[3])));
  const isolate=(p:number[],a:number,b:number,depth:number)=>{if(++budget>65536)throw Error("Spline crop root budget exceeded.");const min=Math.min(...p),max=Math.max(...p);if(min>0||max<0)return;if(p.every(v=>v===0))return;if(b-a<1e-12*Math.max(1,s.domain[1]-s.domain[0])){const t=(a+b)/2;if(Math.abs(splinePoint(s,t)[axis]-bound)>1e-7)throw Error("Spline crop boundary accuracy exceeds 1e-7 mm; change the range or coordinate scale.");roots.push(t);return;}if(!depth)throw Error("Spline crop roots did not converge.");const [l,r]=splitValues(p),m=(a+b)/2;isolate(l,a,m,depth-1);isolate(r,m,b,depth-1);};isolate(coeff,span.a,span.b,48);
 }
 const ts=roots.sort((a,b)=>a-b).filter((t,i,all)=>!i||t-all[i-1]>1e-10*Math.max(1,s.domain[1]-s.domain[0])),result:CadSpline[]=[];
 for(let i=0;i+1<ts.length;i++){const a=ts[i],b=ts[i+1],p=splinePoint(s,(a+b)/2);if(p[0]>=range[0]-1e-8&&p[0]<=range[2]+1e-8&&p[1]>=range[1]-1e-8&&p[1]<=range[3]+1e-8){const last=result.at(-1);if(last&&Math.abs(last.domain[1]-a)<1e-10)last.domain[1]=b;else result.push({...s,domain:[a,b]});}}
 return result;
}

export function splineArea(s:CadSpline,tolerance=1e-6):number|undefined{
 if(!splineClosed(s))return;const points=s.controlPoints,origin=points[0],u=points.find(p=>Math.hypot(...p.map((v,i)=>v-origin[i]))>1e-6);if(!u)return;let normal:V|undefined;for(const p of points){const a=u.map((v,i)=>v-origin[i]),b=p.map((v,i)=>v-origin[i]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n);if(length>1e-8){normal=n.map(v=>v/length) as V;break;}}if(!normal||points.some(p=>Math.abs(p.reduce((sum,v,i)=>sum+(v-origin[i])*normal![i],0))>1e-7))return;
 let budget=0;const evalH=(h:H[],t:number)=>{let row=h;while(row.length>1)row=row.slice(1).map((v,i)=>blend(row[i],v,t));return row[0];};let result=0;const spans=splineBezierSpans(s);
 for(const {h} of spans){const derivative=h.slice(1).map((v,i)=>v.map((x,j)=>(x-h[i][j])*(h.length-1)) as H),speed=(t:number)=>{const r=evalH(h,t),d=evalH(derivative,t),p=r.slice(0,3).map((x,i)=>x/r[3]-origin[i]),v=d.slice(0,3).map((x,i)=>(x*r[3]-r[i]*d[3])/(r[3]*r[3])),cross=[p[1]*v[2]-p[2]*v[1],p[2]*v[0]-p[0]*v[2],p[0]*v[1]-p[1]*v[0]];return cross.reduce((n,x,i)=>n+x*normal![i],0)/2;},sim=(a:number,b:number)=>(b-a)*(speed(a)+4*speed((a+b)/2)+speed(b))/6,integrate=(a:number,b:number,value:number,eps:number,depth:number):number=>{if(++budget>65536)throw Error("Spline area integration budget exceeded.");const m=(a+b)/2,l=sim(a,m),r=sim(m,b),delta=l+r-value;if(Math.abs(delta)<=15*eps)return l+r+delta/15;if(!depth)throw Error("Spline area integration did not converge.");return integrate(a,m,l,eps/2,depth-1)+integrate(m,b,r,eps/2,depth-1);};result+=integrate(0,1,sim(0,1),tolerance/spans.length,24);
 }return Math.abs(result);
}
