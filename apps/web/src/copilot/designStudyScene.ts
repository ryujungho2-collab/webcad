import * as THREE from "three";
import {featureContract,type CadDocument} from "@agent-webcad/cad-document";
import {getWorldDrawingGeometry} from "../precision/worldGeometry";
import {worldDraftingGeometry} from "../precision/draftingGeometry";
import {getObjectTransform} from "../precision/objectTransform";
import {sourceMesh} from "../state/faceCutCommands";
import {WORK_PLANES,type Vec3,type WorkPlaneId} from "../precision/workPlane";
export type DesignPath={points:Vec3[];closed:boolean;fill?:string;objectId:string;solid?:boolean};
export type DesignScene={paths:DesignPath[];solid:boolean;ids:string[];omitted:string[]};
export type DesignView={id:string;label:string;paths:{points:[number,number][];closed:boolean;fill?:string;objectId:string}[];bounds:[number,number,number,number]};
/** Native CAD tessellation, never fabricated preview boxes. Raster sources are deliberately excluded. */
export async function readDesignScene(document:CadDocument,ids:string[],signal?:AbortSignal):Promise<DesignScene>{
 const unique=[...new Set(ids)];if(unique.length>32)throw Error("Visual studies show at most 32 selected/reference objects.");
 const result:DesignScene={paths:[],solid:false,ids:unique,omitted:[]};let vertices=0,triangles=0;
 for(const id of unique){signal?.throwIfAborted();const o=document.objects[id],f=Object.values(document.features).find(f=>f.output===id);if(!o||!f||!o.visible||!document.layers[o.layerId]?.visible){result.omitted.push(id);continue;}
  if(f.type==="drawing"){const g=getWorldDrawingGeometry(o,f);if(!g?.points?.length||["infinite-line","ray"].includes(g.kind)){result.omitted.push(id);continue;}result.paths.push({objectId:id,points:g.points,closed:g.closed,fill:g.closed?"#e3ebe2":undefined});vertices+=g.points.length;}
  else if(f.type==="drafting"){const g=worldDraftingGeometry(document,o,f);for(const l of g.lines){result.paths.push({objectId:id,points:l.points,closed:l.closed});vertices+=l.points.length;}}
  else if(featureContract(f).representation==="brep"){
   const mesh=await sourceMesh(f);signal?.throwIfAborted();triangles+=mesh.indices.length/3;if(triangles>8000)throw Error("The visual study exceeds 8000 CAD triangles. Select a smaller scope; geometry is not silently simplified.");
   const t=getObjectTransform(o,f),matrix=new THREE.Matrix4().compose(new THREE.Vector3(...t.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.rotation.map(THREE.MathUtils.degToRad) as Vec3)),new THREE.Vector3(...t.scale));
   const point=(i:number)=>new THREE.Vector3(mesh.positions[i*3],mesh.positions[i*3+1],mesh.positions[i*3+2]).applyMatrix4(matrix).toArray() as Vec3;
   for(let i=0;i<mesh.indices.length;i+=3){const p=[point(mesh.indices[i]),point(mesh.indices[i+1]),point(mesh.indices[i+2])],a=new THREE.Vector3(...p[1]).sub(new THREE.Vector3(...p[0])),b=new THREE.Vector3(...p[2]).sub(new THREE.Vector3(...p[0])),normal=a.cross(b).normalize(),brightness=Math.round(65+20*Math.abs(normal.dot(new THREE.Vector3(.3,-.4,.85))));result.paths.push({objectId:id,points:p,closed:true,fill:`hsl(155 16% ${brightness}%)`,solid:true});}result.solid=true;
  }else result.omitted.push(id);
  if(vertices>16000)throw Error("The visual study exceeds 16000 curve vertices. Select a smaller scope.");
 }
 return result;
}
export function projectDesignScenes(scenes:DesignScene[],plane:WorkPlaneId):DesignView[][]{
 const solid=scenes.some(s=>s.solid),frame=WORK_PLANES[plane];
 const bases=solid?[{id:"iso",label:"CAD isometric",project:(p:Vec3)=>[(p[0]-p[1])*Math.SQRT1_2,-(p[0]+p[1])/Math.sqrt(6)+p[2]*Math.sqrt(2/3),p[0]+p[1]+p[2]]},{id:"top",label:"CAD top / XY",project:(p:Vec3)=>[p[0],p[1],p[2]]},{id:"front",label:"CAD front / XZ",project:(p:Vec3)=>[p[0],p[2],-p[1]]}]:[{id:plane,label:`CAD ${plane} / curve sampling`,project:(p:Vec3)=>[p.reduce((s,v,i)=>s+v*frame.xAxis[i],0),p.reduce((s,v,i)=>s+v*frame.yAxis[i],0),0]}];
 const output=scenes.map(()=>[] as DesignView[]);
 for(const basis of bases){const projected=scenes.map(s=>s.paths.map(p=>({...p,points:p.points.map(basis.project)})).sort((a,b)=>a.points.reduce((s,p)=>s+p[2],0)/a.points.length-b.points.reduce((s,p)=>s+p[2],0)/b.points.length));
  const points=projected.flatMap(p=>p.flatMap(p=>p.points)),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);if(!points.length)continue;
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),size=Math.max(xmax-xmin,ymax-ymin,1)*1.14,cx=(xmin+xmax)/2,cy=(ymin+ymax)/2,bounds:[number,number,number,number]=[cx-size/2,cy-size/2,cx+size/2,cy+size/2];
  projected.forEach((rows,i)=>output[i].push({id:basis.id,label:basis.label,bounds,paths:rows.map(p=>({objectId:p.objectId,closed:p.closed,fill:p.fill,points:p.points.map(q=>[(q[0]-bounds[0])/size*300,(bounds[3]-q[1])/size*300])}))}));
 }
 return output;
}
export function designViewSvg(view:DesignView){return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 300 300"><rect width="300" height="300" fill="#f7f6f0"/>${view.paths.map(p=>`<polyline points="${p.points.map(q=>q.map(v=>v.toFixed(3)).join(",")).join(" ")}${p.closed&&p.points.length?" "+p.points[0].map(v=>v.toFixed(3)).join(","):""}" fill="${p.fill??"none"}" stroke="#385449" stroke-width="0.6"/>`).join("")}</svg>`;}
