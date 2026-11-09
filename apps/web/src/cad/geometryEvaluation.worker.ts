import {GeometryNodeEvaluator} from "@agent-webcad/cad-document";
import {runGeometryEvaluation,type GeometryEvaluationRequest} from "./geometryEvaluationProtocol";
const evaluator=new GeometryNodeEvaluator();
self.onmessage=(event:MessageEvent<{id:number;request:GeometryEvaluationRequest}>)=>{const {id,request}=event.data;try{self.postMessage({id,result:runGeometryEvaluation(request,evaluator)});}catch(e){self.postMessage({id,error:e instanceof Error?e.message:String(e)});}};
