import {validateEditableMesh,meshEdges,type EditableMesh,type MeshVector,type MeshModifier} from "./EditableMesh";
import {buildMeshTopology,edgeKey} from "./MeshTopology";

export type MeshStencil={id:string;weight:number}[];
export type MeshEvaluation={mesh:EditableMesh;faceSources:Record<string,string>;vertexStencils:Record<string,MeshStencil>;edgeSources:Record<string,string|null>;signature:string};
const cache=new Map<string,MeshEvaluation>();let evaluations=0,hits=0;
export function meshEvaluationStats(){return {evaluations,hits,entries:cache.size};}
export function clearMeshEvaluationCache(){cache.clear();evaluations=0;hits=0;}
export function meshEvaluationSignature(mesh:EditableMesh){return JSON.stringify([mesh.version,mesh.vertices,mesh.faces,mesh.modifiers??[]]);}
/** Caller receives a detached value. Cache is derived, bounded, and never serialized into CadDocument. */
export function evaluateMeshModifiers(source:EditableMesh):MeshEvaluation{
 if(!validateEditableMesh(source))throw Error("Cannot evaluate invalid control mesh.");
 const signature=meshEvaluationSignature(source),cached=cache.get(signature);if(cached){hits++;cache.delete(signature);cache.set(signature,cached);return structuredClone(cached);}
 let result:MeshEvaluation={mesh:{version:source.version,vertices:structuredClone(source.vertices),faces:structuredClone(source.faces),edit:{enabled:false,mode:"face",ids:[]}},faceSources:Object.fromEntries(source.faces.map(f=>[f.id,f.id])),vertexStencils:Object.fromEntries(source.vertices.map(v=>[v.id,[{id:v.id,weight:1}]])),edgeSources:Object.fromEntries(meshEdges(source).map(e=>[e.id,e.id])),signature};
 let stage=0;for(const modifier of source.modifiers??[])if(modifier.enabled)for(let level=0;level<modifier.level;level++)result=subdivide(result,source,modifier,++stage);
 result.signature=signature;evaluations++;cache.set(signature,structuredClone(result));while(cache.size>2)cache.delete(cache.keys().next().value!);return result;
}
function subdivide(input:MeshEvaluation,source:EditableMesh,modifier:MeshModifier,stage:number):MeshEvaluation{
 const m=input.mesh,t=buildMeshTopology(m),faceCount=m.faces.reduce((n,f)=>n+f.vertices.length,0);
 if(m.vertices.length+t.edges.size+m.faces.length>10000||faceCount>20000||faceCount*4>80000)throw Error("Subdivision exceeds the 10000 vertex / 20000 face / 80000 corner evaluation budget.");
 const originals=new Map(source.vertices.map(v=>[v.id,v.position])),vertices:EditableMesh["vertices"]=[],faces:EditableMesh["faces"]=[],stencils:Record<string,MeshStencil>={},faceSources:Record<string,string>={},edgeSources:Record<string,string|null>={};
 const blend=(parts:{s:MeshStencil;w:number}[]):MeshStencil=>{const weights=new Map<string,number>();for(const {s,w} of parts)for(const entry of s)weights.set(entry.id,(weights.get(entry.id)??0)+entry.weight*w);return [...weights].filter(([,w])=>Math.abs(w)>1e-14).sort(([a],[b])=>a.localeCompare(b)).map(([id,weight])=>({id,weight}));};
 const average=(ids:string[])=>blend(ids.map(id=>({s:input.vertexStencils[id],w:1/ids.length})));
 let totalWeights=0;
 const vertex=(id:string,s:MeshStencil)=>{totalWeights+=s.length;if(totalWeights>200000)throw Error("Subdivision provenance stencil budget exceeded.");const position:MeshVector=[0,0,0];for(const entry of s){const p=originals.get(entry.id)!;for(let i=0;i<3;i++)position[i]+=p[i]*entry.weight;}vertices.push({id,position});stencils[id]=s;return id;};
 const fp=new Map<string,MeshStencil>(),facePoint=new Map<string,string>(),edgePoint=new Map<string,string>(),vertexPoint=new Map<string,string>();
 // IDs are deterministic within the evaluated source signature; only the control IDs are editable references.
 let ordinal=0;const nextId=()=>{let id:string;do{id=`cc${stage}_${ordinal++}`;}while(originals.has(id));return id;};
 for(const f of m.faces){const s=average(f.vertices);fp.set(f.id,s);facePoint.set(f.id,vertex(nextId(),s));}
 const incident=new Map<string,string[]>();for(const [id,hs] of t.edges){for(const v of [hs[0].from,hs[0].to]){const list=incident.get(v)??[];list.push(id);incident.set(v,list);}
  const sharp=hs.length===1||modifier.creaseEdges.includes(input.edgeSources[id]??"");const endpoints=[hs[0].from,hs[0].to];const s=sharp?average(endpoints):blend([...endpoints.map(v=>({s:input.vertexStencils[v],w:.25})),...hs.map(h=>({s:fp.get(h.faceId)!,w:.25}))]);edgePoint.set(id,vertex(nextId(),s));
 }
 for(const v of m.vertices){const edges=incident.get(v.id)!,neighbors=edges.map(id=>{const h=t.edges.get(id)![0];return h.from===v.id?h.to:h.from;}),boundary=edges.filter(id=>t.edges.get(id)!.length===1),sharp=edges.filter(id=>t.edges.get(id)!.length===1||modifier.creaseEdges.includes(input.edgeSources[id]??""));let s:MeshStencil;
  if(boundary.length&&modifier.boundary==="fixed"||sharp.length>=3)s=input.vertexStencils[v.id];
  else if(sharp.length===2){const ns=sharp.map(id=>{const h=t.edges.get(id)![0];return h.from===v.id?h.to:h.from;});s=blend([{s:input.vertexStencils[v.id],w:.75},...ns.map(n=>({s:input.vertexStencils[n],w:.125}))]);}
  else{const fs=[...t.vertexFaces.get(v.id)!],n=edges.length;if(fs.length!==n)throw Error("Unsupported subdivision vertex neighborhood.");s=blend([{s:input.vertexStencils[v.id],w:(n-3)/n},...fs.map(f=>({s:fp.get(f)!,w:1/(n*n)})),...neighbors.map(other=>({s:average([v.id,other]),w:2/(n*n)}))]);}
  vertexPoint.set(v.id,vertex(nextId(),s));
 }
 let faceIndex=0;for(const f of m.faces)for(let i=0;i<f.vertices.length;i++){
  const a=f.vertices[i],b=f.vertices[(i+1)%f.vertices.length],prev=f.vertices[(i+f.vertices.length-1)%f.vertices.length],v=vertexPoint.get(a)!,e=edgePoint.get(edgeKey(a,b))!,p=facePoint.get(f.id)!,ep=edgePoint.get(edgeKey(prev,a))!,id=`cc${stage}_f${faceIndex++}`;
  faces.push({id,vertices:[v,e,p,ep]});faceSources[id]=input.faceSources[f.id];edgeSources[edgeKey(v,e)]=input.edgeSources[edgeKey(a,b)]??null;edgeSources[edgeKey(ep,v)]=input.edgeSources[edgeKey(prev,a)]??null;edgeSources[edgeKey(e,p)]=null;edgeSources[edgeKey(p,ep)]=null;
 }
 const mesh:EditableMesh={version:2,vertices,faces,edit:{enabled:false,mode:"face",ids:[]}};if(!validateEditableMesh(mesh))throw Error("Subdivision evaluation produced invalid geometry.");return {mesh,faceSources,vertexStencils:stencils,edgeSources,signature:input.signature};
}
export function validMeshEvaluation(mesh:EditableMesh){try{if(mesh.modifiers?.some(m=>m.enabled&&m.level))evaluateMeshModifiers(mesh);return true;}catch{return false;}}

export function rememberMeshEvaluation(source:EditableMesh,result:MeshEvaluation){const signature=meshEvaluationSignature(source);if(result.signature!==signature||!validateEditableMesh(result.mesh))throw Error("Mismatched mesh evaluation result.");cache.set(signature,structuredClone(result));while(cache.size>2)cache.delete(cache.keys().next().value!);}
