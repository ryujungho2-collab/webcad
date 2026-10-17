import {cropSpline} from "./splineGeometry";
import type {CadSpline} from "@agent-webcad/cad-document";
import type {CadEllipse,ModelSection} from "@agent-webcad/cad-document";
import {ellipsePoint} from "./ellipseGeometry";
import {worldToPlane,WORK_PLANES,type Vec3} from "./workPlane";
export const modelPlaneNormal=(basis:"XY"|"XZ"|"YZ")=>WORK_PLANES[basis].normal.map(Math.abs) as Vec3;
export type SectionDrawing={kind:"spline"|"line"|"circle"|"arc"|"ellipse"|"elliptic-arc";params:Record<string,unknown>;sourceKey:string;partId:string};
const fingerprint=(text:string)=>{let h=14695981039346656037n;for(let i=0;i<text.length;i++)h=BigInt.asUintN(64,(h^BigInt(text.charCodeAt(i)))*1099511628211n);return h.toString(16);};
const tau=Math.PI*2,norm=(v:number)=>(v%tau+tau)%tau;
/** Analytic clipping in source-plane mm, before paper scale. */
export function cropSectionGeometry(g:Omit<SectionDrawing,"sourceKey"|"partId">,range?:ModelSection["range"]):typeof g[]{
 if(!range)return [g];
 if(g.kind==="spline")return cropSpline(g.params as CadSpline,range).map(params=>({kind:"spline",params}));const [xmin,ymin,xmax,ymax]=range;
 if(g.kind==="line"){
  const [a,b]=g.params.points as Vec3[],d=[b[0]-a[0],b[1]-a[1]];let lo=0,hi=1;
  for(const [p,q] of [[-d[0],a[0]-xmin],[d[0],xmax-a[0]],[-d[1],a[1]-ymin],[d[1],ymax-a[1]]]){if(Math.abs(p)<1e-12){if(q<0)return [];}else if(p<0)lo=Math.max(lo,q/p);else hi=Math.min(hi,q/p);}
  if(hi-lo<1e-8)return [];return [{kind:"line",params:{points:[lo,hi].map(t=>[a[0]+d[0]*t,a[1]+d[1]*t,0])}}];
 }
 if(g.kind==="ellipse"||g.kind==="elliptic-arc"){
  const input=g.params as CadEllipse,e=input.sweep<0?{...input,axisV:input.axisV.map(v=>-v) as Vec3,startParam:-input.startParam,sweep:-input.sweep}:input,cuts=[0,e.sweep],add=(t:number)=>{const p=norm(t-e.startParam);if(p>1e-9&&p<e.sweep-1e-9)cuts.push(p);};
  for(const [axis,values] of [[0,[xmin,xmax]],[1,[ymin,ymax]]] as const){const r=Math.hypot(e.axisU[axis],e.axisV[axis]),phase=Math.atan2(e.axisV[axis],e.axisU[axis]);if(r<1e-12)continue;for(const bound of values){const q=(bound-e.center[axis])/r;if(Math.abs(q)<=1+1e-12){const a=Math.acos(Math.max(-1,Math.min(1,q)));add(phase+a);add(phase-a);}}}
  const sorted=[...new Set(cuts.map(t=>Number(t.toFixed(12))))].sort((a,b)=>a-b),result:typeof g[]=[];
  for(let i=0;i<sorted.length-1;i++){const a=sorted[i],b=sorted[i+1];if(b-a<1e-9)continue;const p=ellipsePoint(e,e.startParam+(a+b)/2);if(p[0]>=xmin-1e-8&&p[0]<=xmax+1e-8&&p[1]>=ymin-1e-8&&p[1]<=ymax+1e-8)result.push({kind:b-a>tau-1e-8?"ellipse":"elliptic-arc",params:{...e,startParam:e.startParam+a,sweep:b-a}});}
  // A tangent crop boundary does not split a retained interval; a closed
  // curve's parameter seam is not a physical endpoint either.
  const joined:typeof result=[];for(const piece of result){const previous=joined.at(-1);if(previous&&Math.abs(Number(previous.params.startParam)+Number(previous.params.sweep)-Number(piece.params.startParam))<1e-9){previous.params.sweep=Number(previous.params.sweep)+Number(piece.params.sweep);previous.kind=Number(previous.params.sweep)>tau-1e-8?"ellipse":"elliptic-arc";}else joined.push(piece);}
  if(Math.abs(e.sweep-tau)<1e-8&&joined.length>1){const first=joined[0],last=joined.at(-1)!;if(Math.abs(Number(first.params.startParam)-e.startParam)<1e-9&&Math.abs(Number(last.params.startParam)+Number(last.params.sweep)-e.startParam-e.sweep)<1e-9){last.params.sweep=Number(last.params.sweep)+Number(first.params.sweep);joined.shift();}}
  return joined;
 }
 const c=g.params.center as Vec3,r=Number(g.params.radius),start=g.kind==="circle"?0:Number(g.params.startAngle),span=g.kind==="circle"?tau:Number(g.params.endAngle)-start,cuts=[0,span];
 const add=(a:number)=>{const t=norm(a-start);if(t>1e-9&&t<span-1e-9)cuts.push(t);};
 for(const x of [xmin,xmax])if(Math.abs((x-c[0])/r)<=1){const a=Math.acos((x-c[0])/r);add(a);add(-a);}
 for(const y of [ymin,ymax])if(Math.abs((y-c[1])/r)<=1){const a=Math.asin((y-c[1])/r);add(a);add(Math.PI-a);}
 const sorted=[...new Set(cuts)].sort((a,b)=>a-b),result:typeof g[]=[];
 for(let i=0;i<sorted.length-1;i++){const a=start+sorted[i],b=start+sorted[i+1],m=(a+b)/2,x=c[0]+r*Math.cos(m),y=c[1]+r*Math.sin(m);if(x>=xmin-1e-8&&x<=xmax+1e-8&&y>=ymin-1e-8&&y<=ymax+1e-8)result.push({kind:b-a>tau-1e-8?"circle":"arc",params:{center:c,radius:r,...(b-a>tau-1e-8?{}:{startAngle:a,endAngle:b})}});}
 return result;
}
type SectionInput=({kind:"spline"}&CadSpline)|({kind:"ellipse"}&CadEllipse)|{kind:"line";points:[Vec3,Vec3]}|{kind:"circle"|"arc";center:Vec3;radius:number;points:[Vec3,Vec3,Vec3];sweep:number};
export function sectionDrawingGeometry(view:ModelSection,partId:string,curves:SectionInput[]):SectionDrawing[]{
 const result:SectionDrawing[]=[],plane=WORK_PLANES[view.basis];
  const drawings=curves.map(curve=>{
   if(curve.kind==="spline")return {kind:"spline" as const,params:{...curve,controlPoints:curve.controlPoints.map(p=>[...worldToPlane(p,plane),0])}};
   if(curve.kind==="line")return {kind:"line" as const,params:{points:curve.points.map(p=>[...worldToPlane(p,plane),0])}};
   if(curve.kind==="ellipse"){const vector=(p:Vec3)=>[p.reduce((s,v,i)=>s+v*plane.xAxis[i],0),p.reduce((s,v,i)=>s+v*plane.yAxis[i],0),0] as Vec3;return {kind:Math.abs(curve.sweep-tau)<1e-8?"ellipse" as const:"elliptic-arc" as const,params:{center:[...worldToPlane(curve.center,plane),0],axisU:vector(curve.axisU),axisV:vector(curve.axisV),startParam:curve.startParam,sweep:curve.sweep}};}
   const c=worldToPlane(curve.center,plane),p=curve.points.map(p=>worldToPlane(p,plane)),angle=(p:number[])=>Math.atan2(p[1]-c[1],p[0]-c[0]);let start=norm(angle(p[0])),span=curve.sweep;
   if(curve.kind==="arc"){const end=norm(angle(p[1])),mid=norm(angle(p[2])-start);span=norm(end-start);if(mid>span+1e-8){start=end;span=tau-span;}}
   return {kind:curve.kind,params:{center:[...c,0],radius:curve.radius,...(curve.kind==="arc"?{startAngle:start,endAngle:start+span}:{})}};
  });
  // Sort exact analytic geometry independently of kernel explorer order.
  const all=drawings.flatMap(g=>g.kind==="spline"?g.params.controlPoints as number[][]:g.kind==="line"?g.params.points as number[][]:[g.params.center as number[]]),min=[0,1].map(i=>Math.min(...all.map(p=>p[i]))),max=[0,1].map(i=>Math.max(...all.map(p=>p[i])));
  const descriptor=(g:typeof drawings[number])=>{const pts=g.kind==="spline"?g.params.controlPoints as number[][]:g.kind==="line"?g.params.points as number[][]:[g.params.center as number[]];const normalized=pts.map(p=>p.slice(0,2).map((v,i)=>Number(((v-min[i])/Math.max(max[i]-min[i],1e-9)).toFixed(6)))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return `${g.kind}:${JSON.stringify(normalized)}${g.kind==="spline"?`:${JSON.stringify([g.params.degree,g.params.knots,g.params.weights,g.params.domain])}`:g.kind==="arc"?`:${Number(g.params.startAngle).toFixed(9)}:${Number(g.params.endAngle).toFixed(9)}`:g.kind==="elliptic-arc"?`:${Number(g.params.startParam).toFixed(6)}:${Number(g.params.sweep).toFixed(6)}`:""}`;};
  const sorted=drawings.map(g=>({g,key:descriptor(g)})).sort((a,b)=>a.key.localeCompare(b.key));
  if(new Set(sorted.map(g=>g.key)).size!==sorted.length)throw Error("Ambiguous coincident section edges; explicitly choose a simpler source.");
  for(const {g,key} of sorted)for(const [index,piece] of cropSectionGeometry(g,view.range).entries()){
   const params:Record<string,unknown>={...piece.params,workPlane:"XY"};if(piece.kind==="spline")params.controlPoints=(params.controlPoints as number[][]).map(p=>[view.origin[0]+p[0]*view.scale,view.origin[1]+p[1]*view.scale,0]);else if(piece.kind==="line")params.points=(params.points as number[][]).map(p=>[view.origin[0]+p[0]*view.scale,view.origin[1]+p[1]*view.scale,0]);else{const c=params.center as number[];params.center=[view.origin[0]+c[0]*view.scale,view.origin[1]+c[1]*view.scale,0];if(piece.kind==="ellipse"||piece.kind==="elliptic-arc"){params.axisU=(params.axisU as number[]).map(x=>x*view.scale);params.axisV=(params.axisV as number[]).map(x=>x*view.scale);}else params.radius=Number(params.radius)*view.scale;}
   result.push({kind:piece.kind,params,sourceKey:`${partId}:${piece.kind==="spline"?`spline:${fingerprint(key)}`:key}:crop:${index}:${piece.kind}`,partId});
  }
 return result;
}
