import {healPlanarTopology,assertNoMeshTJunction,validSharedPlanarTopology,type SharedPlanarTopology} from "./PlanarHealing";
import {meshContentSignature} from "./MeshRemesh";
import {validateEditableMesh,meshVector,meshEdges,type EditableMesh,type MeshVector} from "./EditableMesh";
import {meshTriangles,add,sub,mul,dot,cross,unit} from "./MeshTopology";
import {validateMeshIntersections} from "./MeshIntersection";
export type ReconstructionOptions={absoluteTolerance:number;relativeTolerance:number;angleDegrees:number};
export const DEFAULT_RECONSTRUCTION:ReconstructionOptions={absoluteTolerance:1e-5,relativeTolerance:1e-8,angleDegrees:1};
export const RECONSTRUCTION_LIMITS={vertices:1000,triangles:2000,regions:128,loopEdges:4096,samplesPerDirection:512};
export function validReconstructionOptions(v:unknown):v is ReconstructionOptions {
 if(!v||typeof v!=="object")return false;const p=v as ReconstructionOptions;
 return Object.keys(p).every(k=>["absoluteTolerance","relativeTolerance","angleDegrees"].includes(k))&&Number.isFinite(p.absoluteTolerance)&&p.absoluteTolerance>=1e-7&&p.absoluteTolerance<=1&&Number.isFinite(p.relativeTolerance)&&p.relativeTolerance>=1e-10&&p.relativeTolerance<=1e-3&&Number.isFinite(p.angleDegrees)&&p.angleDegrees>=.001&&p.angleDegrees<=5;
}
export type PlanarRegion={id:string;origin:MeshVector;normal:MeshVector;loops:MeshVector[][];sourceFaceIds:string[];triangleCount:number;maxPlaneResidual:number;maxNormalAngleDegrees:number;area:number;adjacent:string[];loopVertexIds?:string[][]};
export type PlanarDefinition={version:1;tolerance:number;regions:PlanarRegion[];sharedTopology?:SharedPlanarTopology};
export type PlanarAnalysis={facePlanarity:{faceId:string;normal:MeshVector;maxResidual:number;withinTolerance:boolean}[];definition:PlanarDefinition;options:ReconstructionOptions;diagonal:number;components:number;boundaryEdges:number;closed:boolean;manifold:true;winding:"consistent";sourceArea:number;sourceSignedVolume:number;triangleCount:number;planarFaces:number;mergedTriangles:number;solidCandidate:boolean;rejection?:string};
const finite=(v:unknown)=>typeof v==="number"&&Number.isFinite(v);
export function validPlanarDefinition(value:unknown):value is PlanarDefinition {
 if(!value||typeof value!=="object")return false;const d=value as PlanarDefinition;let edges=0;
 return validSharedPlanarTopology(d)&&d.version===1&&finite(d.tolerance)&&d.tolerance>=1e-7&&d.tolerance<=1000&&Array.isArray(d.regions)&&d.regions.length>0&&d.regions.length<=128&&new Set(d.regions.map(r=>r?.id)).size===d.regions.length&&d.regions.every(r=>r&&typeof r.id==="string"&&/^region-\d+$/.test(r.id)&&meshVector(r.origin)&&meshVector(r.normal)&&Math.abs(Math.hypot(...r.normal)-1)<1e-6&&Array.isArray(r.loops)&&r.loops.length>0&&r.loops.length<=64&&r.loops.every(loop=>Array.isArray(loop)&&loop.length>=3&&(edges+=loop.length)<=4096&&loop.every(meshVector))&&Array.isArray(r.sourceFaceIds)&&r.sourceFaceIds.length>0&&r.sourceFaceIds.length<=2000&&r.sourceFaceIds.every(id=>typeof id==="string"&&id.length<=96)&&Number.isInteger(r.triangleCount)&&r.triangleCount>0&&finite(r.maxPlaneResidual)&&r.maxPlaneResidual>=0&&r.maxPlaneResidual<=d.tolerance*1.001&&finite(r.maxNormalAngleDegrees)&&finite(r.area)&&r.area>0&&Array.isArray(r.adjacent)&&r.adjacent.every(id=>d.regions.some(other=>other.id===id)));
}
export function planarBasis(normal:MeshVector){const ref:MeshVector=Math.abs(normal[0])<.8?[1,0,0]:[0,1,0],x=unit(sub(ref,mul(normal,dot(ref,normal))));return {x,y:cross(normal,x)};}
export function planarContains(point:MeshVector,loop:MeshVector[],normal:MeshVector){const {x,y}=planarBasis(normal),p=[dot(point,x),dot(point,y)];let inside=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){const a=[dot(loop[i],x),dot(loop[i],y)],b=[dot(loop[j],x),dot(loop[j],y)];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
/** Deterministic largest-area seeds; fixed seed plane prevents tolerance-chain drift. */
export function analyzePlanarMesh(mesh:EditableMesh,options:ReconstructionOptions=DEFAULT_RECONSTRUCTION,healing=true):PlanarAnalysis {
 if(!validReconstructionOptions(options))throw Error("Invalid reconstruction tolerances (world mm / relative scale / degrees).");
 if(mesh.vertices?.length>1000||mesh.faces?.length>2000)throw Error("Reconstruction budget: 1,000 vertices / 2,000 triangles.");
 if(!validateEditableMesh(mesh))throw Error("Invalid, degenerate, non-manifold or inconsistently wound Mesh.");
 if(mesh.modifiers?.some(m=>m.enabled&&m.level>0))throw Error("Explicitly Bake modifiers before reconstruction.");
 assertNoMeshTJunction(mesh);
 const raw=meshTriangles(mesh);if(raw.length>2000)throw Error("Reconstruction triangle budget exceeded.");validateMeshIntersections(mesh,{maxPairs:2_000_000,timeMs:2000});
 const vertices=new Map(mesh.vertices.map(v=>[v.id,v.position])),min=[0,1,2].map(i=>Math.min(...mesh.vertices.map(v=>v.position[i]))),max=[0,1,2].map(i=>Math.max(...mesh.vertices.map(v=>v.position[i]))),diagonal=Math.hypot(...max.map((n,i)=>n-min[i]));
 if(diagonal<.001||diagonal>1e6)throw Error("Supported model diagonal is 0.001–1,000,000 mm.");
 const tolerance=Math.max(options.absoluteTolerance,options.relativeTolerance*diagonal,1e-7);if(tolerance>diagonal*.001)throw Error("Tolerance exceeds 0.1% of model diagonal; refusing feature collapse.");
 const origin=mesh.vertices[0].position;
 const triangles=raw.map(t=>{const p=t.vertices.map(id=>vertices.get(id)!),n=cross(sub(p[1],p[0]),sub(p[2],p[0])),area=Math.hypot(...n)/2,edge=Math.max(...p.map((a,i)=>Math.hypot(...sub(a,p[(i+1)%3]))));return {...t,p,area,normal:unit(n),centroid:mul(p.reduce(add,[0,0,0]),1/3),altitude:2*area/edge,key:`${t.faceId}:${t.vertices.join("/")}`};}).sort((a,b)=>b.area-a.area||a.key.localeCompare(b.key));
 const edges=new Map<string,{a:string;b:string;t:number}[]>(),neighbors=triangles.map(()=>new Set<number>());
 triangles.forEach((t,i)=>t.vertices.forEach((a,j)=>{const b=t.vertices[(j+1)%3],key=JSON.stringify([a,b].sort()),list=edges.get(key)??[];list.push({a,b,t:i});edges.set(key,list);}));
 for(const list of edges.values()){if(list.length>2||list.length===2&&list[0].a===list[1].a)throw Error("Triangle adjacency is non-manifold or inconsistently wound.");if(list.length===2){neighbors[list[0].t].add(list[1].t);neighbors[list[1].t].add(list[0].t);}}
 let components=0;const visited=new Set<number>();for(let i=0;i<triangles.length;i++)if(!visited.has(i)){components++;const queue=[i];visited.add(i);for(let k=0;k<queue.length;k++)for(const j of neighbors[queue[k]])if(!visited.has(j)){visited.add(j);queue.push(j);}}
 const owner=triangles.map(()=>-1),regions:PlanarRegion[]=[],angle=options.angleDegrees*Math.PI/180;
 const compatible=(i:number,n:MeshVector,p:MeshVector)=>{const t=triangles[i],cos=dot(n,t.normal),a=Math.acos(Math.max(-1,Math.min(1,cos)));return cos>0&&(a<=angle||a<=Math.PI/4&&Math.sin(a)*t.altitude<=4*tolerance)&&t.p.every(v=>Math.abs(dot(sub(v,p),n))<=tolerance);};
 for(let seed=0;seed<triangles.length;seed++)if(owner[seed]<0){
  if(regions.length>=128)throw Error("Reconstruction region budget exceeded (128).");const regionIndex=regions.length,s=triangles[seed],members=[seed];owner[seed]=regionIndex;
  for(let k=0;k<members.length;k++)for(const next of [...neighbors[members[k]]].sort((a,b)=>a-b))if(owner[next]<0&&compatible(next,s.normal,s.centroid)){owner[next]=regionIndex;members.push(next);}
  const area=members.reduce((sum,i)=>sum+triangles[i].area,0),normal=unit(members.reduce((sum,i)=>add(sum,mul(triangles[i].normal,triangles[i].area)),[0,0,0] as MeshVector)),center=mul(members.reduce((sum,i)=>add(sum,mul(triangles[i].centroid,triangles[i].area)),[0,0,0] as MeshVector),1/area);
  if(members.some(i=>!compatible(i,normal,center)))throw Error("Area-weighted region fit exceeds tolerance; no automatic tolerance increase.");
  const boundary=[...edges.values()].flatMap(list=>{const inside=list.filter(e=>owner[e.t]===regionIndex);return inside.length===1?inside:[];}),out=new Map<string,string>(),incoming=new Set<string>();
  for(const e of boundary){if(out.has(e.a)||incoming.has(e.b))throw Error("Ambiguous/pinched planar region boundary.");out.set(e.a,e.b);incoming.add(e.b);}
  const loopIds=new Map<MeshVector[],string[]>(),loops:MeshVector[][]=[];while(out.size){const first=[...out.keys()].sort()[0],ids:string[]=[],seen=new Set<string>();let next=first;do{if(seen.has(next)||!out.has(next))throw Error("Unclosed region loop.");seen.add(next);ids.push(next);const to=out.get(next)!;out.delete(next);next=to;}while(next!==first);if(ids.length<3)throw Error("Degenerate region loop.");const loop=ids.map(id=>{const p=vertices.get(id)!;return sub(p,mul(normal,dot(sub(p,center),normal)));});loops.push(loop);loopIds.set(loop,ids);}
  const signed=(loop:MeshVector[])=>loop.reduce((sum,p,i)=>sum+dot(cross(sub(p,center),sub(loop[(i+1)%loop.length],center)),normal)/2,0);
  loops.sort((a,b)=>Math.abs(signed(b))-Math.abs(signed(a)));if(!loops.length||signed(loops[0])<=0||loops.slice(1).some(l=>signed(l)>=0||!planarContains(l[0],loops[0],normal)))throw Error("Region must have one outer loop with consistently oriented contained holes.");
  regions.push({id:`region-${regionIndex}`,origin:center,normal,loops,sourceFaceIds:[...new Set(members.map(i=>triangles[i].faceId))].sort(),triangleCount:members.length,maxPlaneResidual:Math.max(...members.flatMap(i=>triangles[i].p.map(p=>Math.abs(dot(sub(p,center),normal))))),maxNormalAngleDegrees:Math.max(...members.map(i=>Math.acos(Math.max(-1,Math.min(1,dot(triangles[i].normal,normal))))*180/Math.PI)),area,adjacent:[],...healing?{loopVertexIds:loops.map(loop=>loopIds.get(loop)!)}:{}});
 }
 for(const list of edges.values())if(list.length===2){const a=owner[list[0].t],b=owner[list[1].t];if(a!==b){regions[a].adjacent.push(regions[b].id);regions[b].adjacent.push(regions[a].id);}}
 regions.forEach(r=>r.adjacent=[...new Set(r.adjacent)].sort());
 const boundaryEdges=meshEdges(mesh).filter(e=>e.faceIds.length===1).length,closed=boundaryEdges===0,sourceArea=triangles.reduce((sum,t)=>sum+t.area,0),sourceSignedVolume=triangles.reduce((sum,t)=>{const [a,b,c]=t.p.map(p=>sub(p,origin));return sum+dot(a,cross(b,c))/6;},0);
 const facePlanarity=[...new Set(triangles.map(t=>t.faceId))].sort().map(faceId=>{const ts=triangles.filter(t=>t.faceId===faceId),area=ts.reduce((n,t)=>n+t.area,0),normal=unit(ts.reduce((n,t)=>add(n,mul(t.normal,t.area)),[0,0,0] as MeshVector)),center=mul(ts.reduce((n,t)=>add(n,mul(t.centroid,t.area)),[0,0,0] as MeshVector),1/area),maxResidual=Math.max(...ts.flatMap(t=>t.p.map(p=>Math.abs(dot(sub(p,center),normal)))));return {faceId,normal,maxResidual,withinTolerance:maxResidual<=tolerance};});
 let definition:PlanarDefinition={version:1,tolerance,regions};if(healing&&closed&&components===1&&sourceSignedVolume>0){const incident=new Map<string,Set<string>>();triangles.forEach((t,i)=>t.vertices.forEach(id=>{const list=incident.get(id)??new Set<string>();list.add(regions[owner[i]].id);incident.set(id,list);}));definition=healPlanarTopology(definition,mesh,new Map([...incident].map(([id,set])=>[id,[...set].sort()])));}else definition.regions.forEach(r=>delete r.loopVertexIds);if(!validPlanarDefinition(definition))throw Error("Planar definition/loop budget validation failed.");
 const rejection=!closed?"Open Mesh: analysis only; this MVP does not publish open Shells.":components!==1?"Multiple connected components/nested shells are not supported.":sourceSignedVolume<=0?"Outward orientation and positive enclosed volume required.":undefined;
 return {facePlanarity,definition,options:{...options},diagonal,components,boundaryEdges,closed,manifold:true,winding:"consistent",sourceArea,sourceSignedVolume,triangleCount:triangles.length,planarFaces:regions.length,mergedTriangles:triangles.length-regions.length,solidCandidate:!rejection,rejection};
}

export function validReconstructionReceipt(params:Record<string,unknown>):boolean{
 const d=params.reconstruction,r=params.reconstructionReceipt as Record<string,unknown>|undefined;
 if(d&&typeof d==="object"&&(d as PlanarDefinition).sharedTopology&&JSON.stringify(r?.healing)!==JSON.stringify((d as PlanarDefinition).sharedTopology!.report))return false;
 if(!validPlanarDefinition(d)||!r||r.definitionFingerprint!==meshContentSignature(d)||r.version!==1||r.method!=="merged-planar-regions"||!["merged-planar","faceted"].includes(String(r.classification))||!Number.isInteger(r.mergedTriangles)||Number(r.mergedTriangles)<0||r.shellClosed!==true||r.manifold!==true||r.kernelValidity!=="valid"||r.kernelSelfInterference!=="valid"||r.winding!=="outward"||r.components!==1||r.brepFaces!==d.regions.length||!validReconstructionOptions(r.options))return false;
 if(![r.sourceObjectId,r.sourceDocumentId,r.sourceGeometryId,r.sourceFingerprint,r.definitionFingerprint,r.distancePolicy].every(s=>typeof s==="string"&&s.length>0&&s.length<2048)||!Number.isSafeInteger(r.sourceRevision)||Number(r.sourceRevision)<0)return false;
 if(!["sourceTriangles","sourceFaces","sourceArea","resultArea","sourceVolume","resultVolume","effectiveTolerance","sewingTolerance","sampledAcceptance"].every(k=>finite(r[k])&&Number(r[k])>0)||!["sampledMaxDistance","sampledRmsDistance","absoluteAreaDifference","relativeAreaDifference","absoluteVolumeDifference","relativeVolumeDifference"].every(k=>finite(r[k])&&Number(r[k])>=0)||r.effectiveTolerance!==d.tolerance||r.sewingTolerance!==2*d.tolerance||r.sampledAcceptance!==4*d.tolerance+1e-7||Number(r.sampledMaxDistance)>Number(r.sampledAcceptance))return false;
 if(!r.faceMap||typeof r.faceMap!=="object"||Array.isArray(r.faceMap)||Object.keys(r.faceMap).length!==d.regions.length)return false;
 const map=r.faceMap as Record<string,{brepFaceKey:string;sourceFaceIds:string[]}>;
 if(!d.regions.every(region=>map[region.id]&&typeof map[region.id].brepFaceKey==="string"&&map[region.id].brepFaceKey.startsWith("face:")&&JSON.stringify(map[region.id].sourceFaceIds)===JSON.stringify(region.sourceFaceIds)))return false;
 return new Set(Object.values(map).map(v=>v.brepFaceKey)).size===d.regions.length&&["sourceToBrep","brepToSource"].every(k=>{const s=r[k] as {max:number;rms:number;samples:number};return s&&finite(s.max)&&finite(s.rms)&&s.max>=0&&s.rms>=0&&Number.isInteger(s.samples)&&s.samples>0&&s.samples<=512;})&&Array.isArray(r.losses)&&r.losses.every(s=>typeof s==="string");
}
