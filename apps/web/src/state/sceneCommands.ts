import type { CommandBus } from "@agent-webcad/cad-commands";
import type { CadDocument, CadScene } from "@agent-webcad/cad-document";
import { evaluateScene } from "../scenes/sceneEvaluation";

export function newScene(artboardId:string,objectIds:string[]=[]):CadScene {
 return {id:`scene-${crypto.randomUUID()}`,name:"Scene",artboardId,objectIds:[...objectIds],notes:"",layout:{direction:"free",gap:5,padding:5},durationMs:2000,autoAdvance:false,states:[],links:[],tracks:[]};
}
export function registerSceneCommands(bus:CommandBus,document:CadDocument){
 bus.registerHandler("upsert-scene",command=>{
  if(command.type!=="upsert-scene")return;
  const previous=document.scenes?.[command.scene.id];
  if(document.artboards?.[command.scene.artboardId]?.locked||previous&&document.artboards?.[previous.artboardId]?.locked)return {accepted:false,reason:"Unlock the scene's artboard before changing its layout or playback."};
  if(JSON.stringify(previous)===JSON.stringify(command.scene))return {accepted:false,reason:"Scene is unchanged."};
  evaluateScene(document,command.scene,command.scene.durationMs);
  (document.scenes??={})[command.scene.id]=structuredClone(command.scene);document.revision++;
 });
 bus.registerHandler("delete-scene",command=>{
  if(command.type!=="delete-scene")return;const scene=document.scenes?.[command.sceneId];
  if(!scene)return {accepted:false,reason:"Select an existing scene."};
  if(document.artboards?.[scene.artboardId]?.locked)return {accepted:false,reason:"Unlock the scene's artboard before deleting it."};
  delete document.scenes![scene.id];if(!Object.keys(document.scenes!).length)delete document.scenes;document.revision++;
 });
}
