import type {CadDocument} from '@agent-webcad/cad-document';
import {createDocumentCommandExecutor} from '../../src/state/commandBus';
import {SEARCH_PART_IDS} from '../../src/copilot/assemblySearchPolicy';
/** One small six-box fixture. The oracle measurements are kept outside model input. */
export async function assemblySearchSynthetic(template:CadDocument){
 const d=structuredClone(template);d.id='synthetic-axis-search';delete d.assembly;delete d.interferenceIntents;
 const keep=new Set(SEARCH_PART_IDS);for(const id of Object.keys(d.objects))if(!keep.has(id))delete d.objects[id];for(const [id,f] of Object.entries(d.features))if(!keep.has(f.output))delete d.features[id];
 d.rootObjects=d.rootObjects.filter(id=>keep.has(id));for(const layer of Object.values(d.layers))layer.objectIds=layer.objectIds.filter(id=>keep.has(id));
 const positions:Record<string,[number,number,number]>={'stand-base':[-150,0,-100],'stand-shaft':[-150,0,-80],'stand-turntable':[-100,0,0],'stand-support':[0,0,0],'stand-plate':[-35,-35,18],'stand-lip':[-200,0,50]};
 for(const id of SEARCH_PART_IDS){d.objects[id].transform={translation:positions[id],rotation:[0,0,0],scale:[1,1,1]};d.objects[id].name='Synthetic '+id;const f=Object.values(d.features).find(f=>f.output===id)!;f.params=id==='stand-support'?{kind:'box',width:30,depth:30,height:20}:id==='stand-plate'?{kind:'box',width:100,depth:100,height:4}:{kind:'box',width:2,depth:2,height:2};}
 const run=createDocumentCommandExecutor(d);await run({type:'assembly-ground',objectId:'stand-base',grounded:true});
 for(const [id,parentId,childId,type] of [['bearing','stand-base','stand-turntable','revolute'],['shaft','stand-base','stand-shaft','fixed'],['support','stand-turntable','stand-support','fixed'],['plate','stand-support','stand-plate','fixed'],['lip','stand-plate','stand-lip','fixed']] as const)await run({type:'assembly-joint-create',joint:{id,parentId,childId,type,origin:[0,0,0],axis:[0,0,1],angle:0}});
 d.interferenceIntents={'["stand-plate","stand-support"]':{pair:['stand-plate','stand-support'],intent:'forbidden-interference',note:'Synthetic unwanted overlap; physical mounting has not been evaluated.'}};
 return d;
}
