import {appendMeshProvenance} from "./MeshProvenance";
import {createMeshCube,meshEdges,meshElementId,meshVector,validateEditableMesh,type EditableMesh,type MeshVector} from "./EditableMesh";
import {add,sub,mul,dot,unit,faceFrame,edgeKey,buildMeshTopology,boundaryLoops,polygonMeshIssues,type MeshFace,type MeshTopologyChange} from "./MeshTopology";

export type PolygonMeshOperation=
 |{kind:"extrude";faceIds:string[];distance:number}
 |{kind:"inset";faceIds:string[];distance:number}
 |{kind:"inset-region";faceIds:string[];distance:number}
 |{kind:"bevel-edges";edgeIds:string[];distance:number}
 |{kind:"bevel";edgeId:string;distance:number}
 |{kind:"bridge";edgeIds:string[];offset:number;resample?:boolean}
 |{kind:"loop-cut";edgeId:string;factor:number}
 |{kind:"merge";vertexIds:[string,string]}
 |{kind:"dissolve";edgeId:string}
 |{kind:"delete";mode:"vertex"|"edge"|"face";elementIds:string[]};
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
export function validPolygonMeshOperation(v:unknown):v is PolygonMeshOperation{
 if(!v||typeof v!=="object"||Array.isArray(v))return false;const p=v as Record<string,unknown>;
 const ids=(v:unknown)=>Array.isArray(v)&&v.length>0&&v.length<=1000&&v.every(id=>typeof id==="string"&&id.length>0&&id.length<=220)&&new Set(v).size===v.length;
 const fields:Record<string,string[]>={extrude:["kind","faceIds","distance"],inset:["kind","faceIds","distance"],"inset-region":["kind","faceIds","distance"],"bevel-edges":["kind","edgeIds","distance"],bevel:["kind","edgeId","distance"],bridge:["kind","edgeIds","offset","resample"],"loop-cut":["kind","edgeId","factor"],merge:["kind","vertexIds"],dissolve:["kind","edgeId"],delete:["kind","mode","elementIds"]};
 if(typeof p.kind!=="string"||!Object.hasOwn(fields,p.kind)||Object.keys(p).some(k=>!fields[p.kind as string].includes(k)))return false;
 if(p.kind==="extrude"||p.kind==="inset"||p.kind==="inset-region")return ids(p.faceIds)&&(p.faceIds as string[]).every(meshElementId)&&finite(p.distance)&&Math.abs(p.distance)>=1e-6&&Math.abs(p.distance)<=1e6&&(p.kind==="extrude"||p.distance>0);
 if(p.kind==="bevel-edges")return ids(p.edgeIds)&&(p.edgeIds as string[]).length<=16&&finite(p.distance)&&p.distance>1e-6&&p.distance<=1e6;
 if(p.kind==="bevel")return typeof p.edgeId==="string"&&p.edgeId.length<=220&&finite(p.distance)&&p.distance>1e-6&&p.distance<=1e6;
 if(p.kind==="bridge")return (p.resample===undefined||typeof p.resample==="boolean")&&ids(p.edgeIds)&&Number.isInteger(p.offset)&&Number(p.offset)>=0&&Number(p.offset)<=1000;
 if(p.kind==="loop-cut")return typeof p.edgeId==="string"&&p.edgeId.length<=220&&finite(p.factor)&&p.factor>.001&&p.factor<.999;
 if(p.kind==="merge")return ids(p.vertexIds)&&(p.vertexIds as string[]).length===2&&(p.vertexIds as string[]).every(meshElementId);
 if(p.kind==="dissolve")return typeof p.edgeId==="string"&&p.edgeId.length<=220;
 return ["vertex","edge","face"].includes(String(p.mode))&&ids(p.elementIds);
}
export function upgradePolygonMesh(mesh:EditableMesh):EditableMesh{
 if(!validateEditableMesh(mesh))throw Error("Invalid source mesh.");if(mesh.version===2)throw Error("Mesh is already Polygon v2.");
 const next=structuredClone(mesh);next.version=2;delete next.lastTopologyChange;next.modifiers=[];return next;
}
export function createPolygonMesh(size:number,shape:"cube"|"ngon"="cube",sides=6):EditableMesh{
 const mesh=upgradePolygonMesh(createMeshCube(size));
 if(shape==="cube")mesh.faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].map((v,i)=>({id:`f${i}`,vertices:v.map(n=>`v${n}`)}));
 else{if(!Number.isInteger(sides)||sides<3||sides>32)throw Error("N-gon requires 3–32 sides.");mesh.vertices=Array.from({length:sides},(_,i)=>({id:`v${i}`,position:[size*Math.cos(i*2*Math.PI/sides),size*Math.sin(i*2*Math.PI/sides),0] as MeshVector}));mesh.faces=[{id:"f0",vertices:mesh.vertices.map(v=>v.id)}];}
 if(!validateEditableMesh(mesh))throw Error("Invalid Polygon primitive.");return mesh;
}

