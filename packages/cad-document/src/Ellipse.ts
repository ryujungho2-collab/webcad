/** C + U cos(t) + V sin(t). Axes span a plane; affine transforms may make them conjugate. */
export type CadEllipse={center:[number,number,number];axisU:[number,number,number];axisV:[number,number,number];startParam:number;sweep:number};
export function validEllipse(v:unknown):v is CadEllipse & Record<string,unknown>{
 if(!v||typeof v!=="object")return false;const p=v as CadEllipse,vec=(a:unknown):a is [number,number,number]=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
 if(!vec(p.center)||!vec(p.axisU)||!vec(p.axisV)||!Number.isFinite(p.startParam)||Math.abs(p.startParam)>1e6||!Number.isFinite(p.sweep)||Math.abs(p.sweep)<1e-9||Math.abs(p.sweep)>2*Math.PI+1e-10)return false;
 const u=p.axisU,w=p.axisV,a=Math.hypot(...u),b=Math.hypot(...w),cross=Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]);return a>1e-6&&b>1e-6&&a<=1e9&&b<=1e9&&cross/(a*b)>1e-8;
}
