import {meshContentSignature,validHybridFeature,validateEditableMesh,validateMeshIntersections,meshEdges,type CadDocument,type CadFeature,type EditableMesh,type CadWorkPlaneFrame,type MeshVector} from "@agent-webcad/cad-document";
import type {CommandBus} from "@agent-webcad/cad-commands";
import {buildExtrudeMesh,buildPrimitiveMesh,meshPositionsBounds} from "../cad/kernelGeometryService";
import type {MeshData} from "../cad/kernelProtocol";
import {captureHybridReference,resolveHybridReference,assertHybridFeatureResolved,hybridTopology} from "./hybridReferences";
import type {CooperativeTask} from "./cooperativeTask";

export type HybridDatum={referenceId:string;width:number;depth:number;height:number;fingerprint:string;status:"resolved"|"unresolved"};
function rectangle(frame:CadWorkPlaneFrame,width:number,depth:number){
  const p=(x:number,y:number)=>frame.origin.map((n,i)=>n+frame.xAxis[i]*x+frame.yAxis[i]*y) as MeshVector;
  const points=[p(-width/2,-depth/2),p(width/2,-depth/2),p(width/2,depth/2),p(-width/2,depth/2)];
  return {id:"hybrid-rectangle",normal:frame.normal,segments:points.map((start,i)=>({kind:"line" as const,start,end:points[(i+1)%4],topologyReference:`hybrid-edge-${i}`}))};
}
export async function rebuildHybridDatum(document:CadDocument,feature:CadFeature,task:CooperativeTask={}){
  const h=feature.params.hybridDatum as HybridDatum,plane=document.workPlanes?.[h.referenceId],reference=plane?.hybrid,result=reference&&resolveHybridReference(document,reference);
  if(!reference?.datumEnabled||!result||!("frame" in result))return {...feature.params,hybridDatum:{...h,status:"unresolved"}};
  const params={...feature.params,kind:"extrude",distance:h.height,profile:rectangle(result.frame,h.width,h.depth),hybridDatum:{...h,status:"resolved",fingerprint:result.fingerprint}};
  const mesh=await buildExtrudeMesh(params,true,{signal:task.signal});const bounds=meshPositionsBounds(mesh.positions);if(!bounds||!mesh.indices.length)throw Error("Hybrid extrusion produced no solid.");
  feature.inputs=[reference.objectId];return {...params,bounds};
}

