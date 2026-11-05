import {writeFile} from "node:fs/promises";
import {createPolygonMesh,validateMeshIntersections,validateEditableMesh,MeshSurfaceIndex,MeshVertexIndex,meshTriangles,remeshMesh,sculptMesh,type SculptStroke} from "@agent-webcad/cad-document";
import {sculptGrid} from "../tests/helpers/sculptFixtures";
const rows:any[]=[],conversions:any[]=[];
const timed=(fn:()=>unknown)=>{const start=performance.now(),cpu=process.cpuUsage();fn();const used=process.cpuUsage(cpu);return {wallMs:performance.now()-start,cpuMs:(used.user+used.system)/1000};};
const stroke:SculptStroke={brush:"draw",radius:8,strength:.1,falloff:"smooth",spacing:.15,symmetry:false,samples:[{origin:[50,50,30],direction:[0,0,-1]}]};
for(const cells of [64,96])for(let repeat=0;repeat<5;repeat++){
 const source=sculptGrid(cells),mesh=structuredClone(source),changed=new Set<string>();
 // Diagnostic deformation only: the 9,409 vertex input remains rejected by the production Sculpt budget.
 for(const v of mesh.vertices){const t=1-Math.hypot(v.position[0]-50,v.position[1]-50)/8;if(t>0){v.position[2]+=.08*t*t*(3-2*t);changed.add(v.id);}}
 const row:any={vertices:mesh.vertices.length,faces:mesh.faces.length,repeat,changedVertices:changed.size,changedFaces:mesh.faces.filter(f=>f.vertices.some(id=>changed.has(id))).length};
 row.serialize=timed(()=>JSON.stringify(mesh));row.clone=timed(()=>structuredClone(mesh));row.surfaceBvh=timed(()=>new MeshSurfaceIndex(mesh));row.vertexHash=timed(()=>new MeshVertexIndex(mesh,8));row.triangulation=timed(()=>meshTriangles(mesh));row.structural=timed(()=>{if(!validateEditableMesh(mesh))throw Error("Invalid diagnostic fixture");});
 for(const [name,timeMs] of [["production",1500],["diagnostic",15000]] as const){const profile:any={};try{row[name]=timed(()=>validateMeshIntersections(mesh,{timeMs,profile}));}catch(e){row[name]={error:String(e)};}row[name].profile=profile;}
 try{const r=sculptMesh(source,stroke);row.sculpt={elapsedMs:r.elapsedMs,timings:r.timings};}catch(e){row.sculpt={error:String(e)};}
 rows.push(row);
}
for(const fixture of ["aligned-box","oblique-box","open-ngon"]){const source=createPolygonMesh(40,fixture==="open-ngon"?"ngon":"cube",6);if(fixture==="oblique-box")for(const v of source.vertices){const [x,y,z]=v.position;v.position=[x+.3*z,y+.17*x,z];}
 for(const options of [{method:"surface",iterations:1,relaxation:0},{method:"surface",iterations:3,relaxation:.15},...[4,8,12,16,24].map(resolution=>({method:"voxel",resolution}))] as const){try{const result=remeshMesh(source,options as any,"accuracy");conversions.push({fixture,options,report:result.report});}catch(e){conversions.push({fixture,options,error:String(e)});}}
}
const report={date:new Date().toISOString(),runtime:process.version,notes:["Five repetitions in one process; first includes cold JIT. Synchronous stage wall time and process CPU time are separate. No GC control.","15-second diagnostic intersections do not relax production budgets or certify 9,409-vertex Sculpt support.","Sampled symmetric surface distance is a lower estimate of Hausdorff distance, not a certified bound. Grid alignment can produce misleading zero error.","Volume is absolute algebraic triangle volume; Euler and boundary-edge counts do not fully classify topology. GPU time and Worker memory are excluded."],rows,conversions};
await writeFile("../../output/verification/sculpt-phase-4/validation-profile.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
