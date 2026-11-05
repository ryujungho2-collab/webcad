import {geometryGraphInputs,nodeMeshValue,transformNodeMesh,type NodeMeshValue} from "@agent-webcad/cad-document";
import {GEOMETRY_BUDGET,GeometryNodeEvaluator,rememberMeshEvaluation,rememberGraphEvaluation,graphDocumentInputs,type CadDocument,type CadFeature,type EditableMesh,type MeshEvaluation,type GeometryNodeResult,type GeometryNodeGraph} from "@agent-webcad/cad-document";
import {runGeometryEvaluation,type GeometryEvaluationRequest,type GeometryEvaluationResult} from "./geometryEvaluationProtocol";
type Port={postMessage:(value:unknown)=>void;terminate:()=>void;onmessage:((event:{data:any})=>void)|null;onerror:((event:any)=>void)|null};
type Options={signal?:AbortSignal;scope?:string;isCurrent?:()=>boolean;timeoutMs?:number};
type Job={id:number;request:GeometryEvaluationRequest;options:Options;resolve:(value:GeometryEvaluationResult)=>void;reject:(error:Error)=>void;cleanup:()=>void;timer?:ReturnType<typeof setTimeout>};
/** One bounded worker, queue, hard cancellation, response identity and caller revision guards. */
export class GeometryEvaluationClient{
 private port?:Port;private active?:Job;private queue:Job[]=[];private serial=0;private fallback=new GeometryNodeEvaluator();
 constructor(private factory?:()=>Port){}
 evaluate(request:GeometryEvaluationRequest,options:Options={}):Promise<GeometryEvaluationResult>{
  if(JSON.stringify(request).length*2>GEOMETRY_BUDGET.bytes)return Promise.reject(new Error("Geometry request memory budget exceeded before Worker transfer."));
  if(options.signal?.aborted)return Promise.reject(new Error("Geometry evaluation cancelled."));
  if(options.scope){for(const j of [...this.queue,...this.active?[this.active]:[]])if(j.options.scope===options.scope)this.cancel(j,"Geometry evaluation superseded.");}
  if(this.queue.length>=16)return Promise.reject(new Error("Geometry worker queue budget exceeded."));
  return new Promise((resolve,reject)=>{const job:Job={id:++this.serial,request:structuredClone(request),options,resolve,reject,cleanup:()=>{}};const abort=()=>this.cancel(job,"Geometry evaluation cancelled.");options.signal?.addEventListener("abort",abort,{once:true});job.cleanup=()=>options.signal?.removeEventListener("abort",abort);this.queue.push(job);this.start();});
 }
 private cancel(job:Job,reason:string){const index=this.queue.indexOf(job);if(index>=0)this.queue.splice(index,1);else if(this.active!==job)return;if(this.active===job){this.port?.terminate();this.port=undefined;this.active=undefined;}clearTimeout(job.timer);job.cleanup();job.reject(new Error(reason));this.start();}
 private finish(job:Job,result?:GeometryEvaluationResult,error?:string){if(this.active!==job)return;this.active=undefined;clearTimeout(job.timer);job.cleanup();if(error||job.options.signal?.aborted||job.options.isCurrent&&!job.options.isCurrent())job.reject(new Error(error??"Stale geometry evaluation result."));else job.resolve(result!);this.start();}
 private start(){if(this.active||!this.queue.length)return;const job=this.active=this.queue.shift()!;job.timer=setTimeout(()=>this.cancel(job,"Geometry worker deadline exceeded."),job.options.timeoutMs??5000);
  if(!this.factory){Promise.resolve().then(()=>{if(this.active!==job)return;try{this.finish(job,runGeometryEvaluation(job.request,this.fallback,()=>{if(job.options.signal?.aborted)throw Error("Geometry evaluation cancelled.");}));}catch(e){this.finish(job,undefined,String(e));}});return;}
  try{if(!this.port){const port=this.port=this.factory();port.onmessage=event=>{if(this.port!==port)return;const current=this.active;if(!current||event.data.id!==current.id)return;this.finish(current,event.data.result,event.data.error);};port.onerror=()=>{if(this.port!==port)return;const current=this.active;this.port?.terminate();this.port=undefined;if(current)this.finish(current,undefined,"Geometry worker failed; document was not changed.");};}this.port.postMessage({id:job.id,request:job.request});}catch(e){this.finish(job,undefined,String(e));}
 }
 dispose(){for(const j of [...this.queue])this.cancel(j,"Geometry client disposed.");if(this.active)this.cancel(this.active,"Geometry client disposed.");this.port?.terminate();this.port=undefined;}
}
export const geometryEvaluationClient=new GeometryEvaluationClient(typeof Worker==="undefined"?undefined:()=>new Worker(new URL("./geometryEvaluation.worker.ts",import.meta.url),{type:"module"}) as unknown as Port);
export async function evaluateMeshAsync(mesh:EditableMesh,options:Options={},strict=false){const result=await geometryEvaluationClient.evaluate({kind:"mesh",mesh,strict},options) as MeshEvaluation;rememberMeshEvaluation(mesh,result);return result;}
export async function evaluateGraphAsync(document:CadDocument,feature:CadFeature,options:Options={},visiting=new Set<string>()):Promise<GeometryNodeResult>{
 if(visiting.has(feature.output)||visiting.size>64)throw Error("Cyclic or excessive Geometry Nodes source chain.");const next=new Set(visiting).add(feature.output),revision=document.revision,graph=feature.params.graph as GeometryNodeGraph,inputs:Record<string,NodeMeshValue>={};let bytes=0;
 for(const id of geometryGraphInputs(graph)){options.signal?.throwIfAborted();const source=Object.values(document.features).find(f=>f.output===id),object=document.objects[id];if(!source||!object)throw Error(`Missing Geometry Nodes input ${id}.`);let value:NodeMeshValue;
  if(source.type==="mesh"){await evaluateMeshAsync(source.params.mesh as EditableMesh,{...options,scope:options.scope?`${options.scope}:${id}`:undefined});value=nodeMeshValue(source.params.mesh as EditableMesh,`object:${id}`);}
  else if(source.type==="geometry-nodes")value=(await evaluateGraphAsync(document,source,{...options,scope:options.scope?`${options.scope}:${id}`:undefined},next)).output;
  else throw Error("Group Input supports editable Mesh or Geometry Nodes only.");
  bytes+=JSON.stringify(value).length*2;if(bytes>GEOMETRY_BUDGET.bytes)throw Error("External graph input memory budget exceeded.");const t=object.transform??{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};inputs[id]=transformNodeMesh(value,t.translation,t.rotation,t.scale);
 }
 if(document.revision!==revision)throw Error("Stale source graph evaluation.");const result=await geometryEvaluationClient.evaluate({kind:"graph",graph,inputs},{...options,isCurrent:()=>document.revision===revision&&(!options.isCurrent||options.isCurrent())}) as GeometryNodeResult;rememberGraphEvaluation(graph,inputs,result);return result;
}
