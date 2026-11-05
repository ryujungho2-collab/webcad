import {applyGeometryGraphActions,geometryGraphInputs,type CadDocument,type GeometryNodeGraph} from "@agent-webcad/cad-document";
import type {CommandBus} from "@agent-webcad/cad-commands";
import {evaluateGraphAsync} from "../cad/geometryEvaluationClient";
import type {CooperativeTask} from "./cooperativeTask";
export function registerGeometryNodeCommands(bus:CommandBus,document:CadDocument,task:CooperativeTask={}){
 bus.registerHandler("create-geometry-graph",async command=>{
  if(command.type!=="create-geometry-graph")return;const id=command.id??`nodes-${crypto.randomUUID()}`,featureId=`feature-${id}`,layerId=command.layerId??"layer-default",layer=document.layers[layerId];
  if(!layer?.visible||layer.locked||document.objects[id]||document.features[featureId])throw Error("Unique object ID and visible unlocked layer required.");
  document.objects[id]={id,name:"Geometry Nodes",geometryId:`geometry-${id}`,layerId,visible:true,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
  const feature=document.features[featureId]={id:featureId,type:"geometry-nodes" as const,dependencyMode:"live" as const,inputs:geometryGraphInputs(command.graph),output:id,params:{graph:structuredClone(command.graph)}};
  await evaluateGraphAsync(document,feature,{signal:task.signal});document.rootObjects.push(id);layer.objectIds.push(id);document.revision++;return {accepted:true,createdIds:[id]};
 });
 bus.registerHandler("edit-geometry-graph",async command=>{
  if(command.type!=="edit-geometry-graph")return;const object=document.objects[command.objectId],layer=object&&document.layers[object.layerId],feature=Object.values(document.features).find(f=>f.output===command.objectId);
  if(!object?.visible||!layer?.visible||layer.locked||feature?.type!=="geometry-nodes")throw Error("Select a visible unlocked Geometry Nodes object.");
  const graph=applyGeometryGraphActions(feature.params.graph as GeometryNodeGraph,command.actions);feature.params={graph};feature.inputs=geometryGraphInputs(graph);await evaluateGraphAsync(document,feature,{signal:task.signal});document.revision++;return {accepted:true,createdIds:[]};
 });
}
