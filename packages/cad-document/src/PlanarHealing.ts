import {meshEdges,meshEdgeId,meshVector,type EditableMesh,type MeshVector} from "./EditableMesh";
import {add,sub,mul,dot,cross} from "./MeshTopology";
import type {PlanarDefinition} from "./PlanarReconstruction";

export type HealingReport={status:"validated";applied:boolean;correctedVertices:number;correctedEdges:number;maxVertexMovement:number;maxInputMovement:number;maxPlaneResidual:number;maxBoundaryGapBefore:number;toleranceUtilization:number;minFeatureClearance:number;retainedHoleCount:number;reason:string};
export type SharedPlanarTopology={version:1;vertices:{id:string;sourcePosition:MeshVector;position:MeshVector;regions:string[]}[];edges:{id:string;vertices:[string,string];uses:{regionId:string;forward:boolean}[]}[];report:HealingReport};
const norm=(p:MeshVector)=>Math.hypot(...p),clamp=(v:number)=>Math.max(0,Math.min(1,v));
const precision=(points:MeshVector[])=>Math.max(1e-10,...points.flatMap(p=>p.map(n=>Math.abs(n)*Number.EPSILON*64)));

/** Closest point to source satisfying incident plane equations. Rank-revealing orthogonal rows avoid normal-equation squaring. */
export function sharedPlaneVertex(source:MeshVector,planes:{origin:MeshVector;normal:MeshVector}[],tolerance:number):MeshVector {
 const epsilon=precision([source,...planes.map(p=>p.origin)]);if(epsilon>tolerance*.05)throw Error("Coordinate precision is insufficient for healing tolerance; move the model closer to the origin.");
 const pending=planes.map(p=>({n:p.normal,rhs:dot(p.normal,sub(p.origin,source))})),basis:MeshVector[]=[];let delta:MeshVector=[0,0,0];
 while(pending.length){const candidates=pending.map((p,i)=>{let row=[...p.n] as MeshVector;for(const q of basis)row=sub(row,mul(q,dot(row,q)));return {i,row,length:norm(row)};}).sort((a,b)=>b.length-a.length||a.i-b.i),best=candidates[0];
  if(best.length<1e-6){if(pending.some(p=>Math.abs(dot(p.n,delta)-p.rhs)>epsilon))throw Error("Nearly parallel or incompatible incident planes; unstable intersection refused.");break;}
  const p=pending.splice(best.i,1)[0],q=mul(best.row,1/best.length),distance=(p.rhs-dot(p.n,delta))/best.length;delta=add(delta,mul(q,distance));basis.push(q);
  if(norm(delta)>tolerance*(1+1e-9))throw Error("Shared vertex movement exceeds effective healing tolerance.");
 }
 const result=add(source,delta);if(planes.some(p=>Math.abs(dot(p.normal,sub(result,p.origin)))>epsilon))throw Error("Shared vertex cannot satisfy all incident planes within numerical precision.");return result;
}
function pointSegment(p:MeshVector,a:MeshVector,b:MeshVector){const ab=sub(b,a),t=dot(sub(p,a),ab)/dot(ab,ab);return {t,distance:norm(sub(p,add(a,mul(ab,clamp(t)))))};}
/** Exact geometric T junctions are rejected, never welded by the user modelling tolerance. */
export function assertNoMeshTJunction(mesh:EditableMesh){
 const positions=new Map(mesh.vertices.map(v=>[v.id,v.position])),epsilon=precision(mesh.vertices.map(v=>v.position));let checks=0;
 for(const edge of meshEdges(mesh)){const [a,b]=edge.vertices.map(id=>positions.get(id)!);for(const v of mesh.vertices){if(edge.vertices.includes(v.id)||[0,1,2].some(i=>v.position[i]<Math.min(a[i],b[i])-epsilon||v.position[i]>Math.max(a[i],b[i])+epsilon))continue;
  if(++checks>2_000_000)throw Error("T-junction detection budget exceeded.");const hit=pointSegment(v.position,a,b);if(hit.t>1e-8&&hit.t<1-1e-8&&hit.distance<=epsilon)throw Error(`T-junction: vertex ${v.id} lies inside unshared edge ${edge.id}.`);
 }}
}
function segmentDistance(p:MeshVector,q:MeshVector,r:MeshVector,s:MeshVector){const a=sub(q,p),b=sub(s,r),v=sub(p,r),aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),av=dot(a,v),bv=dot(b,v),den=aa*bb-ab*ab;let u=den>1e-14*aa*bb?clamp((ab*bv-av*bb)/den):0,t=(ab*u+bv)/bb;if(t<0){t=0;u=clamp(-av/aa);}else if(t>1){t=1;u=clamp((ab-av)/aa);}return norm(sub(add(p,mul(a,u)),add(r,mul(b,t))));}

