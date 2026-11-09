import type {CadDocument} from "./CadDocument";
import type {CadFeature} from "./Feature";
import type {MeshVector,EditableMesh} from "./EditableMesh";
import {geometryGraphInputs,type GeometryNodeGraph,validateGeometryGraph} from "./GeometryNodes";
import {GeometryNodeEvaluator,nodeMeshValue,transformNodeMesh,type NodeMeshValue,type GeometryNodeResult} from "./GeometryNodeEvaluation";

const evaluator=new GeometryNodeEvaluator(),results=new Map<string,GeometryNodeResult>();let bytes=0;
export function graphEvaluationKey(graph:GeometryNodeGraph,inputs:Record<string,NodeMeshValue>){return JSON.stringify([graph,inputs]);}
export function rememberGraphEvaluation(graph:GeometryNodeGraph,inputs:Record<string,NodeMeshValue>,result:GeometryNodeResult){
 const key=graphEvaluationKey(graph,inputs),size=(key.length+JSON.stringify(result).length)*2;if(size>32_000_000)throw Error("Graph result cache budget exceeded.");
 if(results.has(key))return;while(results.size&&(results.size>=8||bytes+size>32_000_000)){const first=results.keys().next().value!;bytes-=(first.length+JSON.stringify(results.get(first)).length)*2;results.delete(first);}results.set(key,structuredClone(result));bytes+=size;
}
export function cachedGraphEvaluation(graph:GeometryNodeGraph,inputs:Record<string,NodeMeshValue>){const r=results.get(graphEvaluationKey(graph,inputs));return r?structuredClone(r):undefined;}
export function graphDocumentInputs(document:CadDocument,feature:CadFeature,visiting=new Set<string>()):Record<string,NodeMeshValue>{
 if(visiting.has(feature.output))throw Error("Cyclic CAD Geometry Nodes dependency.");visiting=new Set(visiting).add(feature.output);
 const graph=feature.params.graph as GeometryNodeGraph,inputs:Record<string,NodeMeshValue>={};let inputBytes=0;for(const id of geometryGraphInputs(graph)){
  const source=Object.values(document.features).find(f=>f.output===id),object=document.objects[id];if(!source||!object)throw Error(`Missing Geometry Nodes input ${id}.`);
  let value:NodeMeshValue;if(source.type==="mesh")value=nodeMeshValue(source.params.mesh as EditableMesh,`object:${id}`);else if(source.type==="geometry-nodes")value=evaluateDocumentGeometryGraph(document,source,visiting).output;else throw Error("Group Input supports editable Mesh or Geometry Nodes; BRep conversion is not implemented.");
  const t=object.transform??{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};inputBytes+=JSON.stringify(value).length*2;if(inputBytes>16_000_000)throw Error("External graph inputs exceed memory estimate budget.");inputs[id]=transformNodeMesh(value,t.translation as MeshVector,t.rotation as MeshVector,t.scale as MeshVector);
 }return inputs;
}
export function evaluateDocumentGeometryGraph(document:CadDocument,feature:CadFeature,visiting=new Set<string>()){
 const graph=feature.params.graph as GeometryNodeGraph;if(!validateGeometryGraph(graph).valid)throw Error("Invalid Geometry Nodes graph.");const inputs=graphDocumentInputs(document,feature,visiting),cached=cachedGraphEvaluation(graph,inputs);if(cached)return cached;
 const result=evaluator.evaluate(graph,inputs);rememberGraphEvaluation(graph,inputs,result);return result;
}
