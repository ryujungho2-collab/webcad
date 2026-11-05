import {defaultGeometryNode,GEOMETRY_NODE_TYPES,createGeometryGraph,applyGeometryGraphActions,geometryGraphInputs,validateGeometryGraph,type GeometryNodeGraph,type GeometryGraphAction,type GeometryNode,type MeshVector} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {validateCommand} from "@agent-webcad/cad-commands";
import type {CadModelingContext} from "./cadModelingTools";
import type {CopilotPlan} from "./copilotPlan";
import {CAD_TOOLS,type CadToolCall} from "./cadToolContract";
import {evaluateGraphAsync} from "../cad/geometryEvaluationClient";

export function planGeometryNodeTools(calls:CadToolCall[],context:CadModelingContext):CopilotPlan|undefined{
 if(!calls.some(c=>c.name.startsWith("nodes.")))return;if(calls.some(c=>!c.name.startsWith("nodes.")))throw Error("Keep Geometry Nodes edits in one separate reviewed proposal.");
 const commands:Exclude<CadCommand,{type:"batch"}>[]=[],graphs=new Map<string,GeometryNodeGraph>(),resultIds=new Set<string>();
 for(const call of calls){const a=call.arguments,id=String(call.name==="nodes.create"?a.id:a.objectId);let graph:GeometryNodeGraph,command:Exclude<CadCommand,{type:"batch"}>;
  if(call.name==="nodes.create"){if(context.document.objects[id]||graphs.has(id))throw Error("Object ID already exists.");graph=createGeometryGraph(a.preset as "subdivision"|"sweep"|"instances"|"input",String(a.sourceObjectId??""));command={type:"create-geometry-graph",id,layerId:context.layerId,graph};}
  else{const object=context.document.objects[id],layer=object&&context.document.layers[object.layerId],feature=Object.values(context.document.features).find(f=>f.output===id);if(!graphs.has(id)&&(!context.selectionIds.includes(id)||!object?.visible||!layer?.visible||layer.locked||feature?.type!=="geometry-nodes"))throw Error("Select the visible unlocked Geometry Nodes object before editing.");graph=graphs.get(id)??feature!.params.graph as GeometryNodeGraph;let actions:GeometryGraphAction[];
   if(call.name==="nodes.add")actions=[{kind:"add",node:{id:String(a.nodeId),type:a.nodeType as GeometryNode["type"],params:JSON.parse(String(a.parametersJson))}}];
   else if(call.name==="nodes.remove")actions=[{kind:"remove",nodeId:String(a.nodeId)}];
   else if(call.name==="nodes.parameters")actions=[{kind:"parameters",nodeId:String(a.nodeId),params:JSON.parse(String(a.parametersJson))}];
   else if(call.name==="nodes.connect")actions=[...(a.replace===true&&graph.links.some(l=>l.to===a.to&&l.input===a.input)?[{kind:"disconnect" as const,nodeId:String(a.to),input:String(a.input)}]:[]),{kind:"connect",link:{from:String(a.from),to:String(a.to),input:String(a.input)}}];
   else if(call.name==="nodes.disconnect")actions=[{kind:"disconnect",nodeId:String(a.nodeId),input:String(a.input)}];
   else if(call.name==="nodes.edit")actions=JSON.parse(String(a.actionsJson));
   else throw Error("Graph read tools do not produce commands.");
   command={type:"edit-geometry-graph",objectId:id,actions};graph=applyGeometryGraphActions(graph,actions);
  }
  const previous=graphs.get(id)??Object.values(context.document.features).find(f=>f.output===id)?.params.graph as GeometryNodeGraph|undefined,oldInputs=previous?geometryGraphInputs(previous):[];
  for(const source of geometryGraphInputs(graph).filter(source=>!oldInputs.includes(source))){const o=context.document.objects[source],l=o&&context.document.layers[o.layerId];if(!context.selectionIds.includes(source)||!o?.visible||!l?.visible||l.locked)throw Error("New Group Inputs require explicitly selected visible unlocked source objects.");}
  if(!validateCommand(command))throw Error("Invalid Geometry Nodes command.");commands.push(command);graphs.set(id,graph);resultIds.add(id);
 }
 return {command:commands.length===1?commands[0]:{type:"batch",label:"Geometry Nodes",commands},ghosts:[],resultObjectIds:[...resultIds],summary:["타입 그래프를 검증하고 예산 안에서 평가한 뒤 적용합니다.","제어 원본은 유지되며 평가 결과는 직접 편집할 수 없습니다."],toolSteps:calls.map(c=>CAD_TOOLS[c.name].label)};
}
export async function readGeometryNodes(context:CadModelingContext,call:CadToolCall,signal?:AbortSignal){
 if(call.name==="nodes.catalog")return Object.entries(GEOMETRY_NODE_TYPES).map(([type,contract])=>({type,...contract,defaultParameters:defaultGeometryNode(type as GeometryNode["type"],"example").params}));
 const a=call.arguments,id=String(a.objectId),feature=Object.values(context.document.features).find(f=>f.output===id);if(feature?.type!=="geometry-nodes")throw Error("Object is not a Geometry Nodes feature.");const graph=feature.params.graph as GeometryNodeGraph,offset=Number(a.offset??0),limit=Number(a.limit??20);if(!Number.isInteger(offset)||!Number.isInteger(limit))throw Error("Integer page bounds required.");
 if(call.name==="nodes.inspect")return {objectId:id,graphVersion:graph.version,output:graph.output,inputs:feature.inputs,total:graph.nodes.length,nodes:graph.nodes.slice(offset,offset+limit),links:graph.links,nextOffset:offset+limit<graph.nodes.length?offset+limit:null,validation:validateGeometryGraph(graph)};
 const validation=validateGeometryGraph(graph);if(call.name==="nodes.validate"){try{const result=await evaluateGraphAsync(context.document,feature,{signal});return {structural:validation,evaluation:"valid",vertices:result.output.mesh.vertices.length,faces:result.output.mesh.faces.length,budgetBytes:result.bytes};}catch(e){return {structural:validation,evaluation:"rejected",reason:String(e)};}}
 const result=await evaluateGraphAsync(context.document,feature,{signal}),mode=a.mode==="vertex"?"vertex":"face",elements=mode==="vertex"?result.output.mesh.vertices:result.output.mesh.faces;
 return {objectId:id,derived:true,editable:false,mode,total:elements.length,elements:elements.slice(offset,offset+limit).map(e=>({...e,source:mode==="vertex"?result.output.vertexSources[e.id]:result.output.faceSources[e.id]})),nextOffset:offset+limit<elements.length?offset+limit:null,nodes:result.nodes,elapsedMs:result.elapsedMs,bytes:result.bytes};
}
