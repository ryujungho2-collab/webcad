import {CadEngine} from "../runtime/CadEngine";
import type {SectionPoint} from "./section";
type Bounds=[number,number,number,number];
/** Only proven disjoint orthographic boxes separate global occlusion groups.
 * Void/open/uncertain bounds fall back to the complete assembly. */
export async function projectionGroups(shapes:any[],normal:SectionPoint,xAxis:SectionPoint):Promise<number[][]>{
 const all=()=>[shapes.map((_,i)=>i)];if(shapes.length<2||shapes.length>4096)return all();
 const nl=Math.hypot(...normal);if(!Number.isFinite(nl)||nl<1e-12)return all();const n=normal.map(v=>v/nl),dot=xAxis.reduce((sum,v,i)=>sum+v*n[i],0),x=xAxis.map((v,i)=>v-dot*n[i]),xl=Math.hypot(...x);if(!Number.isFinite(xl)||xl<1e-12)return all();for(let i=0;i<3;i++)x[i]/=xl;
 const y=[n[1]*x[2]-n[2]*x[1],n[2]*x[0]-n[0]*x[2],n[0]*x[1]-n[1]*x[0]],bounds:Bounds[]=[],{oc}=await CadEngine.create();
 try{for(const shape of shapes){const box=new oc.Bnd_Box_1();let a:any,b:any;
  try{oc.BRepBndLib.AddOptimal(shape,box,false,true);if(box.IsVoid()||box.IsOpen())return all();a=box.CornerMin();b=box.CornerMax();const lo=[a.X(),a.Y(),a.Z()],hi=[b.X(),b.Y(),b.Z()],project=(axis:number[])=>[axis.reduce((sum,v,i)=>sum+v*(v>=0?lo[i]:hi[i]),0),axis.reduce((sum,v,i)=>sum+v*(v>=0?hi[i]:lo[i]),0)],u=project(x),v=project(y),flat=[u[0],v[0],u[1],v[1]] as Bounds;if(!flat.every(Number.isFinite)||Math.max(...flat.map(Math.abs))*Number.EPSILON*64>1e-7)return all();bounds.push(flat);
  }finally{b?.delete();a?.delete();box.delete();}
 }}catch{return all();}
 const parent=shapes.map((_,i)=>i),find=(i:number):number=>parent[i]===i?i:parent[i]=find(parent[i]);
 for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
  const a=bounds[i],b=bounds[j],eps=1e-6+32*Number.EPSILON*Math.max(...a.map(Math.abs),...b.map(Math.abs));
  if(a[0]<=b[2]+eps&&b[0]<=a[2]+eps&&a[1]<=b[3]+eps&&b[1]<=a[3]+eps)parent[find(j)]=find(i);
 }
 const groups=new Map<number,number[]>();for(let i=0;i<shapes.length;i++){const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root)!.push(i);}return [...groups.values()];
}