export function applyPolygonMeshOperation(source:EditableMesh,op:PolygonMeshOperation,token:string):EditableMesh{
 if(source.version!==2)throw Error("Review and apply Upgrade to Polygon before topology editing.");
 if(!validateEditableMesh(source)||!validPolygonMeshOperation(op)||!meshElementId(token)||token.length>48)throw Error("Invalid Polygon edit or source.");
 if(op.kind==="bevel-edges"){
  const endpoints=op.edgeIds.flatMap(id=>meshEdges(source).find(e=>e.id===id)?.vertices??[]);if(endpoints.length!==op.edgeIds.length*2||new Set(endpoints).size!==endpoints.length)throw Error("Multi Bevel requires existing edges with disjoint endpoints.");
  return op.edgeIds.reduce((m,edgeId,i)=>applyPolygonMeshOperation(m,{kind:"bevel",edgeId,distance:op.distance},`${token}_${i}`),source);
 }
 if(op.kind==="inset-region"){
  let current=source;const selected=new Set(op.faceIds);if(!op.faceIds.every(id=>current.faces.some(f=>f.id===id)))throw Error("Missing region face.");let step=0;
  while(selected.size>1){const edge=meshEdges(current).find(e=>e.faceIds.length===2&&e.faceIds.every(id=>selected.has(id)));if(!edge)throw Error("Inset region must be connected and without holes.");current=applyPolygonMeshOperation(current,{kind:"dissolve",edgeId:edge.id},`${token}_${step++}`);edge.faceIds.forEach(id=>selected.delete(id));selected.add(current.edit.ids[0]);}
  return applyPolygonMeshOperation(current,{kind:"inset",faceIds:[...selected],distance:op.distance},`${token}_${step}`);
 }
 const mesh=structuredClone(source);delete mesh.topologyChange;
 const positions=new Map(mesh.vertices.map(v=>[v.id,v.position])),topology=buildMeshTopology(mesh);
 let counter=0;const id=(kind:string)=>`${token}_${kind}${counter++}`;
 const hints:{vertices:Record<string,string[]>;edges:Record<string,string[]>;faces:Record<string,string[]>}={vertices:{},edges:{},faces:{}};
 const vertex=(p:MeshVector)=>{if(!meshVector(p))throw Error("Coordinate budget exceeded.");const key=id("v");mesh.vertices.push({id:key,position:p});positions.set(key,p);return key;};
 const face=(vertices:string[])=>{const f={id:id("f"),vertices};mesh.faces.push(f);return f.id;};
 const selectFaces=(ids:string[])=>{if(!ids.every(id=>mesh.faces.some(f=>f.id===id)))throw Error("Missing selected face reference.");return mesh.faces.filter(f=>ids.includes(f.id));};
 const frame=(f:MeshFace)=>faceFrame(f.vertices.map(v=>positions.get(v)!),true);
 const finish=()=>{
  const used=new Set(mesh.faces.flatMap(f=>f.vertices));mesh.vertices=mesh.vertices.filter(v=>used.has(v.id));
  if(!mesh.faces.length)throw Error("Operation removes the entire surface. Delete the object instead.");
  const change:MeshTopologyChange={operation:op.kind,...hints,generated:{vertices:[],edges:[],faces:[]},deleted:{vertices:[],edges:[],faces:[]}};
  for(const kind of ["vertices","edges","faces"] as const){const before=new Set(kind==="vertices"?source.vertices.map(v=>v.id):kind==="edges"?meshEdges(source).map(e=>e.id):source.faces.map(f=>f.id)),after=new Set(kind==="vertices"?mesh.vertices.map(v=>v.id):kind==="edges"?meshEdges(mesh).map(e=>e.id):mesh.faces.map(f=>f.id));
   change.generated[kind]=[...after].filter(id=>!before.has(id));change.deleted[kind]=[...before].filter(id=>!after.has(id));
   for(const key of change.deleted[kind])change[kind][key]??=[];
   for(const key of Object.keys(change[kind]))change[kind][key]=[...new Set(change[kind][key])].filter(id=>after.has(id));
  }
  for(const modifier of mesh.modifiers??[]){const rebound=modifier.creaseEdges.flatMap(edge=>{if(change.deleted.edges.includes(edge)&&!change.edges[edge]?.length)throw Error("Edit would lose a crease reference. Remove or rebind that crease first.");return change.edges[edge]??[edge];});modifier.creaseEdges=[...new Set(rebound)];}
  mesh.topologyChange=change;
  appendMeshProvenance(source,mesh,change);
  const available=new Set(mesh.edit.mode==="vertex"?mesh.vertices.map(v=>v.id):mesh.edit.mode==="edge"?meshEdges(mesh).map(e=>e.id):mesh.faces.map(f=>f.id));mesh.edit.ids=mesh.edit.ids.filter(id=>available.has(id));
  if(!validateEditableMesh(mesh))throw Error(`Polygon operation rejected: ${polygonMeshIssues(mesh).join("; ")||"invalid topology/reference or mesh budget exceeded"}`);return mesh;
 };
 if(op.kind==="extrude"){
  const faces=selectFaces(op.faceIds),normal=frame(faces[0]).normal,origin=positions.get(faces[0].vertices[0])!;
  for(const f of faces){const ff=frame(f);if(dot(ff.normal,normal)<1-1e-8||f.vertices.some(v=>Math.abs(dot(sub(positions.get(v)!,origin),normal))>1e-6))throw Error("Region extrusion requires connected coplanar faces with consistent normals.");}
  const selected=new Set(op.faceIds),visited=new Set<string>(),queue=[faces[0].id];for(let i=0;i<queue.length;i++){if(visited.has(queue[i]))continue;visited.add(queue[i]);const f=faces.find(f=>f.id===queue[i])!;for(let j=0;j<f.vertices.length;j++)for(const h of topology.edges.get(edgeKey(f.vertices[j],f.vertices[(j+1)%f.vertices.length]))??[])if(selected.has(h.faceId)&&!visited.has(h.faceId))queue.push(h.faceId);}
  if(visited.size!==faces.length)throw Error("Extrusion requires one connected face region.");
  const boundary=[...topology.halfEdges.values()].filter(h=>selected.has(h.faceId)&&(!h.twin||!selected.has(topology.halfEdges.get(h.twin)!.faceId)));if(!boundary.length)throw Error("Extrusion region must have a boundary.");
  const copies=new Map<string,string>();for(const v of new Set(faces.flatMap(f=>f.vertices))){const next=vertex(add(positions.get(v)!,mul(normal,op.distance)));copies.set(v,next);hints.vertices[v]=[v,next];}
  mesh.faces=mesh.faces.filter(f=>!selected.has(f.id));const caps=faces.map(f=>{const cap=face(f.vertices.map(v=>copies.get(v)!));hints.faces[f.id]=[cap];return cap;});
  for(const h of boundary)face([h.from,h.to,copies.get(h.to)!,copies.get(h.from)!]);
  for(const [edge,hs] of topology.edges)if(hs.some(h=>selected.has(h.faceId)))hints.edges[edge]=[edge,edgeKey(copies.get(hs[0].from)!,copies.get(hs[0].to)!)];
  mesh.edit={enabled:true,mode:"face",ids:caps};return finish();
 }
 if(op.kind==="inset"){
  const originals=selectFaces(op.faceIds);mesh.faces=mesh.faces.filter(f=>!op.faceIds.includes(f.id));const innerFaces:string[]=[];
  for(const f of originals){const ff=frame(f),q=ff.points,n=q.length,turn=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);if(q.some((p,i)=>turn(q[(i+n-1)%n],p,q[(i+1)%n])<=1e-9))throw Error("Inset supports strictly convex planar faces individually.");
   const normals=q.map((p,i)=>{const end=q[(i+1)%n],dx=end[0]-p[0],dy=end[1]-p[1],len=Math.hypot(dx,dy);return [-dy/len,dx/len];});
   const inner=q.map((_,i)=>{const prev=(i+n-1)%n,a=normals[prev],b=normals[i],u=dot2(a,q[prev])+op.distance,v=dot2(b,q[i])+op.distance,det=a[0]*b[1]-a[1]*b[0],p=[(u*b[1]-a[1]*v)/det,(a[0]*v-u*b[0])/det];if(normals.some((n,j)=>dot2(n,[p[0]-q[j][0],p[1]-q[j][1]])<op.distance-1e-8))throw Error("Inset distance collapses the face.");return vertex(add(ff.origin,add(mul(ff.x,p[0]),mul(ff.y,p[1]))));});
   const inside=face(inner),outputs=[inside];innerFaces.push(inside);for(let i=0;i<n;i++){const j=(i+1)%n;outputs.push(face([f.vertices[i],f.vertices[j],inner[j],inner[i]]));const originalEdge=edgeKey(f.vertices[i],f.vertices[j]);hints.edges[originalEdge]=[...(hints.edges[originalEdge]??[originalEdge]),edgeKey(inner[i],inner[j])];hints.vertices[f.vertices[i]]=[...(hints.vertices[f.vertices[i]]??[f.vertices[i]]),inner[i]];}hints.faces[f.id]=outputs;
  }mesh.edit={enabled:true,mode:"face",ids:innerFaces};return finish();
 }
 if(op.kind==="delete"){
  const selected=new Set(op.elementIds),available=new Set(op.mode==="vertex"?mesh.vertices.map(v=>v.id):op.mode==="edge"?[...topology.edges.keys()]:mesh.faces.map(f=>f.id));if(!op.elementIds.every(id=>available.has(id)))throw Error("Missing deletion reference.");
  mesh.faces=mesh.faces.filter(f=>op.mode==="face"?!selected.has(f.id):op.mode==="vertex"?!f.vertices.some(v=>selected.has(v)):!f.vertices.some((v,i)=>selected.has(edgeKey(v,f.vertices[(i+1)%f.vertices.length]))));mesh.edit={enabled:true,mode:op.mode,ids:[]};return finish();
 }
 if(op.kind==="merge"){
  const [a,b]=op.vertexIds;if(!topology.edges.has(edgeKey(a,b)))throw Error("Merge requires two adjacent vertices.");positions.set(a,mul(add(positions.get(a)!,positions.get(b)!),.5));mesh.vertices.find(v=>v.id===a)!.position=positions.get(a)!;
  mesh.faces=mesh.faces.map(f=>{const list=f.vertices.map(v=>v===b?a:v);return {...f,vertices:list.filter((v,i)=>v!==list[(i+list.length-1)%list.length])};}).filter(f=>f.vertices.length>=3);hints.vertices[b]=[a];
  for(const [edge,hs] of topology.edges){const x=hs[0].from===b?a:hs[0].from,y=hs[0].to===b?a:hs[0].to;if(x!==y&&edge!==edgeKey(x,y))hints.edges[edge]=[edgeKey(x,y)];}
  mesh.edit={enabled:true,mode:"vertex",ids:[a]};return finish();
 }
 if(op.kind==="dissolve"){
  const hs=topology.edges.get(op.edgeId);if(hs?.length!==2)throw Error("Dissolve requires one internal manifold edge.");const faces=selectFaces(hs.map(h=>h.faceId)),normal=frame(faces[0]).normal;if(dot(normal,frame(faces[1]).normal)<1-1e-8)throw Error("Dissolve requires coplanar consistently oriented faces.");
  const region={...mesh,vertices:mesh.vertices.filter(v=>faces.some(f=>f.vertices.includes(v.id))),faces};const loops=boundaryLoops(region);if(loops.length!==1)throw Error("Dissolve must form one simple polygon without holes.");mesh.faces=mesh.faces.filter(f=>!faces.includes(f));const output=face(loops[0]);for(const f of faces)hints.faces[f.id]=[output];mesh.edit={enabled:true,mode:"face",ids:[output]};return finish();
 }
 if(op.kind==="bridge"){
  let loops=boundaryLoops(mesh,op.edgeIds);
  if(op.resample&&loops.length===2&&loops[0].length!==loops[1].length){const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a,target=loops[0].length*loops[1].length/gcd(loops[0].length,loops[1].length);if(target>64)throw Error("Bridge resampling requires LCM loop count <=64.");
   loops=loops.map(loop=>{const result:string[]=[],factor=target/loop.length;for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length],chain=[a,...Array.from({length:factor-1},(_,k)=>vertex(add(positions.get(a)!,mul(sub(positions.get(b)!,positions.get(a)!),(k+1)/factor)))),b];result.push(...chain.slice(0,-1));for(const f of mesh.faces){const index=f.vertices.findIndex((v,j)=>v===a&&f.vertices[(j+1)%f.vertices.length]===b);if(index>=0)f.vertices.splice(index+1,0,...chain.slice(1,-1));}if(factor>1)hints.edges[edgeKey(a,b)]=chain.slice(1).map((v,j)=>edgeKey(chain[j],v));}return result;});
  }
  if(loops.length!==2||loops[0].length!==loops[1].length)throw Error("Bridge requires two complete disjoint boundary loops with equal vertex counts.");const [a,raw]=loops,n=a.length;if(a.some(v=>raw.includes(v)))throw Error("Bridge loops must be disjoint.");if(op.offset>=n)throw Error("Bridge offset must be smaller than loop length.");const b=Array.from({length:n},(_,i)=>raw[(op.offset-i+n)%n]),outputs=[];for(let i=0;i<n;i++){const j=(i+1)%n;outputs.push(face([a[j],a[i],b[i],b[j]]));}mesh.edit={enabled:true,mode:"face",ids:outputs};return finish();
 }
 if(op.kind==="loop-cut"){
  if(!topology.edges.has(op.edgeId))throw Error("Missing loop-cut edge.");const factors=new Map<string,number>([[op.edgeId,op.factor]]),queue=[op.edgeId],touched=new Map<string,{i:number;factor:number}>();
  for(let k=0;k<queue.length;k++)for(const h of topology.edges.get(queue[k])!){const f=mesh.faces.find(f=>f.id===h.faceId)!;if(f.vertices.length!==4)throw Error("Loop Cut stops at non-quad faces; the selected ring must be all quads.");const i=f.vertices.indexOf(h.from),fraction=h.from<h.to?factors.get(h.edgeId)!:1-factors.get(h.edgeId)!,a=f.vertices[(i+2)%4],b=f.vertices[(i+3)%4],opposite=edgeKey(a,b),nextFactor=a<b?1-fraction:fraction;
   if(factors.has(opposite)&&Math.abs(factors.get(opposite)!-nextFactor)>1e-8)throw Error("Inconsistent ring orientation.");if(!factors.has(opposite)){factors.set(opposite,nextFactor);queue.push(opposite);}touched.set(f.id,{i,factor:fraction});}
  const cuts=new Map<string,string>();for(const [edge,t] of factors){const [a,b]=JSON.parse(edge) as string[];const v=vertex(add(mul(positions.get(a)!,1-t),mul(positions.get(b)!,t)));cuts.set(edge,v);hints.edges[edge]=[edgeKey(a,v),edgeKey(v,b)];}
  const faces=mesh.faces.filter(f=>touched.has(f.id));mesh.faces=mesh.faces.filter(f=>!touched.has(f.id));const outputs=[];for(const f of faces){const i=touched.get(f.id)!.i,[a,b,c,d]=Array.from({length:4},(_,j)=>f.vertices[(i+j)%4]),u=cuts.get(edgeKey(a,b))!,v=cuts.get(edgeKey(c,d))!,ids=[face([a,u,v,d]),face([u,b,c,v])];hints.faces[f.id]=ids;outputs.push(...ids);}mesh.edit={enabled:true,mode:"face",ids:outputs};return finish();
 }
 // A deliberately bounded edge bevel: one convex edge, planar faces and trivalent endpoints.
 const hs=topology.edges.get(op.edgeId);if(hs?.length!==2)throw Error("Bevel requires one internal manifold edge.");const a=hs[0].from,b=hs[0].to,support=selectFaces(hs.map(h=>h.faceId)),f0=frame(support[0]),f1=frame(support[1]);
 const other0=support[0].vertices.find(v=>v!==a&&v!==b)!,other1=support[1].vertices.find(v=>v!==a&&v!==b)!;
 if(dot(sub(positions.get(other1)!,positions.get(a)!),f0.normal)>=-1e-8||dot(sub(positions.get(other0)!,positions.get(a)!),f1.normal)>=-1e-8)throw Error("Bevel supports convex, non-coplanar edges only.");
 const replacements=new Map<string,string>();
 for(const endpoint of [a,b]){const spokes=[...topology.edges.values()].filter(e=>e[0].from===endpoint||e[0].to===endpoint);if(spokes.length!==3||spokes.some(e=>e.length!==2))throw Error("Bevel requires closed trivalent endpoint neighborhoods.");for(const entries of spokes){const h=entries[0],other=h.from===endpoint?h.to:h.from;if(other===a||other===b)continue;const delta=sub(positions.get(other)!,positions.get(endpoint)!),len=Math.hypot(...delta);if(op.distance>=len*.5)throw Error("Bevel distance must be below half every incident edge length.");const v=vertex(add(positions.get(endpoint)!,mul(delta,op.distance/len)));replacements.set(`${endpoint}:${other}`,v);hints.edges[h.edgeId]=[edgeKey(v,other)];}hints.vertices[endpoint]=[...replacements].filter(([key])=>key.startsWith(`${endpoint}:`)).map(([,v])=>v);}
 const originalFaces=[...mesh.faces];for(const f of originalFaces)if(f.vertices.includes(a)||f.vertices.includes(b)){frame(f);const original=[...f.vertices];f.vertices=original.flatMap((v,i)=>{if(v!==a&&v!==b)return [v];const prev=original[(i+original.length-1)%original.length],next=original[(i+1)%original.length],prevId=replacements.get(`${v}:${prev}`),nextId=replacements.get(`${v}:${next}`);return [prevId,nextId].filter((v):v is string=>!!v);});}
 const onFace=(f:MeshFace,endpoint:string)=>{const original=source.faces.find(s=>s.id===f.id)!,i=original.vertices.indexOf(endpoint),neighbors=[original.vertices[(i+original.vertices.length-1)%original.vertices.length],original.vertices[(i+1)%original.vertices.length]],other=neighbors.find(v=>v!==a&&v!==b)!;return replacements.get(`${endpoint}:${other}`)!;};
 const aa=onFace(support[0],a),bb=onFace(support[0],b),cc=onFace(support[1],a),dd=onFace(support[1],b),strip=[bb,aa,cc,dd];faceFrame(strip.map(v=>positions.get(v)!),true);const output=face(strip);hints.edges[op.edgeId]=[edgeKey(aa,bb),edgeKey(cc,dd)];mesh.edit={enabled:true,mode:"face",ids:[output]};return finish();
}
function dot2(a:number[],b:number[]){return a[0]*b[0]+a[1]*b[1];}
