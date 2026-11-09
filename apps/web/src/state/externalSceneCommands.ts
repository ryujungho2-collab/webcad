import {validateExternalScenes,decodeSceneBytes,sceneHash,type CadDocument} from '@agent-webcad/cad-document';
import type {CommandBus} from '@agent-webcad/cad-commands';

export function registerExternalSceneCommands(bus:CommandBus,doc:CadDocument){
 bus.registerHandler('insert-external-scene',async command=>{
  if(command.type!=='insert-external-scene')return;
  const {id,layerId,asset}=command,layer=doc.layers[layerId],featureId=`feature-${id}`;
  if(!layer||layer.locked||!layer.visible)throw Error('Choose a visible unlocked layer.');
  if(doc.objects[id]||doc.features[featureId])throw Error('Duplicate external scene identity.');
  if(await sceneHash(decodeSceneBytes(asset))!==asset.contentHash)throw Error('GLB source checksum mismatch.');
  const prior=doc.externalSceneAssets?.[asset.id];
  if(prior&&prior.base64!==asset.base64)throw Error('Conflicting GLB source identity.');
  doc.externalSceneAssets??={};doc.externalSceneAssets[asset.id]=prior??structuredClone(asset);
  doc.objects[id]={id,geometryId:`geometry-${id}`,name:asset.name,layerId,visible:true,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
  doc.features[featureId]={id:featureId,type:'external-scene',inputs:[],output:id,dependencyMode:'snapshot',params:{assetId:asset.id}};
  doc.rootObjects.push(id);layer.objectIds.push(id);validateExternalScenes(doc);doc.revision++;return id;
 });
}
