import {validMeshDerivation,type MeshDerivation} from "./MeshRemesh";
import {appendMeshProvenance,validMeshProvenance,type TopologyProvenance} from "./MeshProvenance";
import {polygonMeshIssues} from "./MeshTopology";
/** Authoritative editable geometry. Render buffers are derived, never stored here. */
export type MeshVector = [number, number, number];
export type MeshSelectionMode = "vertex" | "edge" | "face";
export interface EditableMesh {
  version: 1 | 2;
  provenance?:TopologyProvenance;
  derivation?:MeshDerivation;
  vertices: { id: string; position: MeshVector }[];
  faces: { id: string; vertices: string[] }[];
  modifiers?:MeshModifier[];
  topologyChange?:import("./MeshTopology").MeshTopologyChange;
  edit: { enabled: boolean; mode: MeshSelectionMode; ids: string[] };
  /** Last topology-changing operation; historical copies belong to document history. */
  lastTopologyChange?: { operation: "extrude-face"; sourceFaceId: string; capFaceId: string; vertexMap: { from: string; to: string }[]; generatedFaceIds: string[] };
}
export type MeshEdge = { id: string; vertices: [string, string]; faceIds: string[] };
export type MeshModifier={id:string;type:"catmull-clark";enabled:boolean;level:number;boundary:"smooth"|"fixed";creaseEdges:string[]};
export function validMeshModifiers(value:unknown):value is MeshModifier[]{
 if(!Array.isArray(value)||value.length>4)return false;
 return new Set(value.map(v=>v?.id)).size===value.length&&value.every(v=>v&&Object.keys(v).every(k=>["id","type","enabled","level","boundary","creaseEdges"].includes(k))&&meshElementId(v.id)&&v.type==="catmull-clark"&&typeof v.enabled==="boolean"&&Number.isInteger(v.level)&&v.level>=0&&v.level<=3&&["smooth","fixed"].includes(v.boundary)&&Array.isArray(v.creaseEdges)&&v.creaseEdges.length<=20000&&v.creaseEdges.every((id:unknown)=>typeof id==="string"&&id.length<220)&&new Set(v.creaseEdges).size===v.creaseEdges.length);
}
export const MESH_LIMITS = { vertices: 10000, faces: 20000, coordinate: 1e9 } as const;
export const meshElementId = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,96}$/.test(v);
export const meshVector = (v: unknown): v is MeshVector => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= MESH_LIMITS.coordinate);
export const meshEdgeId = (a: string, b: string) => JSON.stringify([a, b].sort());
export function meshEdges(mesh: EditableMesh): MeshEdge[] {
  const edges = new Map<string, MeshEdge>();
  for (const face of mesh.faces) for (let i = 0; i < face.vertices.length; i++) {
    const a = face.vertices[i], b = face.vertices[(i + 1) % face.vertices.length], id = meshEdgeId(a, b);
    const edge = edges.get(id) ?? { id, vertices: [a, b], faceIds: [] };
    edge.faceIds.push(face.id); edges.set(id, edge);
  }
  return [...edges.values()];
}
export function meshElementIds(mesh: EditableMesh, mode: MeshSelectionMode): string[] {
  return mode === "vertex" ? mesh.vertices.map(v => v.id) : mode === "face" ? mesh.faces.map(f => f.id) : meshEdges(mesh).map(e => e.id);
}
export function meshNormal(a: MeshVector, b: MeshVector, c: MeshVector): MeshVector {
  const u = b.map((n, i) => n - a[i]), v = c.map((n, i) => n - a[i]);
  return [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
}
/** Bounded structural validation; does NOT claim absence of self intersections. */
export function validateEditableMesh(value: unknown): value is EditableMesh {
  if (!value || typeof value !== "object") return false;
  const m = value as EditableMesh;
  if(m.derivation!==undefined&&(m.version!==2||!validMeshDerivation(m.derivation)))return false;
  if (![1,2].includes(m.version) || !Array.isArray(m.vertices) || m.vertices.length < 3 || m.vertices.length > MESH_LIMITS.vertices || !Array.isArray(m.faces) || !m.faces.length || m.faces.length > MESH_LIMITS.faces) return false;
  if (!m.vertices.every(v => v && meshElementId(v.id) && meshVector(v.position)) || new Set(m.vertices.map(v => v.id)).size !== m.vertices.length) return false;
  if(m.version===1&&(m.provenance!==undefined||m.modifiers!==undefined||m.topologyChange!==undefined))return false;
  if(m.version===2){
    if(m.lastTopologyChange!==undefined||!m.faces.every(f=>f&&meshElementId(f.id)&&Array.isArray(f.vertices)&&f.vertices.every(meshElementId))||polygonMeshIssues(m).length)return false;
    if(m.modifiers!==undefined&&!validMeshModifiers(m.modifiers))return false;
    const edgeIds=new Set(meshEdges(m).map(e=>e.id));if(m.modifiers?.some(mod=>!mod.creaseEdges.every(id=>edgeIds.has(id))))return false;
    if(!m.edit||typeof m.edit.enabled!=="boolean"||!["vertex","edge","face"].includes(m.edit.mode)||!Array.isArray(m.edit.ids)||new Set(m.edit.ids).size!==m.edit.ids.length)return false;
    const ids=new Set(meshElementIds(m,m.edit.mode));if(!m.edit.ids.every(id=>ids.has(id)))return false;
    const change=m.topologyChange;if(change!==undefined){
      if(!change||typeof change!=="object"||Array.isArray(change)||Object.keys(change).some(k=>!["operation","vertices","edges","faces","generated","deleted"].includes(k))||!["extrude","inset","bevel","bridge","loop-cut","merge","dissolve","delete"].includes(change.operation))return false;
      let mappingSize=0;
      for(const kind of ["vertices","edges","faces"] as const){const targets=new Set(kind==="vertices"?m.vertices.map(v=>v.id):kind==="edges"?[...edgeIds]:m.faces.map(f=>f.id)),map=change[kind];
        if(!map||typeof map!=="object"||Array.isArray(map)||Object.keys(map).length>80000||!Object.entries(map).every(([key,list])=>key.length<=220&&Array.isArray(list)&&list.length<=80000&&(mappingSize+=list.length)<=200000&&new Set(list).size===list.length&&list.every(id=>targets.has(id))))return false;
        if(!change.generated||!change.deleted||!Array.isArray(change.generated[kind])||!Array.isArray(change.deleted[kind])||change.generated[kind].length>80000||change.deleted[kind].length>80000||new Set(change.generated[kind]).size!==change.generated[kind].length||new Set(change.deleted[kind]).size!==change.deleted[kind].length||!change.generated[kind].every(id=>targets.has(id))||!change.deleted[kind].every(id=>typeof id==="string"&&id.length<=220&&!targets.has(id)))return false;
      }
    }
    return validMeshProvenance(m);
  }
  const vertices = new Map(m.vertices.map(v => [v.id, v.position])), faces = new Set<string>(), shapes = new Set<string>(), used = new Set<string>();
  const incidence = new Map<string, { direction: string; count: number }>();
  const links = new Map<string, [string,string][]>();
  for (const f of m.faces) {
    if (!f || !meshElementId(f.id) || faces.has(f.id) || !Array.isArray(f.vertices) || f.vertices.length !== 3 || new Set(f.vertices).size !== 3 || !f.vertices.every(id => vertices.has(id))) return false;
    faces.add(f.id); const key = JSON.stringify([...f.vertices].sort()); if (shapes.has(key)) return false; shapes.add(key);
    const [a,b,c] = f.vertices.map(id => vertices.get(id)!);
    if (Math.hypot(...meshNormal(a,b,c)) <= 1e-10) return false;
    for (let i=0;i<3;i++) {
      const a=f.vertices[i], b=f.vertices[(i+1)%3], c=f.vertices[(i+2)%3]; used.add(a);
      const id=meshEdgeId(a,b), prior=incidence.get(id);
      if (prior && (prior.count >= 2 || prior.direction === a)) return false;
      incidence.set(id,{direction:a,count:(prior?.count??0)+1});
      const link=links.get(a)??[]; link.push([b,c]); links.set(a,link);
    }
  }
  if (used.size !== vertices.size) return false;
  // A connected vertex link rejects bow-tie vertices, including disconnected shells sharing a vertex.
  for (const link of links.values()) {
    const neighbors=new Map<string,string[]>();for(const [a,b] of link){neighbors.set(a,[...(neighbors.get(a)??[]),b]);neighbors.set(b,[...(neighbors.get(b)??[]),a]);}
    const remaining=new Set(neighbors.keys()), queue=[link[0][0]]; remaining.delete(queue[0]);
    for(let i=0;i<queue.length;i++)for(const next of neighbors.get(queue[i])??[])if(remaining.delete(next))queue.push(next);
    if(remaining.size) return false;
  }
  if (!m.edit || typeof m.edit.enabled !== "boolean" || !["vertex","edge","face"].includes(m.edit.mode) || !Array.isArray(m.edit.ids) || m.edit.ids.length > MESH_LIMITS.faces || new Set(m.edit.ids).size !== m.edit.ids.length) return false;
  const selectable=new Set(meshElementIds(m,m.edit.mode)); if(!m.edit.ids.every(id=>selectable.has(id)))return false;
  const change=m.lastTopologyChange;
  if(change!==undefined && (!change || change.operation!=="extrude-face" || !meshElementId(change.sourceFaceId) || !meshElementId(change.capFaceId) || !Array.isArray(change.vertexMap) || change.vertexMap.length!==3 || !change.vertexMap.every(v=>v&&meshElementId(v.from)&&meshElementId(v.to)) || !Array.isArray(change.generatedFaceIds) || change.generatedFaceIds.length!==7 || !change.generatedFaceIds.every(meshElementId)))return false;
  if(change && (faces.has(change.sourceFaceId)||!faces.has(change.capFaceId)||new Set(change.generatedFaceIds).size!==7||!change.generatedFaceIds.includes(change.capFaceId)||!change.generatedFaceIds.every(id=>faces.has(id))||new Set(change.vertexMap.map(v=>v.to)).size!==3||!change.vertexMap.every(v=>vertices.has(v.from)&&vertices.has(v.to))))return false;
  return true;
}
export function createMeshCube(size: number): EditableMesh {
  if (!Number.isFinite(size) || size < 1e-3 || size > 1e6) throw Error("Mesh size must be between 0.001 and 1000000 mm.");
  const points: MeshVector[]=[[0,0,0],[size,0,0],[size,size,0],[0,size,0],[0,0,size],[size,0,size],[size,size,size],[0,size,size]];
  const triangles=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  return {version:1,vertices:points.map((position,i)=>({id:`v${i}`,position})),faces:triangles.map((indices,i)=>({id:`f${i}`,vertices:indices.map(n=>`v${n}`) as [string,string,string]})),edit:{enabled:false,mode:"face",ids:[]}};
}
export function selectedMeshVertices(mesh: EditableMesh, mode: MeshSelectionMode, ids: string[]): Set<string> {
  if(!ids.length || new Set(ids).size!==ids.length)throw Error("Select distinct mesh elements first.");
  const available=new Set(meshElementIds(mesh,mode)); if(!ids.every(id=>available.has(id)))throw Error("Mesh selection contains a missing topology reference.");
  const selected=new Set(ids);
  return new Set(mode==="vertex"?ids:mode==="face"?mesh.faces.filter(f=>selected.has(f.id)).flatMap(f=>f.vertices):meshEdges(mesh).filter(e=>selected.has(e.id)).flatMap(e=>e.vertices));
}
export function transformMesh(mesh: EditableMesh, mode: MeshSelectionMode, ids: string[], operation: "move"|"scale", value: MeshVector, pivot: MeshVector=[0,0,0]): EditableMesh {
  if(!meshVector(value)||!meshVector(pivot)||operation==="scale"&&value.some(n=>n<=0))throw Error("Mesh transform requires finite coordinates and positive scale factors.");
  const next=structuredClone(mesh), vertices=selectedMeshVertices(mesh,mode,ids);
  for(const vertex of next.vertices)if(vertices.has(vertex.id))vertex.position=vertex.position.map((n,i)=>operation==="move"?n+value[i]:pivot[i]+(n-pivot[i])*value[i]) as MeshVector;
  next.edit={enabled:true,mode,ids:[...ids]};
  if(!validateEditableMesh(next))throw Error("Mesh edit produced degenerate or invalid topology.");
  return next;
}
export function extrudeMeshFace(mesh: EditableMesh, faceId: string, distance: number, token: string): EditableMesh {
  if(mesh.version!==1)throw Error("Use Polygon region extrusion for version 2 meshes.");
  if(!Number.isFinite(distance)||Math.abs(distance)<1e-6||Math.abs(distance)>1e6||!meshElementId(token))throw Error("Invalid mesh extrusion distance or ID.");
  const face=mesh.faces.find(f=>f.id===faceId); if(!face)throw Error("Mesh face reference is missing.");
  const next=structuredClone(mesh), positions=new Map(mesh.vertices.map(v=>[v.id,v.position]));
  const [a,b,c]=face.vertices.map(id=>positions.get(id)!); const normal=meshNormal(a,b,c), magnitude=Math.hypot(...normal);
  const capVertices=face.vertices.map((id,i)=>{const v={id:`${token}_v${i}`,position:positions.get(id)!.map((n,k)=>n+normal[k]/magnitude*distance) as MeshVector};next.vertices.push(v);return v.id;}) as [string,string,string];
  const capId=`${token}_cap`;next.faces=next.faces.filter(f=>f.id!==faceId);next.faces.push({id:capId,vertices:capVertices});
  const generatedFaceIds=[capId];
  for(let i=0;i<3;i++){const j=(i+1)%3;for(const [k,vertices] of [[face.vertices[i],face.vertices[j],capVertices[j]],[face.vertices[i],capVertices[j],capVertices[i]]].entries()){const id=`${token}_wall${i}_${k}`;next.faces.push({id,vertices:vertices as [string,string,string]});generatedFaceIds.push(id);}}
  next.edit={enabled:true,mode:"face",ids:[capId]};
  next.lastTopologyChange={operation:"extrude-face",sourceFaceId:faceId,capFaceId:capId,vertexMap:face.vertices.map((from,i)=>({from,to:capVertices[i]})),generatedFaceIds};
  if(!validateEditableMesh(next))throw Error("Extrusion produced invalid topology or exceeded mesh limits.");
  return next;
}