/** Retain original mesh IDs; every region boundary uses the same solved position and oriented edge. */
export function healPlanarTopology(definition:PlanarDefinition,mesh:EditableMesh,vertexRegions:Map<string,string[]>):PlanarDefinition {
 const d=structuredClone(definition),regions=new Map(d.regions.map(r=>[r.id,r])),source=new Map(mesh.vertices.map(v=>[v.id,v.position])),uses=new Map<string,SharedPlanarTopology["edges"][number]>(),boundary=new Set<string>(),copies=new Map<string,MeshVector[]>();
 for(const region of d.regions){if(!region.loopVertexIds||region.loopVertexIds.length!==region.loops.length)throw Error("Shared healing requires original boundary vertex IDs.");region.loopVertexIds.forEach((loop,i)=>loop.forEach((id,j)=>{boundary.add(id);const positions=copies.get(id)??[];positions.push(region.loops[i][j]);copies.set(id,positions);const next=loop[(j+1)%loop.length],key=meshEdgeId(id,next),vertices=[id,next].sort() as [string,string],edge=uses.get(key)??{id:key,vertices,uses:[]};edge.uses.push({regionId:region.id,forward:id===vertices[0]});uses.set(key,edge);}));}
 const edges=[...uses.values()].sort((a,b)=>a.id.localeCompare(b.id));if(edges.some(e=>e.uses.length!==2||e.uses[0].regionId===e.uses[1].regionId||e.uses[0].forward===e.uses[1].forward))throw Error("Shared boundaries must have exactly two opposite region uses.");
 const solved=new Map<string,MeshVector>();let maxInputMovement=0,maxPlaneResidual=0;for(const v of mesh.vertices){const ids=vertexRegions.get(v.id);if(!ids?.length)continue;const planes=ids.map(id=>regions.get(id)!);const p=sharedPlaneVertex(v.position,planes,d.tolerance);solved.set(v.id,p);maxInputMovement=Math.max(maxInputMovement,norm(sub(p,v.position)));maxPlaneResidual=Math.max(maxPlaneResidual,...planes.map(r=>Math.abs(dot(r.normal,sub(p,r.origin)))));}
 const vertices=[...boundary].sort().map(id=>({id,sourcePosition:[...source.get(id)!] as MeshVector,position:solved.get(id)!,regions:[...vertexRegions.get(id)!].sort()}));if(vertices.some(v=>!v.position))throw Error("Missing shared vertex solution.");
 const epsilon=precision(mesh.vertices.map(v=>v.position)),changed=new Set(vertices.filter(v=>norm(sub(v.position,v.sourcePosition))>epsilon).map(v=>v.id));
 let minFeatureClearance=Infinity,pairs=0;for(let i=0;i<edges.length;i++){const [a,b]=edges[i].vertices.map(id=>source.get(id)!);minFeatureClearance=Math.min(minFeatureClearance,norm(sub(a,b)));for(let j=0;j<i;j++){
  if(edges[j].vertices.some(id=>edges[i].vertices.includes(id)))continue;if(++pairs>2_000_000)throw Error("Boundary clearance validation budget exceeded.");const [c,e]=edges[j].vertices.map(id=>source.get(id)!);minFeatureClearance=Math.min(minFeatureClearance,segmentDistance(a,b,c,e));
 }}
 if(!Number.isFinite(minFeatureClearance)||minFeatureClearance<=4*d.tolerance+epsilon)throw Error("Small hole/thin wall or short edge is too close to the healing tolerance; use a smaller explicit tolerance.");
 for(const edge of edges){const [a,b]=edge.vertices.map(id=>solved.get(id)!);if(norm(sub(a,b))<=2*d.tolerance)throw Error("Healing would collapse a shared edge.");}
 const signed=(loop:MeshVector[],normal:MeshVector,origin:MeshVector)=>loop.reduce((sum,p,i)=>sum+dot(cross(sub(p,origin),sub(loop[(i+1)%loop.length],origin)),normal)/2,0);
 for(const r of d.regions){r.loops=r.loopVertexIds!.map(ids=>ids.map(id=>[...solved.get(id)!] as MeshVector));if(r.loops.some((loop,i)=>signed(loop,r.normal,r.origin)*(i===0?1:-1)<=0))throw Error("Healing would reverse/collapse an exterior or hole loop.");}
 const maxVertexMovement=Math.max(...vertices.map(v=>norm(sub(v.position,v.sourcePosition)))),maxBoundaryGapBefore=Math.max(0,...[...copies.values()].flatMap(p=>p.flatMap(a=>p.map(b=>norm(sub(a,b))))));
 const report:HealingReport={status:"validated",applied:changed.size>0,correctedVertices:changed.size,correctedEdges:edges.filter(e=>e.vertices.some(id=>changed.has(id))).length,maxVertexMovement,maxInputMovement,maxPlaneResidual,maxBoundaryGapBefore,toleranceUtilization:maxInputMovement/d.tolerance,minFeatureClearance,retainedHoleCount:d.regions.reduce((n,r)=>n+r.loops.length-1,0),reason:changed.size?"Incident planes reconciled with shared source vertex/edge identities; movement bounded by the unchanged effective tolerance.":"Shared boundaries already consistent; no measurable vertex correction required."};
 d.sharedTopology={version:1,vertices,edges,report};return d;
}

