import type {SectionDrawing} from "./modelSection";
const tau=2*Math.PI,norm=(a:number)=>(a%tau+tau)%tau,near=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6;
const ends=(g:SectionDrawing):number[][]=>g.kind==="circle"?[]:g.kind==="line"?g.params.points as number[][]:[Number(g.params.startAngle),Number(g.params.endAngle)].map(a=>[(g.params.center as number[])[0]+Number(g.params.radius)*Math.cos(a),(g.params.center as number[])[1]+Number(g.params.radius)*Math.sin(a)]);
const on=(g:SectionDrawing,p:number[])=>{if(g.kind==="line"){const [a,b]=ends(g),d=[b[0]-a[0],b[1]-a[1]],t=((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/(d[0]**2+d[1]**2);return t>=-1e-8&&t<=1+1e-8;}if(g.kind==="circle")return true;const c=g.params.center as number[],t=norm(Math.atan2(p[1]-c[1],p[0]-c[0])-Number(g.params.startAngle));return t<=Number(g.params.endAngle)-Number(g.params.startAngle)+1e-8||tau-t<1e-8;};
/** Reject intersecting/touching rings or coincident pieces, retaining ordinary shared vertices. */
export function ambiguousSectionBoundary(curves:SectionDrawing[]):boolean{
 for(let i=0;i<curves.length;i++)for(let j=i+1;j<curves.length;j++){const a=curves[i],b=curves[j];let points:number[][]=[];
  if(a.kind==="line"&&b.kind==="line"){
   const [p,q]=ends(a),[r,s]=ends(b),u=[q[0]-p[0],q[1]-p[1]],v=[s[0]-r[0],s[1]-r[1]],cross=(x:number[],y:number[])=>x[0]*y[1]-x[1]*y[0],w=[r[0]-p[0],r[1]-p[1]],den=cross(u,v);
   if(Math.abs(den)>1e-10){const t=cross(w,v)/den,z=cross(w,u)/den;if(t>=-1e-8&&t<=1+1e-8&&z>=-1e-8&&z<=1+1e-8)points=[[p[0]+t*u[0],p[1]+t*u[1]]];}
   else if(Math.abs(cross(w,u))<1e-8){const n=u[0]**2+u[1]**2,ts=[r,s].map(x=>((x[0]-p[0])*u[0]+(x[1]-p[1])*u[1])/n).sort((a,b)=>a-b);if(Math.min(1,ts[1])-Math.max(0,ts[0])>1e-8)return true;}
  }else if(a.kind==="line"||b.kind==="line"){
   const l=a.kind==="line"?a:b,c=a.kind==="line"?b:a,[p,q]=ends(l),center=c.params.center as number[],r=Number(c.params.radius),u=[q[0]-p[0],q[1]-p[1]],w=[p[0]-center[0],p[1]-center[1]],A=u[0]**2+u[1]**2,B=2*(u[0]*w[0]+u[1]*w[1]),C=w[0]**2+w[1]**2-r*r,D=B*B-4*A*C;
   if(D>=-1e-8)points=[(-B-Math.sqrt(Math.max(0,D)))/(2*A),(-B+Math.sqrt(Math.max(0,D)))/(2*A)].filter(t=>t>=-1e-8&&t<=1+1e-8).map(t=>[p[0]+u[0]*t,p[1]+u[1]*t]);
  }else{
   const p=a.params.center as number[],q=b.params.center as number[],r=Number(a.params.radius),s=Number(b.params.radius),d=Math.hypot(q[0]-p[0],q[1]-p[1]);
   if(d<1e-8&&Math.abs(r-s)<1e-8){if(a.kind==="circle"||b.kind==="circle")return true;const samples=(g:SectionDrawing)=>[Number(g.params.startAngle),Number(g.params.endAngle),(Number(g.params.startAngle)+Number(g.params.endAngle))/2].map(t=>[p[0]+r*Math.cos(t),p[1]+r*Math.sin(t)]);points=[...samples(a),...samples(b)];}
   else if(d>1e-8&&d<=r+s+1e-8&&d>=Math.abs(r-s)-1e-8){const x=(r*r-s*s+d*d)/(2*d),h=Math.sqrt(Math.max(0,r*r-x*x)),u=[(q[0]-p[0])/d,(q[1]-p[1])/d];points=[-1,1].map(t=>[p[0]+x*u[0]-t*h*u[1],p[1]+x*u[1]+t*h*u[0]]);}
  }
  if(points.some(p=>on(a,p)&&on(b,p)&&!(ends(a).some(q=>near(p,q))&&ends(b).some(q=>near(p,q)))))return true;
 }
 return false;
}
