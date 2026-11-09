import {GeometryNodeEvaluator,createGeometryGraph,applyGeometryGraphActions} from "@agent-webcad/cad-document";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
const rows=[];
const stats=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return {medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1]};};
for(const preset of ["subdivision","sweep","instances"] as const){const graph=createGeometryGraph(preset),evaluator=new GeometryNodeEvaluator(),cold:number[]=[],warm:number[]=[],partial:number[]=[];let result=evaluator.evaluate(graph);
 for(let i=0;i<15;i++){const start=performance.now();result=new GeometryNodeEvaluator().evaluate(graph);cold.push(performance.now()-start);}
 for(let i=0;i<15;i++){const start=performance.now();evaluator.evaluate(graph);warm.push(performance.now()-start);}
 const target=graph.nodes.find(n=>n.id===(preset==="sweep"?"profile":"primitive"))!;let recomputed:string[]=[];
 for(let i=0;i<15;i++){const changed=applyGeometryGraphActions(graph,[{kind:"parameters",nodeId:target.id,params:{...target.params,...preset==="sweep"?{radius:2+i*.01}:{size:9+i*.01}}}]);const start=performance.now(),updated=evaluator.evaluate(changed);partial.push(performance.now()-start);recomputed=updated.nodes.filter(n=>!n.cached).map(n=>n.id);}
 rows.push({preset,vertices:result.output.mesh.vertices.length,faces:result.output.mesh.faces.length,estimatedValueBytes:result.bytes,cold:stats(cold),warm:stats(warm),partial:stats(partial),recomputed});
}
const report={date:new Date().toISOString(),runtime:process.version,platform:process.platform,scope:"15 samples per case, synchronous evaluator including output intersection validation; excludes browser startup, Worker transfer and GPU rendering",rows};
const directory=resolve(process.cwd(),"../../output/verification/geometry-nodes-phase-3");await mkdir(directory,{recursive:true});await writeFile(resolve(directory,"benchmark.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
