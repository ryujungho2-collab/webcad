import {validateGeometryGraph,type GeometryNodeGraph,type GeometryNode} from "./GeometryNodes";
import {createPolygonMesh} from "./PolygonMeshOperations";
import {validateEditableMesh,type EditableMesh,type MeshVector} from "./EditableMesh";
import {evaluateMeshModifiers,type MeshStencil} from "./MeshModifiers";
import {add,sub,mul,dot,cross,unit,polygonNormal} from "./MeshTopology";
import {validateMeshIntersections} from "./MeshIntersection";

export type NodeMeshValue={kind:"mesh";mesh:EditableMesh;faceSources:Record<string,string[]>;vertexSources:Record<string,MeshStencil>};
export type NodeCurveValue={kind:"curve";points:MeshVector[];closed:boolean;source:string};
export type NodeInstancesValue={kind:"instances";geometry:NodeMeshValue;points:MeshVector[];scale:MeshVector;source:string};
export type GeometryNodeValue=NodeMeshValue|NodeCurveValue|NodeInstancesValue;
export type GeometryNodeResult={output:NodeMeshValue;nodes:{id:string;cached:boolean;elapsedMs:number;kind:GeometryNodeValue["kind"];vertices?:number;faces?:number}[];elapsedMs:number;bytes:number};
export const GEOMETRY_BUDGET={timeMs:4000,nodeTimeMs:1500,vertices:10000,faces:20000,bytes:16_000_000,instances:128,cacheBytes:16_000_000} as const;
type CacheEntry={value:GeometryNodeValue;bytes:number};
export class GeometryNodeEvaluator{
 private cache=new Map<string,CacheEntry>();private bytes=0;
 clear(){this.cache.clear();this.bytes=0;}
 evaluate(graph:GeometryNodeGraph,inputs:Record<string,NodeMeshValue>={},checkpoint:()=>void=()=>{}):GeometryNodeResult{
  const start=performance.now(),checked=validateGeometryGraph(graph);if(!checked.valid)throw Error(checked.errors.join(" "));
  const values=new Map<string,GeometryNodeValue>(),nodes:GeometryNodeResult["nodes"]=[],pending=new Map<string,CacheEntry>();let totalBytes=0;
  for(const id of checked.order){if(!checked.active.includes(id))continue;checkpoint();if(performance.now()-start>GEOMETRY_BUDGET.timeMs)throw Error("Graph time budget exceeded.");const n=graph.nodes.find(n=>n.id===id)!,incoming=Object.fromEntries(graph.links.filter(l=>l.to===id).map(l=>[l.input,values.get(l.from)!])),external=n.type==="group-input"?inputs[String(n.params.objectId)]:undefined;
   const key=JSON.stringify([n,incoming,external]),started=performance.now(),cached=this.cache.get(key);const value=cached?structuredClone(cached.value):evaluateNode(n,incoming,external);checkpoint();
   if(performance.now()-started>GEOMETRY_BUDGET.nodeTimeMs)throw Error(`Node ${id} time budget exceeded.`);const serialized=JSON.stringify(value),bytes=(serialized.length+key.length)*2;totalBytes+=serialized.length*2;if(bytes>GEOMETRY_BUDGET.bytes||totalBytes>GEOMETRY_BUDGET.bytes)throw Error("Graph memory estimate budget exceeded.");
   if(value.kind==="mesh"&&!validateEditableMesh(value.mesh))throw Error(`Invalid mesh at node ${id}.`);
   if(!cached)pending.set(key,{value:structuredClone(value),bytes});values.set(id,value);nodes.push({id,cached:!!cached,elapsedMs:performance.now()-started,kind:value.kind,...value.kind==="mesh"?{vertices:value.mesh.vertices.length,faces:value.mesh.faces.length}:{}});
  }
  const output=values.get(graph.output);if(output?.kind!=="mesh")throw Error("Group Output must evaluate to a mesh.");validateMeshIntersections(output.mesh,{timeMs:Math.min(GEOMETRY_BUDGET.nodeTimeMs,GEOMETRY_BUDGET.timeMs-(performance.now()-start))});checkpoint();
  for(const [key,entry] of pending){while(this.cache.size&&this.bytes+entry.bytes>GEOMETRY_BUDGET.cacheBytes){const first=this.cache.keys().next().value!;this.bytes-=this.cache.get(first)!.bytes;this.cache.delete(first);}this.cache.set(key,entry);this.bytes+=entry.bytes;}
  return {output:structuredClone(output),nodes,elapsedMs:performance.now()-start,bytes:totalBytes};
 }
}
export function nodeMeshValue(mesh:EditableMesh,source:string):NodeMeshValue{
 const result=evaluateMeshModifiers(mesh);return {kind:"mesh",mesh:result.mesh,faceSources:Object.fromEntries(result.mesh.faces.map(f=>[f.id,[`${source}:face:${result.faceSources[f.id]}`]])),vertexSources:Object.fromEntries(result.mesh.vertices.map(v=>[v.id,result.vertexStencils[v.id].map(s=>({id:`${source}:vertex:${s.id}`,weight:s.weight}))]))};
}
export function transformNodeMesh(value:NodeMeshValue,translation:MeshVector,rotation:MeshVector,scale:MeshVector):NodeMeshValue{
 const out=structuredClone(value),[rx,ry,rz]=rotation.map(n=>n*Math.PI/180);
 for(const v of out.mesh.vertices){let [x,y,z]=v.position.map((n,i)=>n*scale[i]);[x,y]=[x*Math.cos(rz)-y*Math.sin(rz),x*Math.sin(rz)+y*Math.cos(rz)];[x,z]=[x*Math.cos(ry)+z*Math.sin(ry),-x*Math.sin(ry)+z*Math.cos(ry)];[y,z]=[y*Math.cos(rx)-z*Math.sin(rx),y*Math.sin(rx)+z*Math.cos(rx)];v.position=[x+translation[0],y+translation[1],z+translation[2]];}return out;
}
function joinMeshes(values:NodeMeshValue[]):NodeMeshValue{
 const out:NodeMeshValue={kind:"mesh",mesh:{version:2,vertices:[],faces:[],edit:{enabled:false,mode:"face",ids:[]}},faceSources:{},vertexSources:{}};
 if(values.reduce((n,v)=>n+v.mesh.vertices.length,0)>10000||values.reduce((n,v)=>n+v.mesh.faces.length,0)>20000)throw Error("Join/realization geometry budget exceeded.");
 if(values.reduce((n,v)=>n+Object.values(v.vertexSources).reduce((sum,s)=>sum+s.length,0),0)>200000)throw Error("Join provenance memory budget exceeded.");
 for(const value of values){const map=new Map<string,string>();for(const v of value.mesh.vertices){const id=`v${out.mesh.vertices.length}`;map.set(v.id,id);out.mesh.vertices.push({id,position:[...v.position]});out.vertexSources[id]=structuredClone(value.vertexSources[v.id]);}for(const f of value.mesh.faces){const id=`f${out.mesh.faces.length}`;out.mesh.faces.push({id,vertices:f.vertices.map(id=>map.get(id)!)});out.faceSources[id]=[...value.faceSources[f.id]];}}
 return out;
}
function evaluateNode(node:GeometryNode,inputs:Record<string,GeometryNodeValue>,external?:NodeMeshValue):GeometryNodeValue{
 const p=node.params;const mesh=(key:string)=>{const v=inputs[key];if(v?.kind!=="mesh")throw Error(`Expected mesh at ${node.id}.${key}`);return v;},curve=(key:string)=>{const v=inputs[key];if(v?.kind!=="curve")throw Error(`Expected curve at ${node.id}.${key}`);return v;};
 switch(node.type){
  case "mesh-primitive":return nodeMeshValue(createPolygonMesh(Number(p.size),p.shape as "cube"|"ngon",Number(p.sides)),`node:${node.id}`);
  case "group-input":if(!external)throw Error(`Missing mesh Group Input ${String(p.objectId)}`);return structuredClone(external);
  case "group-output":return structuredClone(mesh("geometry"));
  case "transform":return transformNodeMesh(mesh("geometry"),p.translation as MeshVector,p.rotation as MeshVector,p.scale as MeshVector);
  case "join":return joinMeshes([mesh("a"),mesh("b")]);
  case "subdivision":{const source=mesh("geometry"),control=structuredClone(source.mesh);control.modifiers=[{id:"node-subdivision",type:"catmull-clark",enabled:true,level:Number(p.level),boundary:p.boundary as "smooth"|"fixed",creaseEdges:[]}];const result=evaluateMeshModifiers(control);let provenanceWeights=0;
   return {kind:"mesh",mesh:result.mesh,faceSources:Object.fromEntries(result.mesh.faces.map(f=>[f.id,source.faceSources[result.faceSources[f.id]]])),vertexSources:Object.fromEntries(result.mesh.vertices.map(v=>{const weights=new Map<string,number>();for(const s of result.vertexStencils[v.id])for(const original of source.vertexSources[s.id]){weights.set(original.id,(weights.get(original.id)??0)+s.weight*original.weight);if(weights.size>10000)throw Error("Node provenance vertex budget exceeded.");}provenanceWeights+=weights.size;if(provenanceWeights>200000)throw Error("Node provenance memory budget exceeded.");return [v.id,[...weights].map(([id,weight])=>({id,weight}))];}))};}
  case "curve-primitive":{const points:MeshVector[]=p.kind==="circle"?Array.from({length:Number(p.segments)},(_,i)=>[Number(p.radius)*Math.cos(i*2*Math.PI/Number(p.segments)),Number(p.radius)*Math.sin(i*2*Math.PI/Number(p.segments)),0]):structuredClone(p.points as MeshVector[]),closed=p.kind==="circle"||p.closed===true;for(let i=0;i<points.length-(closed?0:1);i++)if(Math.hypot(...sub(points[i],points[(i+1)%points.length]))<1e-8)throw Error("Curve has a zero-length segment.");return {kind:"curve",points,closed,source:`node:${node.id}`};}
  case "resample-curve":{const c=curve("curve"),count=Number(p.count);if(c.closed&&count<3)throw Error("Closed resampling requires at least three points.");const points=c.closed?[...c.points,c.points[0]]:c.points,lengths=points.slice(1).map((q,i)=>Math.hypot(...sub(q,points[i]))),total=lengths.reduce((s,n)=>s+n,0);if(total<1e-8)throw Error("Empty curve length.");return {...c,points:Array.from({length:count},(_,i)=>{let d=total*i/(c.closed?count:count-1),segment=0;while(segment<lengths.length-1&&d>lengths[segment])d-=lengths[segment++];return add(points[segment],mul(sub(points[segment+1],points[segment]),d/lengths[segment]));})};}
  case "curve-to-mesh":return sweepCurve(curve("path"),curve("profile"),p.caps===true,node.id);
  case "instance-on-points":{const points=curve("points").points;if(points.length>128)throw Error("Instance count budget exceeded.");const geometry=mesh("geometry");if(points.length*geometry.mesh.vertices.length>10000||points.length*geometry.mesh.faces.length>20000)throw Error("Instance realization budget exceeded.");return {kind:"instances",geometry:structuredClone(geometry),points:structuredClone(points),scale:p.scale as MeshVector,source:`node:${node.id}`};}
  case "realize-instances":{const v=inputs.instances;if(v?.kind!=="instances")throw Error("Expected instances.");return joinMeshes(v.points.map((point,i)=>{const instance=transformNodeMesh(v.geometry,point,[0,0,0],v.scale);for(const key of Object.keys(instance.faceSources))instance.faceSources[key]=[...instance.faceSources[key],`${v.source}:point:${i}`];return instance;}));}
 }
}
function sweepCurve(path:NodeCurveValue,profile:NodeCurveValue,caps:boolean,nodeId:string):NodeMeshValue{
 if(path.closed||!profile.closed||profile.points.length<3||profile.points.length>64||profile.points.some(p=>Math.abs(p[2])>1e-8))throw Error("Curve to Mesh supports an open polyline path and one closed XY profile of 3–64 points.");
 if(polygonNormal(profile.points)[2]<.999999)throw Error("Profile must have counter-clockwise XY winding.");
 const check:EditableMesh={version:2,vertices:profile.points.map((position,i)=>({id:`v${i}`,position})),faces:[{id:"f",vertices:profile.points.map((_,i)=>`v${i}`)}],edit:{enabled:false,mode:"face",ids:[]}};if(!validateEditableMesh(check))throw Error("Invalid sweep profile.");
 const tangents=path.points.map((_,i)=>i===0?unit(sub(path.points[1],path.points[0])):i===path.points.length-1?unit(sub(path.points[i],path.points[i-1])):unit(add(unit(sub(path.points[i],path.points[i-1])),unit(sub(path.points[i+1],path.points[i])))));
 const m:EditableMesh={version:2,vertices:[],faces:[],edit:{enabled:false,mode:"face",ids:[]}},n=profile.points.length;let x=unit(cross(Math.abs(tangents[0][2])<.9?[0,0,1]:[0,1,0],tangents[0]));
 for(let i=0;i<path.points.length;i++){const tangent=tangents[i];if(i){if(dot(tangents[i-1],tangent)<-.99)throw Error("Sweep tangent reversal is unsupported.");const axis=cross(tangents[i-1],tangent),s=Math.hypot(...axis),c=dot(tangents[i-1],tangent);if(s>1e-10){const u=mul(axis,1/s);x=add(add(mul(x,c),mul(cross(u,x),s)),mul(u,dot(u,x)*(1-c)));}}x=unit(sub(x,mul(tangent,dot(x,tangent))));const y=cross(tangent,x);for(let j=0;j<n;j++)m.vertices.push({id:`v${i*n+j}`,position:add(path.points[i],add(mul(x,profile.points[j][0]),mul(y,profile.points[j][1])))});}
 for(let i=0;i<path.points.length-1;i++)for(let j=0;j<n;j++)m.faces.push({id:`f${m.faces.length}`,vertices:[`v${i*n+j}`,`v${i*n+(j+1)%n}`,`v${(i+1)*n+(j+1)%n}`,`v${(i+1)*n+j}`]});
 if(caps){m.faces.push({id:`f${m.faces.length}`,vertices:Array.from({length:n},(_,j)=>`v${n-1-j}`)});m.faces.push({id:`f${m.faces.length}`,vertices:Array.from({length:n},(_,j)=>`v${(path.points.length-1)*n+j}`)});}
 if(!validateEditableMesh(m))throw Error("Sweep produced invalid topology or exceeded budget.");const result=nodeMeshValue(m,`node:${nodeId}`);for(const id of Object.keys(result.faceSources))result.faceSources[id].push(path.source,profile.source);return result;
}
