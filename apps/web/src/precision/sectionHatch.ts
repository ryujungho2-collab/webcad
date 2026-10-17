import type {SectionDrawing} from "./modelSection";
import {ambiguousSectionBoundary} from "./sectionBoundary";
type Point=number[];
const tau=Math.PI*2,norm=(a:number)=>(a%tau+tau)%tau,near=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6;
/** Analytic even/odd intersections of verified closed line/circle/arc boundaries.
 * Separate rings of the same part are handled together, so holes remain empty. */
export function sectionHatch(curves:SectionDrawing[],origin:number[],spacing:number,angle:number){
 const output:{key:string;partId:string;points:number[][]}[]=[],warnings:string[]=[],rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
 const rotate=(p:Point)=>[(p[0]-origin[0])*c+(p[1]-origin[1])*s,-(p[0]-origin[0])*s+(p[1]-origin[1])*c],restore=(x:number,y:number)=>[origin[0]+x*c-y*s,origin[1]+x*s+y*c,0];
 for(const partId of new Set(curves.map(g=>g.partId))){const group=curves.filter(g=>g.partId===partId),vertices:Point[]=[],degrees:number[]=[];let closed=true;
  if(group.some(g=>g.kind==="spline"||g.kind==="ellipse"||g.kind==="elliptic-arc")){warnings.push(`${partId}: ${group.some(g=>g.kind==="spline")?"spline":"ellipse"} cut hatch is unsupported; hatch omitted.`);continue;}
  for(const g of group){if(g.kind==="circle")continue;const p=g.params,points=g.kind==="line"?p.points as Point[]:[Number(p.startAngle),Number(p.endAngle)].map(a=>[(p.center as Point)[0]+Number(p.radius)*Math.cos(a),(p.center as Point)[1]+Number(p.radius)*Math.sin(a)]);
   for(const point of points){let i=vertices.findIndex(v=>near(v,point));if(i<0){i=vertices.length;vertices.push(point);degrees.push(0);}degrees[i]++;}
  }
  if(degrees.some(n=>n!==2)||ambiguousSectionBoundary(group))closed=false;
  const lines=group.filter(g=>g.kind==="line").map(g=>g.params.points as Point[]);
  for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){const [a,b]=lines[i],[p,q]=lines[j],u=[b[0]-a[0],b[1]-a[1]],v=[q[0]-p[0],q[1]-p[1]],cross=(x:Point,y:Point)=>x[0]*y[1]-x[1]*y[0],den=cross(u,v);if(Math.abs(den)<1e-12)continue;const w=[p[0]-a[0],p[1]-a[1]],t=cross(w,v)/den,z=cross(w,u)/den;if(t>1e-8&&t<1-1e-8&&z>1e-8&&z<1-1e-8)closed=false;}
  if(!closed){warnings.push(`${partId}: open/ambiguous cut boundary; hatch omitted.`);continue;}
  const rotated=group.map(g=>({g,points:g.kind==="line"?(g.params.points as Point[]).map(rotate):undefined,center:g.kind!=="line"?rotate(g.params.center as Point):undefined}));
  const limits=rotated.flatMap(({g,points,center})=>points?points.map(p=>p[1]):[center![1]-Number(g.params.radius),center![1]+Number(g.params.radius)]),lo=Math.min(...limits),hi=Math.max(...limits);
  if((hi-lo)/spacing>4000)throw Error("Section hatch exceeds 4,000 paper rows; increase spacing.");
  const part:typeof output=[];
  for(let row=Math.ceil(lo/spacing);row*spacing<hi-1e-9;row++){const y=row*spacing,xs:number[]=[];
   for(const {g,points,center} of rotated){if(points){const [a,b]=points;if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));continue;}
    const r=Number(g.params.radius),dy=(y-center![1])/r;if(Math.abs(dy)>=1-1e-10)continue;const a=Math.asin(dy);
    for(const theta of [norm(a),norm(Math.PI-a)]){if(g.kind==="arc"){const start=norm(Number(g.params.startAngle)-rad),span=Number(g.params.endAngle)-Number(g.params.startAngle),t=norm(theta-start),atStart=t<1e-8||tau-t<1e-8,atEnd=Math.abs(t-span)<1e-8;if(!(t>1e-8&&t<span-1e-8||atStart&&Math.cos(theta)>0||atEnd&&Math.cos(theta)<0))continue;}xs.push(center![0]+r*Math.cos(theta));}
   }
   xs.sort((a,b)=>a-b);if(xs.length%2){closed=false;break;}
   for(let i=0;i<xs.length;i+=2)if(xs[i+1]-xs[i]>1e-7)part.push({key:`hatch:${partId}:${row}:${i/2}`,partId,points:[restore(xs[i],y),restore(xs[i+1],y)]});
  }
  if(closed)output.push(...part);else warnings.push(`${partId}: ambiguous hatch intersections; hatch omitted.`);
  if(output.length>20000)throw Error("Section hatch exceeds 20,000 strokes; increase spacing.");
 }
 return {lines:output,warnings};
}
