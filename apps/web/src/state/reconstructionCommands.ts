import {analyzePlanarMesh,MeshSurfaceIndex,meshTriangles,meshContentSignature,planarContains,type CadDocument,type EditableMesh,type MeshVector,type ReconstructionOptions,type PlanarAnalysis,type PlanarDefinition} from "@agent-webcad/cad-document";
import type {CommandBus} from "@agent-webcad/cad-commands";
import {Vector3} from "three";
import {hybridSource} from "./hybridReferences";
import {buildPrimitiveMesh,inspectSolid,meshPositionsBounds} from "../cad/kernelGeometryService";
import type {MeshData} from "../cad/kernelProtocol";
import type {CooperativeTask} from "./cooperativeTask";
export function reconstructionSource(document:CadDocument,id:string,options:ReconstructionOptions){
 const source=hybridSource(document,id),mesh=structuredClone(source.mesh);mesh.vertices.forEach(v=>v.position=new Vector3(...v.position).applyMatrix4(source.matrix).toArray());
 return {mesh,fingerprint:source.fingerprint,analysis:analyzePlanarMesh(mesh,options)};
}
function renderTriangles(data:MeshData):EditableMesh {
 if(data.positions.length/3>20000||data.indices.length/3>20000)throw Error("Reconstructed tessellation quality budget exceeded (20,000 vertices/triangles).");
 return {version:1,vertices:Array.from({length:data.positions.length/3},(_,i)=>({id:`v${i}`,position:[data.positions[i*3],data.positions[i*3+1],data.positions[i*3+2]]})),faces:Array.from({length:data.indices.length/3},(_,i)=>({id:`f${i}`,vertices:Array.from(data.indices.slice(i*3,i*3+3),id=>`v${id}`)})),edit:{enabled:false,mode:"face",ids:[]}};
}
/** Distance to planar BRep tessellation, sampled in both directions; not Hausdorff certification. */
function sampledDistances(mesh:EditableMesh,target:MeshSurfaceIndex){const positions=new Map(mesh.vertices.map(v=>[v.id,v.position])),points=[...mesh.vertices.map(v=>v.position),...meshTriangles(mesh).flatMap(t=>{const p=t.vertices.map(id=>positions.get(id)!);return [[0,1,2].map(i=>(p[0][i]+p[1][i]+p[2][i])/3) as MeshVector,...p.map((v,j)=>v.map((n,i)=>(n+p[(j+1)%3][i])/2) as MeshVector)];})],step=Math.max(1,Math.ceil(points.length/512)),distances=points.filter((_,i)=>i%step===0).map(p=>target.nearest(p).distance);return {max:Math.max(...distances),rms:Math.sqrt(distances.reduce((s,d)=>s+d*d,0)/distances.length),samples:distances.length};}
export function reconstructionFaceMap(data:MeshData,definition:PlanarDefinition){
 if(!data.faces||data.faces.length!==definition.regions.length||new Set(data.faces.map(f=>f.key)).size!==data.faces.length)throw Error("BRep face count/identity is not uniquely preserved.");
 const map:Record<string,{brepFaceKey:string;sourceFaceIds:string[]}>={};
 for(const f of data.faces){const points=Array.from(data.indices.slice(f.start*3,(f.start+f.count)*3),i=>new Vector3(data.positions[i*3],data.positions[i*3+1],data.positions[i*3+2]));if(points.length<3)throw Error("Empty reconstructed face.");
  const center=points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1/3),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
  const matches=definition.regions.filter(r=>{const n=new Vector3(...r.normal),o=new Vector3(...r.origin);return normal.dot(n)>1-1e-5&&points.every(p=>Math.abs(p.clone().sub(o).dot(n))<=definition.tolerance*4+1e-7)&&planarContains(center.toArray(),r.loops[0],r.normal)&&!r.loops.slice(1).some(loop=>planarContains(center.toArray(),loop,r.normal));});
  if(matches.length!==1||map[matches[0].id])throw Error("Ambiguous region-to-BRep face correspondence; no nearest-face mapping.");const r=matches[0];map[r.id]={brepFaceKey:f.key,sourceFaceIds:[...r.sourceFaceIds]};
 }return map;
}
export async function evaluateReconstruction(document:CadDocument,id:string,options:ReconstructionOptions,task:CooperativeTask={}){
 task.signal?.throwIfAborted();const source=reconstructionSource(document,id,options),a=source.analysis;if(!a.solidCandidate)throw Error(a.rejection);
 const params={kind:"planar-reconstruction",reconstruction:a.definition},data=await buildPrimitiveMesh(params,{signal:task.signal});task.signal?.throwIfAborted();const measurement=await inspectSolid({params},{signal:task.signal});task.signal?.throwIfAborted();
 if(measurement.validity!=="valid"||!(measurement.volume!>0))throw Error("OpenCascade did not certify a positive-volume solid.");
 const target=renderTriangles(data),forward=sampledDistances(source.mesh,new MeshSurfaceIndex(target)),reverse=sampledDistances(target,new MeshSurfaceIndex(source.mesh)),sampledMaxDistance=Math.max(forward.max,reverse.max),sampledRmsDistance=Math.sqrt((forward.rms**2*forward.samples+reverse.rms**2*reverse.samples)/(forward.samples+reverse.samples));
 if(!Number.isFinite(sampledMaxDistance)||sampledMaxDistance>a.definition.tolerance*4+1e-7)throw Error("Reconstructed sampled surface deviation exceeds 4× effective tolerance.");
 const faceMap=reconstructionFaceMap(data,a.definition),bounds=meshPositionsBounds(data.positions);if(!bounds)throw Error("Invalid reconstructed bounds.");
 const report={version:1,method:"merged-planar-regions",classification:a.mergedTriangles>0?"merged-planar":"faceted",mergedTriangles:a.mergedTriangles,...a.definition.sharedTopology?{healing:a.definition.sharedTopology.report}:{},sourceObjectId:id,sourceGeometryId:document.objects[id].geometryId,sourceDocumentId:document.id,sourceRevision:document.revision,sourceFingerprint:source.fingerprint,options:{...options},effectiveTolerance:a.definition.tolerance,sewingTolerance:2*a.definition.tolerance,sampledAcceptance:4*a.definition.tolerance+1e-7,sourceTriangles:a.triangleCount,sourceFaces:source.mesh.faces.length,brepFaces:data.faces!.length,components:a.components,shellClosed:true,manifold:true,winding:"outward",kernelValidity:"valid",kernelSelfInterference:"valid",sourceArea:a.sourceArea,resultArea:measurement.area!,absoluteAreaDifference:Math.abs(measurement.area!-a.sourceArea),relativeAreaDifference:Math.abs(measurement.area!-a.sourceArea)/a.sourceArea,sourceVolume:a.sourceSignedVolume,resultVolume:measurement.volume!,absoluteVolumeDifference:Math.abs(measurement.volume!-a.sourceSignedVolume),relativeVolumeDifference:Math.abs(measurement.volume!-a.sourceSignedVolume)/a.sourceSignedVolume,sampledMaxDistance,sampledRmsDistance,sourceToBrep:forward,brepToSource:reverse,faceMap,definitionFingerprint:meshContentSignature(a.definition),distancePolicy:"Bidirectional samples of vertices, triangle centroids and edge midpoints (≤512 per direction) to planar BRep tessellation. Approximate, not certified Hausdorff.",losses:["original per-triangle topology","editable mesh modifiers/history","unrecovered design intent and constraints"]};
 return {params:{...params,reconstructionReceipt:report,bounds},data,analysis:a,report};
}
export function registerReconstructionCommands(bus:CommandBus,document:CadDocument,task:CooperativeTask={}){
 bus.registerHandler("reconstruct-planar-mesh",async command=>{
  if(command.type!=="reconstruct-planar-mesh")return;
  const source=document.objects[command.objectId],layer=source&&document.layers[source.layerId];if(!source?.visible||!layer?.visible||layer.locked)throw Error("Select a visible unlocked Mesh.");
  const id=command.id??`reconstructed-${crypto.randomUUID()}`,fid=`feature-${id}`;if(document.objects[id]||document.features[fid])throw Error("Reconstruction output ID already exists.");
  const result=await evaluateReconstruction(document,command.objectId,command.options,task);task.signal?.throwIfAborted();
  document.objects[id]={id,geometryId:`geometry-${id}`,name:`${source.name} · ${result.report.brepFaces} planar BRep faces`,visible:true,layerId:source.layerId,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
  document.features[fid]={id:fid,type:"primitive",inputs:[],dependencyMode:"snapshot",output:id,params:result.params};document.rootObjects.push(id);layer.objectIds.push(id);document.revision++;return {accepted:true,createdIds:[id]};
 });
}

export function reconstructionSnapshotStatus(document:CadDocument,objectId:string){
 const object=document.objects[objectId],feature=Object.values(document.features).find(f=>f.output===objectId),r=feature?.params.reconstructionReceipt as {sourceObjectId:string;sourceDocumentId:string;sourceGeometryId:string;sourceFingerprint:string}|undefined;
 if(!object||!r)throw Error("Reconstruction result not found.");let sourceMatches=false;try{sourceMatches=r.sourceDocumentId===document.id&&document.objects[r.sourceObjectId]?.geometryId===r.sourceGeometryId&&hybridSource(document,r.sourceObjectId).fingerprint===r.sourceFingerprint;}catch{}
 const t=object.transform,resultPlacementMatches=!(t?.translation??[0,0,0]).some(n=>n!==0)&&!(t?.rotation??[0,0,0]).some(n=>n!==0)&&!(t?.scale??[1,1,1]).some(n=>n!==1);
 return {sourceMatches,resultPlacementMatches,qualityCurrent:sourceMatches&&resultPlacementMatches};
}
