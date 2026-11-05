import type {EditableMesh,MeshVector} from "./EditableMesh";

export type MeshFace={id:string;vertices:string[]};
export type MeshTopologyChange={operation:string;vertices:Record<string,string[]>;edges:Record<string,string[]>;faces:Record<string,string[]>;generated:{vertices:string[];edges:string[];faces:string[]};deleted:{vertices:string[];edges:string[];faces:string[]}};
export type HalfEdge={id:string;edgeId:string;faceId:string;from:string;to:string;next:string;previous:string;twin?:string};
export const edgeKey=(a:string,b:string)=>JSON.stringify([a,b].sort());
export const add=(a:MeshVector,b:MeshVector):MeshVector=>a.map((n,i)=>n+b[i]) as MeshVector;
export const sub=(a:MeshVector,b:MeshVector):MeshVector=>a.map((n,i)=>n-b[i]) as MeshVector;
export const mul=(a:MeshVector,s:number):MeshVector=>a.map(n=>n*s) as MeshVector;
export const dot=(a:MeshVector,b:MeshVector)=>a.reduce((s,n,i)=>s+n*b[i],0);
export const cross=(a:MeshVector,b:MeshVector):MeshVector=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function unit(v:MeshVector):MeshVector{const n=Math.hypot(...v);if(n<1e-10)throw Error("Degenerate face or edge.");return mul(v,1/n);}
export function polygonNormal(points:MeshVector[]):MeshVector{
 const origin=points[0];let n:MeshVector=[0,0,0];for(let i=1;i<points.length-1;i++)n=add(n,cross(sub(points[i],origin),sub(points[i+1],origin)));return unit(n);
}
export function faceFrame(points:MeshVector[],planar=false){
 const origin=points[0],normal=polygonNormal(points),edge=sub(points[1],origin),x=unit(sub(edge,mul(normal,dot(edge,normal)))),y=unit(cross(normal,x));
 const scale=Math.max(1,...points.map(p=>Math.hypot(...sub(p,origin))));
 if(planar&&points.some(p=>Math.abs(dot(sub(p,origin),normal))>scale*1e-8))throw Error("This operation requires planar faces.");
 return {origin,normal,x,y,points:points.map(p=>[dot(sub(p,origin),x),dot(sub(p,origin),y)] as [number,number])};
}
const orient=(a:number[],b:number[],c:number[]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
/** Deterministic ear clipping. No holes; non-planar faces use their Newell-normal projection. */
export function triangulateFace(face:MeshFace,positions:ReadonlyMap<string,MeshVector>):[string,string,string][]{
 const p=face.vertices.map(id=>positions.get(id)!);if(p.some(v=>!v))throw Error("Missing face vertex.");
 const q=faceFrame(p).points,scale=Math.max(1,...q.flat().map(Math.abs)),eps=scale*scale*1e-12,n=q.length;
 for(let i=0;i<n;i++){
  if(Math.hypot(...sub(p[i],p[(i+1)%n]))<1e-8)throw Error("Zero-length edge.");
  for(let j=i+1;j<n;j++)if(j!==i+1&&!(i===0&&j===n-1)){
   const a=q[i],b=q[(i+1)%n],c=q[j],d=q[(j+1)%n];
   const o=[orient(a,b,c),orient(a,b,d),orient(c,d,a),orient(c,d,b)];
   const on=(a:number[],b:number[],c:number[])=>Math.abs(orient(a,b,c))<=eps&&c[0]>=Math.min(a[0],b[0])-1e-10&&c[0]<=Math.max(a[0],b[0])+1e-10&&c[1]>=Math.min(a[1],b[1])-1e-10&&c[1]<=Math.max(a[1],b[1])+1e-10;
   if(o[0]*o[1]<0&&o[2]*o[3]<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw Error("Face boundary self-intersects or touches itself.");
  }
 }
 const remaining=q.map((_,i)=>i),triangles:[string,string,string][]=[];
 while(remaining.length>3){let clipped=false;for(let k=0;k<remaining.length;k++){
  const a=remaining[(k+remaining.length-1)%remaining.length],b=remaining[k],c=remaining[(k+1)%remaining.length];if(orient(q[a],q[b],q[c])<=eps)continue;
  if(remaining.some(v=>v!==a&&v!==b&&v!==c&&orient(q[a],q[b],q[v])>=-eps&&orient(q[b],q[c],q[v])>=-eps&&orient(q[c],q[a],q[v])>=-eps))continue;
  triangles.push([face.vertices[a],face.vertices[b],face.vertices[c]]);remaining.splice(k,1);clipped=true;break;
 }if(!clipped)throw Error("Cannot triangulate degenerate polygon.");}
 if(orient(q[remaining[0]],q[remaining[1]],q[remaining[2]])<=eps)throw Error("Degenerate triangle in polygon.");
 triangles.push(remaining.map(i=>face.vertices[i]) as [string,string,string]);return triangles;
}
export function meshTriangles(mesh:EditableMesh){if(mesh.version===1)return mesh.faces.map(f=>({faceId:f.id,vertices:[...f.vertices] as [string,string,string]}));const positions=new Map(mesh.vertices.map(v=>[v.id,v.position]));return mesh.faces.flatMap(f=>triangulateFace(f,positions).map(vertices=>({faceId:f.id,vertices})));}

/** Index-based half edges are derived traversal handles; public references use stable vertex-pair edge IDs. */
export function buildMeshTopology(mesh:EditableMesh){
 const halfEdges=new Map<string,HalfEdge>(),edges=new Map<string,HalfEdge[]>(),vertexFaces=new Map<string,Set<string>>(),diagnostics:string[]=[];
 for(const f of mesh.faces)for(let i=0;i<f.vertices.length;i++){
  const from=f.vertices[i],to=f.vertices[(i+1)%f.vertices.length],id=JSON.stringify([f.id,i]);
  const h:HalfEdge={id,edgeId:edgeKey(from,to),faceId:f.id,from,to,next:JSON.stringify([f.id,(i+1)%f.vertices.length]),previous:JSON.stringify([f.id,(i+f.vertices.length-1)%f.vertices.length])};
  halfEdges.set(id,h);const entries=edges.get(h.edgeId)??[];entries.push(h);edges.set(h.edgeId,entries);const fs=vertexFaces.get(from)??new Set<string>();fs.add(f.id);vertexFaces.set(from,fs);
 }
 for(const [id,entries] of edges){if(entries.length>2)diagnostics.push(`Non-manifold edge ${id}`);else if(entries.length===2){if(entries[0].from===entries[1].from)diagnostics.push(`Inconsistent winding at ${id}`);else{entries[0].twin=entries[1].id;entries[1].twin=entries[0].id;}}}
 // Traverse incident faces through edges at each vertex. Two boundary spokes or no boundary are allowed.
 const links=new Map<string,Map<string,Set<string>>>(),boundaryCounts=new Map<string,number>();
 for(const [vertex,faces] of vertexFaces)links.set(vertex,new Map([...faces].map(f=>[f,new Set<string>()])));
 for(const entries of edges.values())for(const vertex of [entries[0].from,entries[0].to]){
  if(entries.length===1)boundaryCounts.set(vertex,(boundaryCounts.get(vertex)??0)+1);
  if(entries.length===2){links.get(vertex)?.get(entries[0].faceId)?.add(entries[1].faceId);links.get(vertex)?.get(entries[1].faceId)?.add(entries[0].faceId);}
 }
 for(const [v,adj] of links){const seen=new Set<string>(),queue=[adj.keys().next().value!];for(let i=0;i<queue.length;i++){if(seen.has(queue[i]))continue;seen.add(queue[i]);queue.push(...(adj.get(queue[i])??[]));}if(seen.size!==adj.size||![0,2].includes(boundaryCounts.get(v)??0))diagnostics.push(`Non-manifold vertex ${v}`);}
 return {halfEdges,edges,vertexFaces,boundary:[...edges.values()].filter(e=>e.length===1).map(e=>e[0]),diagnostics};
}
export function boundaryLoops(mesh:EditableMesh,selectedEdges?:string[]):string[][]{
 const t=buildMeshTopology(mesh);if(t.diagnostics.length)throw Error(t.diagnostics[0]);
 const selected=selectedEdges?new Set(selectedEdges):undefined,edges=t.boundary.filter(h=>!selected||selected.has(h.edgeId));
 if(selected&&edges.length!==selected.size)throw Error("Select complete boundary loops; internal or missing edges are not allowed.");
 const next=new Map(edges.map(h=>[h.from,h]));if(next.size!==edges.length)throw Error("Branched boundary.");
 const pending=new Set(edges.map(h=>h.from)),loops:string[][]=[];
 while(pending.size){const start=[...pending].sort()[0],loop:string[]=[];let v=start;do{if(!pending.delete(v)||!next.has(v))throw Error("Boundary selection is not a complete loop.");loop.push(v);v=next.get(v)!.to;}while(v!==start);if(loop.length<3)throw Error("Degenerate boundary loop.");loops.push(loop);}
 return loops;
}
export function polygonMeshIssues(mesh:EditableMesh):string[]{
 try{
  if(mesh.faces.some(f=>f.vertices.length<3||f.vertices.length>64)||mesh.faces.reduce((n,f)=>n+f.vertices.length,0)>80000)return ["Polygon corner budget exceeded (3–64 per face; 80000 total)."];
  const vertices=new Set(mesh.vertices.map(v=>v.id)),faces=new Set<string>(),used=new Set<string>(),shapes=new Set<string>();
  const positions=new Map(mesh.vertices.map(v=>[v.id,v.position]));
  for(const f of mesh.faces){if(faces.has(f.id)||new Set(f.vertices).size!==f.vertices.length||!f.vertices.every(id=>vertices.has(id)))return ["Duplicate face or invalid vertex reference."];faces.add(f.id);f.vertices.forEach(id=>used.add(id));const canonical=JSON.stringify([...f.vertices].sort());if(shapes.has(canonical))return ["Duplicate face."];shapes.add(canonical);triangulateFace(f,positions);}
  if(used.size!==vertices.size)return ["Loose vertices are unsupported."];return buildMeshTopology(mesh).diagnostics;
 }catch(e){return [e instanceof Error?e.message:String(e)];}
}
