import type {SectionCurve,SectionPoint} from "./section";
export type ClassifiedProjectionCurve={sourceIndex:number;hidden:boolean;edgeClass:"sharp"|"outline";curve:SectionCurve};
const tau=Math.PI*2,norm=(v:number)=>(v%tau+tau)%tau,q=(v:number)=>Math.round(v*1e9)/1e9;
/** Canonical positive paper orientation; preserves the exact locus and finite domain. */
export function canonicalProjectionCurve(curve:SectionCurve):SectionCurve{
 if(curve.kind!=="ellipse")return curve;
 let u=[...curve.axisU] as SectionPoint,v=[...curve.axisV] as SectionPoint,start=curve.startParam;
 if(u[0]*v[1]-u[1]*v[0]<0){v=v.map(x=>-x) as SectionPoint;start=-start-curve.sweep;}
 if(u[0]<-1e-12||Math.abs(u[0])<=1e-12&&u[1]<0){u=u.map(x=>-x) as SectionPoint;v=v.map(x=>-x) as SectionPoint;start+=Math.PI;}
 return {...curve,axisU:u,axisV:v,startParam:Math.abs(curve.sweep-tau)<1e-9?0:norm(start)};
}
export function projectionCurveKey(c:SectionCurve){c=canonicalProjectionCurve(c);if(c.kind==="spline")return JSON.stringify(c);if(c.kind==="line")return JSON.stringify({kind:c.kind,points:c.points.map(p=>p.map(q)).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))});if(c.kind==="ellipse")return JSON.stringify({...c,center:c.center.map(q),axisU:c.axisU.map(q),axisV:c.axisV.map(q),startParam:q(c.startParam),sweep:q(c.sweep)});return JSON.stringify({kind:c.kind,center:c.center.map(q),radius:q(c.radius),...c.kind==="arc"?{points:c.points.map(p=>p.map(q)),sweep:q(c.sweep)}:{}});}
/** Union intervals on the same analytic conic within one source/visibility class.
 * It never joins across an occluded gap or matches a nearby source curve. */
export function mergeProjectionConics(input:ClassifiedProjectionCurve[]):ClassifiedProjectionCurve[]{
 const lines:ClassifiedProjectionCurve[]=[],groups=new Map<string,{entries:ClassifiedProjectionCurve[];intervals:number[][];base:Exclude<SectionCurve,{kind:"spline"}>}>();
 for(const entry of input){const c=canonicalProjectionCurve(entry.curve);if(c.kind==="line"||c.kind==="spline"){const key=projectionCurveKey(c),old=lines.find(e=>e.sourceIndex===entry.sourceIndex&&e.hidden===entry.hidden&&projectionCurveKey(e.curve)===key);if(old){if(entry.edgeClass==="outline")old.edgeClass="outline";}else lines.push({...entry,curve:c});continue;}
  let start=0,span=tau;
  if(c.kind==="ellipse"){start=c.startParam;span=c.sweep;}else if(c.kind==="arc"){const a=Math.atan2(c.points[0][1]-c.center[1],c.points[0][0]-c.center[0]),b=Math.atan2(c.points[1][1]-c.center[1],c.points[1][0]-c.center[0]),m=Math.atan2(c.points[2][1]-c.center[1],c.points[2][0]-c.center[0]);start=norm(a);span=norm(b-a);if(norm(m-a)>span+1e-9){start=norm(b);span=tau-span;}}
  const key=JSON.stringify([entry.sourceIndex,entry.hidden,c.center.map(q),c.kind==="ellipse"?[c.axisU.map(q),c.axisV.map(q)]:q(c.radius)]);let group=groups.get(key);if(!group){group={entries:[],intervals:[],base:c};groups.set(key,group);}group.entries.push(entry);const end=start+span;if(end>tau){group.intervals.push([start,tau],[0,end-tau]);}else group.intervals.push([start,end]);
 }
 for(const g of groups.values()){const c=g.base;if(c.kind==="line")continue;const radius=c.kind==="ellipse"?Math.max(Math.hypot(...c.axisU),Math.hypot(...c.axisV)):c.radius,eps=Math.min(1e-9,1e-7/Math.max(radius,1)),merged:number[][]=[];
  for(const interval of g.intervals.sort((a,b)=>a[0]-b[0])){const last=merged.at(-1);if(last&&interval[0]<=last[1]+eps)last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}
  if(merged.length>1&&merged[0][0]<=eps&&merged.at(-1)![1]>=tau-eps){const first=merged.shift()!;merged.at(-1)![1]=tau+first[1];}
  const edgeClass=g.entries.some(e=>e.edgeClass==="outline")?"outline":"sharp",source=g.entries[0];
  for(const [start,end] of merged){const sweep=end-start;let curve:SectionCurve;
   if(c.kind==="ellipse")curve={...c,startParam:sweep>=tau-eps?0:start,sweep:sweep>=tau-eps?tau:sweep};else{const point=(t:number):SectionPoint=>[c.center[0]+c.radius*Math.cos(t),c.center[1]+c.radius*Math.sin(t),0];curve={kind:sweep>=tau-eps?"circle":"arc",center:c.center,radius:c.radius,points:[point(start),point(end),point((start+end)/2)],sweep:sweep>=tau-eps?tau:sweep};}
   lines.push({...source,edgeClass,curve});
  }
 }
 return lines;
}