/** Conservative exact-planar subset. Curved tessellation is deliberately not certified. */
export function canConvertBrep(feature:CadFeature){return feature.type==="primitive"&&feature.params.kind==="box"||feature.type==="extrude"&&!!feature.params.hybridDatum&&validHybridFeature(feature);}
export function editableFromPlanarBrep(data:MeshData){
  if(data.positions.length/3>10000||data.indices.length/3>20000)throw Error("BRep conversion budget exceeded before allocation.");
  if(!data.faces?.length||data.faces.length>128||new Set(data.faces.map(f=>f.key)).size!==data.faces.length)throw Error("Missing or ambiguous BRep face correspondence.");
  const mesh:EditableMesh={version:2,vertices:[],faces:[],edit:{enabled:false,mode:"face",ids:[]}},remap:string[]=[],tolerance=1e-7;let maxWeldDistance=0;
  // Planar box/prism subset has very few vertices. Refuse larger welding workloads.
  if(data.positions.length/3>256)throw Error("Planar conversion weld budget exceeded (256 render vertices).");
  for(let i=0;i<data.positions.length;i+=3){const position=[data.positions[i],data.positions[i+1],data.positions[i+2]] as MeshVector,matches=mesh.vertices.filter(v=>Math.hypot(...v.position.map((n,j)=>n-position[j]))<=tolerance);
    if(matches.length>1)throw Error("Ambiguous tessellation seam weld.");
    if(matches.length){remap.push(matches[0].id);maxWeldDistance=Math.max(maxWeldDistance,Math.hypot(...matches[0].position.map((n,j)=>n-position[j])));}else{const id=`v${mesh.vertices.length}`;mesh.vertices.push({id,position});remap.push(id);}}
  const faceMap:Record<string,string[]>={},covered=new Set<number>();
  for(const face of data.faces){const ids:string[]=[];for(let t=face.start;t<face.start+face.count;t++){
    if(!Number.isInteger(t)||t<0||t>=data.indices.length/3||covered.has(t))throw Error("Invalid BRep face triangle ranges.");covered.add(t);
    const id=`f${t}`,vertices=Array.from(data.indices.slice(t*3,t*3+3),i=>remap[i]);mesh.faces.push({id,vertices});ids.push(id);
  }faceMap[face.key]=ids;}
  if(covered.size!==data.indices.length/3||!validateEditableMesh(mesh)||meshEdges(mesh).some(e=>e.faceIds.length!==2))throw Error("Converted mesh is not a closed, consistently wound manifold.");
  validateMeshIntersections(mesh);return {mesh,faceMap,maxWeldDistance,weldTolerance:tolerance};
}
export function registerHybridCommands(bus:CommandBus,document:CadDocument,task:CooperativeTask={}){
  bus.registerHandler("hybrid-reference",command=>{
    if(command.type!=="hybrid-reference")return;
    const previous=document.workPlanes?.[command.referenceId];if(previous&&!previous.hybrid)throw Error("This ID belongs to a different work plane.");
    if(!previous&&Object.values(document.workPlanes??{}).filter(p=>p.hybrid).length>=64)throw Error("Hybrid reference budget exceeded (64).");
    const reference=captureHybridReference(document,command.objectId,command.origin,command.direction,command.expectedFingerprint);reference.datumEnabled=previous?.hybrid?.datumEnabled??false;
    const resolved=resolveHybridReference(document,reference);if(!("frame" in resolved))throw Error(resolved.reason);
    document.workPlanes={...document.workPlanes,[command.referenceId]:{id:command.referenceId,name:previous?.name??`Mesh datum ${command.referenceId}`,...resolved.frame,hybrid:reference}};
    for(const f of Object.values(document.features))if((f.params.hybridDatum as HybridDatum|undefined)?.referenceId===command.referenceId)f.inputs=[command.objectId];
    document.revision++;return {accepted:true,createdIds:[]};
  });
  bus.registerHandler("hybrid-datum",async command=>{
    if(command.type!=="hybrid-datum")return;
    const plane=document.workPlanes?.[command.referenceId],reference=plane?.hybrid;if(!reference)throw Error("Capture a mesh reference first.");
    const source=document.objects[reference.objectId],layer=source&&document.layers[source.layerId];if(!source?.visible||!layer?.visible||layer.locked)throw Error("Source must be visible and unlocked.");
    const resolved=resolveHybridReference(document,reference);if(!("frame" in resolved))throw Error(resolved.reason);
    const id=command.id??`hybrid-${crypto.randomUUID()}`,fid=`feature-${id}`;if(document.objects[id]||document.features[fid])throw Error("Output ID already exists.");
    reference.datumEnabled=true;
    const feature:CadFeature={id:fid,type:"extrude",inputs:[reference.objectId],dependencyMode:"live",output:id,params:{hybridDatum:{referenceId:command.referenceId,width:command.width,depth:command.depth,height:command.height,fingerprint:resolved.fingerprint,status:"resolved"}}};
    feature.params=await rebuildHybridDatum(document,feature,task);
    document.objects[id]={id,geometryId:`geometry-${id}`,name:`Hybrid ${command.width} × ${command.depth} × ${command.height} mm`,visible:true,layerId:source.layerId,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
    document.features[fid]=feature;document.rootObjects.push(id);layer.objectIds.push(id);document.revision++;return {accepted:true,createdIds:[id]};
  });
  bus.registerHandler("hybrid-to-mesh",async command=>{
    if(command.type!=="hybrid-to-mesh")return;
    const object=document.objects[command.objectId],layer=object&&document.layers[object.layerId],feature=Object.values(document.features).find(f=>f.output===command.objectId);
    if(!object?.visible||!layer?.visible||layer.locked||!feature||!canConvertBrep(feature))throw Error("Conversion supports visible unlocked BRep boxes and Hybrid rectangular prisms only.");
    assertHybridFeatureResolved(document,object.id);
    const id=command.id??`converted-${crypto.randomUUID()}`,fid=`feature-${id}`;if(document.objects[id]||document.features[fid])throw Error("Output ID already exists.");
    const data=feature.type==="primitive"?await buildPrimitiveMesh(feature.params,{signal:task.signal}):await buildExtrudeMesh(feature.params,true,{signal:task.signal});
    const converted=editableFromPlanarBrep(data),report={version:1,sourceObjectId:object.id,sourceDocumentId:document.id,sourceRevision:document.revision,sourceFingerprint:meshContentSignature({params:feature.params,transform:object.transform}),sourceRepresentation:"brep",resultRepresentation:"editable-mesh",linearDeflection:.1,angularDeflection:.5,relative:false,weldTolerance:converted.weldTolerance,maxWeldDistance:converted.maxWeldDistance,faceMap:converted.faceMap,resultTopologyFingerprint:hybridTopology(converted.mesh),accuracy:"Planar-only tessellation; zero analytic chord error. Numeric seam displacement measured, not a certified Hausdorff bound.",lost:["parametric feature history","analytic BRep topology ownership"]};
    document.objects[id]={...structuredClone(object),id,geometryId:`geometry-${id}`,name:`${object.name} · Editable mesh`};
    document.features[fid]={id:fid,type:"mesh",output:id,inputs:[],dependencyMode:"snapshot",params:{kind:"editable-mesh",mesh:converted.mesh,hybridConversion:report}};
    document.rootObjects.push(id);layer.objectIds.push(id);document.revision++;return {accepted:true,createdIds:[id]};
  });
}
