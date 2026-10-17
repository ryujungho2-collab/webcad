/** Exact nonperiodic B-spline/NURBS with expanded knots and a finite domain. */
export type CadSpline={degree:number;controlPoints:[number,number,number][];knots:number[];weights?:number[];domain:[number,number]};
export function validSpline(v:unknown):v is CadSpline & Record<string,unknown>{
 if(!v||typeof v!=="object")return false;const s=v as CadSpline,n=s.controlPoints?.length,p=s.degree;
 if(!Number.isInteger(p)||p<1||p>8||!Array.isArray(s.controlPoints)||n<p+1||n>256||!s.controlPoints.every(q=>Array.isArray(q)&&q.length===3&&q.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e9)))return false;
 if(!s.controlPoints.some(q=>Math.hypot(...q.map((x,i)=>x-s.controlPoints[0][i]))>1e-6))return false;
 if(!Array.isArray(s.knots)||s.knots.length!==n+p+1||!s.knots.every((x,i)=>Number.isFinite(x)&&Math.abs(x)<=1e9&&(i===0||x>=s.knots[i-1])))return false;
 let count=1;for(let i=1;i<s.knots.length;i++){count=s.knots[i]===s.knots[i-1]?count+1:1;if(count>p+1||count>p&&s.knots[i]>s.knots[p]&&s.knots[i]<s.knots[n])return false;}
 if(s.weights!==undefined&&(!Array.isArray(s.weights)||s.weights.length!==n||!s.weights.every(w=>Number.isFinite(w)&&w>=1e-9&&w<=1e9)))return false;
 return Array.isArray(s.domain)&&s.domain.length===2&&s.domain.every(Number.isFinite)&&s.domain[0]>=s.knots[p]&&s.domain[1]<=s.knots[n]&&s.domain[1]>s.domain[0]&&s.knots[n]>s.knots[p];
}
