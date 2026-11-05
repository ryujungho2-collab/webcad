import {readFile} from 'node:fs/promises';
import {deserializeDocument} from '@agent-webcad/cad-document';
import {cadDocument} from '../../../src/state/cadDocument';
import {dispatchCadCommand} from '../../../src/state/dispatchCadCommand';
import {restoreTestDocument} from '../../../tests/helpers/documentHarness';
import {sheetViewGroups} from '../../../src/state/modelSheetLayoutService';
const doc:any=deserializeDocument(await readFile('C:/Users/thefi/AppData/Local/Temp/claude/9f47f9b5728b91ec/17f259fa-5f30-4ffd-a9ce-7db97e740909/scratchpad/kettle-saved.json','utf8'));
console.log('sheets',Object.keys(doc.modelPresentation.sheets??{}));doc.modelPresentation.sheets={};if(process.env.RESET){for(const v of [...Object.values(doc.modelPresentation.projections),...Object.values(doc.modelPresentation.sections??{})] as any[]){console.log('was',v.id,v.scale,v.origin);v.scale=1;v.origin=[0,0];}}
restoreTestDocument(doc);
const d:any=cadDocument,viewIds=['v-front','v-side','v-section','v-top'];
const groups=sheetViewGroups(d,viewIds);const feats=new Map(Object.values(d.features).map((f:any)=>[f.output,f]));
for(const [v,ids] of Object.entries(groups))for(const id of ids as string[]){const o=d.objects[id];if(!o||!feats.get(id)||!o.visible||d.layers[o.layerId]?.visible===false)console.log('BAD',v,id,!!o,!!feats.get(id),o?.visible,o&&d.layers[o.layerId]?.visible);}
console.log('group sizes',Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,(v as string[]).length])));
const {autoSheetLayout}=await import('../../../src/state/modelSheetLayoutService');const {sheetAlignmentUnits}=await import('../../../src/precision/sheetAlignment');console.log('units',JSON.stringify(sheetAlignmentUnits(d,viewIds,'orthographic')));
for(const ids of [viewIds,['v-front'],['v-side'],['v-section'],['v-top'],['v-front','v-side','v-top']]){try{const rep:any=await autoSheetLayout(structuredClone(d),{type:'auto-layout-model-sheet',id:'x',name:'x',artboardId:'sheet-a2',viewIds:ids,fixedViewIds:[],denominators:[2],origin:[2000,0],size:[594,420],margin:10,gap:12,footerHeight:32,alignment:'orthographic'} as any);console.log('OK',ids.join(','),JSON.stringify(rep.bounds));}catch(e:any){console.log('ERR',ids.join(','),e.message);}}
const r=await dispatchCadCommand({type:'layout-model-sheet-set',id:'ga2',name:'GA',artboardId:'sheet-a2',viewIds,fixedViewIds:[],denominators:[2],origin:[2000,0],size:[594,420],margin:10,gap:12,maxPages:1,alignment:'orthographic',template:'standard',fields:{drawingName:'ARC 1.7',author:'Claude',revision:'A'}} as any);
console.log('result',r.ok,r.reason);process.exit(0);
