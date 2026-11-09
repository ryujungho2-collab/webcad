import {deserializeDocument,type CadDocument} from "@agent-webcad/cad-document";
import {sculptMesh,remeshMesh,type SculptStroke,type RemeshOptions} from "@agent-webcad/cad-document";
import {GeometryNodeEvaluator,evaluateMeshModifiers,validateMeshIntersections,GEOMETRY_BUDGET,type EditableMesh,type GeometryNodeGraph,type NodeMeshValue,type MeshEvaluation,type GeometryNodeResult} from "@agent-webcad/cad-document";
export type GeometryEvaluationRequest={kind:"document";text:string}|{kind:"sculpt"|"sculpt-preview";mesh:EditableMesh;stroke:SculptStroke}|{kind:"remesh";mesh:EditableMesh;options:RemeshOptions;token:string}|{kind:"mesh";mesh:EditableMesh;strict:boolean}|{kind:"graph";graph:GeometryNodeGraph;inputs:Record<string,NodeMeshValue>};
export type GeometryEvaluationResult=CadDocument|MeshEvaluation|GeometryNodeResult|ReturnType<typeof sculptMesh>|ReturnType<typeof remeshMesh>;
export function runGeometryEvaluation(request:GeometryEvaluationRequest,evaluator:GeometryNodeEvaluator,checkpoint:()=>void=()=>{}):GeometryEvaluationResult{
 checkpoint();if(JSON.stringify(request).length*2>GEOMETRY_BUDGET.bytes)throw Error("Geometry request memory budget exceeded.");const started=performance.now();
 const result=request.kind==="document"?deserializeDocument(request.text):(request.kind==="sculpt"||request.kind==="sculpt-preview")?sculptMesh(request.mesh,request.stroke,checkpoint,request.kind!=="sculpt-preview"):request.kind==="remesh"?remeshMesh(request.mesh,request.options,request.token,checkpoint):request.kind==="graph"?evaluator.evaluate(request.graph,request.inputs,checkpoint):evaluateMeshModifiers(request.mesh);checkpoint();
 if(request.kind==="mesh"&&request.strict){validateMeshIntersections(request.mesh);validateMeshIntersections((result as MeshEvaluation).mesh);}
 if(performance.now()-started>GEOMETRY_BUDGET.timeMs||JSON.stringify(result).length*2>GEOMETRY_BUDGET.bytes)throw Error("Geometry evaluation time or memory budget exceeded.");return result;
}
