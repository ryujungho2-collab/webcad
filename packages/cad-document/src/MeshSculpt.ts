import {validateEditableMesh,meshVector,type EditableMesh,type MeshVector} from "./EditableMesh";
import {add,sub,mul,dot,cross,unit,meshTriangles} from "./MeshTopology";
import {MeshSurfaceIndex,MeshVertexIndex} from "./MeshSpatialIndex";
import {appendMeshProvenance} from "./MeshProvenance";
import {validateMeshIntersections} from "./MeshIntersection";
export const SCULPT_BUDGET={vertices:5000,faces:10000,triangles:20000,samples:128,timeMs:3500} as const;
export const SCULPT_BRUSHES=["grab","draw","smooth","inflate","crease","flatten"] as const;
export type SculptStroke={brush:typeof SCULPT_BRUSHES[number];radius:number;strength:number;falloff:"linear"|"smooth"|"sharp";spacing:number;symmetry:boolean;samples:{origin:MeshVector;direction:MeshVector;delta?:MeshVector}[]};
export function validSculptStroke(v:unknown):v is SculptStroke{const s=v as SculptStroke;return !!s&&Object.keys(s).every(k=>["brush","radius","strength","falloff","spacing","symmetry","samples"].includes(k))&&SCULPT_BRUSHES.includes(s.brush)&&Number.isFinite(s.radius)&&s.radius>=.0001&&s.radius<=1e6&&Number.isFinite(s.strength)&&Math.abs(s.strength)<=1&&s.strength!==0&&["linear","smooth","sharp"].includes(s.falloff)&&Number.isFinite(s.spacing)&&s.spacing>=.02&&s.spacing<=1&&typeof s.symmetry==="boolean"&&Array.isArray(s.samples)&&s.samples.length>0&&s.samples.length<=128&&s.samples.every(p=>p&&Object.keys(p).every(k=>["origin","direction","delta"].includes(k))&&meshVector(p.origin)&&meshVector(p.direction)&&Math.hypot(...p.direction)>1e-10&&(p.delta===undefined||meshVector(p.delta)&&Math.hypot(...p.delta)<=s.radius*2));}
export function sculptMesh(source:EditableMesh,stroke:SculptStroke,checkpoint:()=>void=()=>{},validate=true){
 const started=performance.now();if(!validSculptStroke(stroke))throw Error("Invalid sculpt stroke.");if(source?.vertices?.length>SCULPT_BUDGET.vertices||source?.faces?.length>SCULPT_BUDGET.faces)throw Error("Sculpt budget: at most 5,000 vertices / 10,000 faces. Larger CAD meshes remain supported for other operations.");if(Array.isArray(source?.faces)&&source.faces.reduce((n,f)=>n+(Array.isArray(f?.vertices)?f.vertices.length-2:Infinity),0)>SCULPT_BUDGET.triangles)throw Error("Sculpt render triangle budget exceeded: 20,000 triangles.");if(!validateEditableMesh(source))throw Error("Invalid sculpt source mesh.");if(source.modifiers?.some(m=>m.enabled&&m.level>0))throw Error("Bake evaluated modifiers before sculpting.");
 const timings:Record<string,number>={inputValidationMs:performance.now()-started};let stage=performance.now();const next=structuredClone(source);timings.cloneMs=performance.now()-stage;stage=performance.now();const surface=new MeshSurfaceIndex(source);timings.surfaceBvhMs=performance.now()-stage;stage=performance.now();const index=new MeshVertexIndex(source,stroke.radius);timings.vertexHashMs=performance.now()-stage;stage=performance.now();const positions=new Map(source.vertices.map(v=>[v.id,v.position])),neighbors=new Map<string,Set<string>>(),normals=new Map(source.vertices.map(v=>[v.id,[0,0,0] as MeshVector]));
 for(const t of meshTriangles(source)){const [a,b,c]=t.vertices.map(id=>positions.get(id)!),n=cross(sub(b,a),sub(c,a));for(const id of t.vertices){normals.set(id,add(normals.get(id)!,n));const adjacent=neighbors.get(id)??new Set<string>();t.vertices.filter(x=>x!==id).forEach(x=>adjacent.add(x));neighbors.set(id,adjacent);}}
 timings.adjacencyNormalsMs=performance.now()-stage;stage=performance.now();
 const changed=new Set<string>();let previous:MeshVector|undefined,hits=0,accepted=0;
 const samples=stroke.brush==="grab"?[{...stroke.samples[0],delta:stroke.samples.at(-1)?.delta}]:stroke.samples;
 for(const sample of samples){checkpoint();if(performance.now()-started>SCULPT_BUDGET.timeMs)throw Error("Sculpt evaluation time budget exceeded.");const hit=surface.raycast(sample.origin,sample.direction);if(!hit)continue;hits++;if(previous&&Math.hypot(...sub(previous,hit.point))<stroke.radius*stroke.spacing)continue;previous=hit.point;accepted++;
  const affected=new Map<number,{center:MeshVector;normal:MeshVector;delta:MeshVector;weight:number}>();
  for(const mirror of stroke.symmetry?[1,-1]:[1]){const center=[hit.point[0]*mirror,hit.point[1],hit.point[2]] as MeshVector,normal=[hit.normal[0]*mirror,hit.normal[1],hit.normal[2]] as MeshVector,raw=sample.delta??[0,0,0],delta=[raw[0]*mirror,raw[1],raw[2]] as MeshVector;
   for(const i of index.sphere(center,stroke.radius)){const p=source.vertices[i].position,t=1-Math.hypot(...sub(p,center))/stroke.radius,weight=stroke.falloff==="smooth"?t*t*(3-2*t):stroke.falloff==="sharp"?t*t*t:t;if(weight>(affected.get(i)?.weight??-1))affected.set(i,{center,normal,delta,weight});}
  }
  for(const [i,{center,normal,delta,weight}] of affected){const v=source.vertices[i],p=v.position,w=weight*stroke.strength;let offset:MeshVector;
   if(stroke.brush==="grab")offset=mul(delta,w);
   else if(stroke.brush==="draw")offset=mul(normal,w*stroke.radius*.1);
   else if(stroke.brush==="inflate")offset=mul(unit(normals.get(v.id)!),w*stroke.radius*.1);
   else if(stroke.brush==="smooth"){const adjacent=[...neighbors.get(v.id)!].map(id=>positions.get(id)!);offset=mul(sub(mul(adjacent.reduce(add,[0,0,0]),1/adjacent.length),p),Math.abs(w)*.5);}
   else if(stroke.brush==="flatten")offset=mul(normal,-dot(sub(p,center),normal)*Math.abs(w));
   else{const inward=sub(center,p),tangent=sub(inward,mul(normal,dot(inward,normal)));offset=add(mul(tangent,Math.abs(w)*.25),mul(normal,-w*stroke.radius*.05));}
   if(stroke.symmetry&&Math.abs(p[0])<1e-9)offset[0]=0;
   if(Math.hypot(...offset)>1e-12){next.vertices[i].position=add(next.vertices[i].position,offset);changed.add(v.id);}
  }
 }
 if(!hits)throw Error("Sculpt rays missed the source surface.");if(!changed.size)throw Error("Stroke affected no vertices; enlarge the radius or refine the mesh.");
 timings.deformationMs=performance.now()-stage;stage=performance.now();
 if(validate){if(!validateEditableMesh(next))throw Error("Sculpt produced degenerate or non-manifold geometry.");timings.outputValidationMs=performance.now()-stage;stage=performance.now();validateMeshIntersections(next);timings.intersectionMs=performance.now()-stage;stage=performance.now();if(next.version===2)appendMeshProvenance(source,next,{operation:`sculpt-${stroke.brush}`,vertices:{},edges:{},faces:{},generated:{vertices:[],edges:[],faces:[]},deleted:{vertices:[],edges:[],faces:[]}});}
 timings.provenanceMs=validate?performance.now()-stage:0;
 return {timings,mesh:next,changedVertexIds:[...changed],samples:accepted,elapsedMs:performance.now()-started};
}