export function validSharedPlanarTopology(d:PlanarDefinition):boolean {
 try{if(!Array.isArray(d.regions))return false;
 const t=d.sharedTopology;if(t===undefined)return d.regions.every(r=>r.loopVertexIds===undefined);
 if(!t||t.version!==1||!Array.isArray(t.vertices)||t.vertices.length<4||t.vertices.length>1000||!Array.isArray(t.edges)||t.edges.length>4096||new Set(t.vertices.map(v=>v?.id)).size!==t.vertices.length)return false;
 const vertices=new Map(t.vertices.map(v=>[v.id,v])),expected=new Map<string,{regionId:string;forward:boolean}[]>();
 if(t.vertices.some(v=>!v||typeof v.id!=="string"||v.id.length>96||!meshVector(v.sourcePosition)||!meshVector(v.position)||norm(sub(v.position,v.sourcePosition))>d.tolerance*(1+1e-9)||!Array.isArray(v.regions)||!v.regions.length||!v.regions.every(id=>d.regions.some(r=>r.id===id))))return false;
 for(const r of d.regions){if(!Array.isArray(r.loopVertexIds)||r.loopVertexIds.length!==r.loops.length)return false;for(const [i,loop] of r.loopVertexIds.entries()){if(!Array.isArray(loop)||loop.length!==r.loops[i].length||new Set(loop).size!==loop.length)return false;for(let j=0;j<loop.length;j++){const id=loop[j],next=loop[(j+1)%loop.length],v=vertices.get(id);if(!v||!v.regions.includes(r.id)||r.loops[i][j].some((n,k)=>n!==v.position[k]))return false;const key=meshEdgeId(id,next),list=expected.get(key)??[];list.push({regionId:r.id,forward:id<next});expected.set(key,list);}}}
 if(expected.size!==t.edges.length||new Set(t.edges.map(e=>e?.id)).size!==t.edges.length)return false;
 for(const e of t.edges){const list=expected.get(e.id);if(!list||!Array.isArray(e.vertices)||e.vertices.length!==2||e.id!==meshEdgeId(...e.vertices)||e.vertices[0]>=e.vertices[1]||!Array.isArray(e.uses)||e.uses.length!==2||list.length!==2||list[0].forward===list[1].forward||list[0].regionId===list[1].regionId||JSON.stringify(e.uses)!==JSON.stringify(list))return false;}
 const epsilon=precision(t.vertices.map(v=>v.position)),changed=new Set(t.vertices.filter(v=>norm(sub(v.position,v.sourcePosition))>epsilon).map(v=>v.id));
 if(epsilon>d.tolerance*.05||t.vertices.some(v=>v.regions.some(id=>{const r=d.regions.find(r=>r.id===id)!;return Math.abs(dot(r.normal,sub(v.position,r.origin)))>epsilon;})))return false;
 const r=t.report;if(!r||r.status!=="validated"||typeof r.applied!=="boolean"||typeof r.reason!=="string"||!Number.isInteger(r.correctedVertices)||r.correctedVertices<0||r.correctedVertices>t.vertices.length||!Number.isInteger(r.correctedEdges)||r.correctedEdges<0||r.correctedEdges>t.edges.length||![r.maxVertexMovement,r.maxInputMovement,r.maxPlaneResidual,r.maxBoundaryGapBefore,r.toleranceUtilization,r.minFeatureClearance].every(n=>Number.isFinite(n)&&n>=0)||r.maxInputMovement>d.tolerance*(1+1e-9)||r.maxVertexMovement>r.maxInputMovement+1e-10||r.correctedVertices!==changed.size||r.correctedEdges!==t.edges.filter(e=>e.vertices.some(id=>changed.has(id))).length||r.applied!==(changed.size>0)||Math.abs(r.toleranceUtilization-r.maxInputMovement/d.tolerance)>1e-12||r.maxPlaneResidual>epsilon||r.minFeatureClearance<=4*d.tolerance||r.retainedHoleCount!==d.regions.reduce((n,r)=>n+r.loops.length-1,0))return false;
 return d.regions.every(r=>JSON.stringify([...new Set(t.edges.filter(e=>e.uses.some(u=>u.regionId===r.id)).flatMap(e=>e.uses.filter(u=>u.regionId!==r.id).map(u=>u.regionId)))].sort())===JSON.stringify(r.adjacent));
 }catch{return false;}
}
