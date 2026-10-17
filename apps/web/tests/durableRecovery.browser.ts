import {type CadDocument,type CadRasterAsset,deserializeDocument} from '@agent-webcad/cad-document';
import {commitDurableRecord,readDurableRecord,writeDurableCheckpoint,readProjectCheckpoint,loadProjectCheckpoint,repairDurableIndex,DURABLE_KEY} from '../src/app/durableRecovery';
import {projectStorage} from '../src/app/projectSession';
import {portableProjectAsync,deleteClosedProject} from '../src/app/projectManagerStore';
import {writeRecoveryCheckpoint,DOCUMENT_CACHE_KEY} from '../src/state/documentRecovery';
import {indexedStorageJournal,recoverStorageTransactions,type StorageUndo} from '../src/app/projectStorageTransactions';
import {WORKSPACE_KEY,type Workspace} from '../src/app/projectWorkspaceStore';
import {installBrowserChecks} from './helpers/browserChecks';
const run=document.getElementById('run') as HTMLButtonElement,output=document.getElementById('output')!;
run.onclick=async()=>{run.disabled=true;const lines:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push('PASS: '+label);output.textContent=lines.join('\n');};try{
 const oldDb=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('agent-webcad-storage-operations',1);request.onupgradeneeded=()=>request.result.createObjectStore('undo',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 await new Promise<void>((resolve,reject)=>{const tx=oldDb.transaction('undo','readwrite');tx.objectStore('undo').put({id:'v1-sentinel',target:'a',committed:false,before:{},after:{}});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});oldDb.close();
 const upgraded=indexedStorageJournal();check((await upgraded.list()).some(record=>record.id==='v1-sentinel'),'v1 database upgrade preserves the existing deletion recovery journal');await upgraded.remove('v1-sentinel');
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBScAAAAASUVORK5CYII=',bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0)),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const asset=(name:string):CadRasterAsset=>({id:`asset-${hash}`,contentHash:hash,name,mimeType:'image/png',width:1,height:1,byteLength:bytes.length,dataUrl:`data:image/png;base64,${png}`});
 const doc=(name:string):CadDocument=>({id:'same-cad-id',revision:1,objects:{},features:{},sketches:{},layers:{default:{id:'default',name:'Default',visible:true,locked:false,objectIds:[]}},rootLayers:['default'],rootObjects:[],rasterAssets:{[asset(name).id]:asset(name)}});
 const a=projectStorage(localStorage,'a');writeRecoveryCheckpoint(a,doc('old A'));const legacy=a.getItem(DOCUMENT_CACHE_KEY);
 const native=IDBDatabase.prototype.transaction;
 IDBDatabase.prototype.transaction=function(names:any,mode?:IDBTransactionMode,options?:IDBTransactionOptions){if(names==='documents'&&mode==='readwrite')throw new DOMException('Injected quota','QuotaExceededError');return native.call(this,names,mode??'readonly',options);};
 let rejected=false;try{await writeDurableCheckpoint(localStorage,'a',doc('new A'));}catch{rejected=true;}finally{IDBDatabase.prototype.transaction=native;}
 check(rejected&&a.getItem(DOCUMENT_CACHE_KEY)===legacy&&!await readDurableRecord('a'),'Failed migration keeps exact original legacy checkpoint and assets');
 await writeDurableCheckpoint(localStorage,'a',doc('new A'));check(!a.getItem(DOCUMENT_CACHE_KEY)&&!!a.getItem(DURABLE_KEY),'Successful atomic commit retires legacy copies and publishes a small index');
 await writeDurableCheckpoint(localStorage,'b',doc('B image'));
 check(Object.values((await readProjectCheckpoint(localStorage,'a'))!.document.rasterAssets!)[0].name==='new A'&&Object.values((await readProjectCheckpoint(localStorage,'b'))!.document.rasterAssets!)[0].name==='B image','Equal CAD IDs and asset IDs stay isolated by project');
 const portable=await portableProjectAsync(localStorage,'b','B');check(Object.values(deserializeDocument(portable.text).rasterAssets!)[0].dataUrl===asset('B image').dataUrl,'Closed durable export embeds actual image bytes');
 const original=(await readDurableRecord('a'))!;await commitDurableRecord({...original,current:'damaged',token:crypto.randomUUID()},original.token);
 const fallback=await readProjectCheckpoint(localStorage,'a');check(fallback?.recovered&&Object.values(fallback.document.rasterAssets!)[0].name==='old A','Damaged current restores its own complete previous snapshot and image source');
 await loadProjectCheckpoint(localStorage,'a');await writeDurableCheckpoint(localStorage,'a',doc('repaired A'));
 const repaired=(await readDurableRecord('a'))!;check(Object.values(deserializeDocument(repaired.backup!).rasterAssets!)[0].name==='old A','Repair preserves the actual valid backup instead of copying damaged current');
 await commitDurableRecord({...repaired,token:crypto.randomUUID()},repaired.token);
 rejected=false;try{await writeDurableCheckpoint(localStorage,'a',doc('stale A'));}catch{rejected=true;}
 check(rejected&&Object.values((await readProjectCheckpoint(localStorage,'a'))!.document.rasterAssets!)[0].name==='repaired A','A stale editor cannot overwrite another window checkpoint');
 await repairDurableIndex(localStorage);
 const interrupted=projectStorage(localStorage,'interrupted');writeRecoveryCheckpoint(interrupted,doc('migration source'));
 const oldRemove=Storage.prototype.removeItem;
 Storage.prototype.removeItem=function(key:string){if(key.startsWith('agent-webcad-project:interrupted:'))throw Error('interrupted cleanup');oldRemove.call(this,key);};
 try{await writeDurableCheckpoint(localStorage,'interrupted',doc('durable result'));}finally{Storage.prototype.removeItem=oldRemove;}
 check(!!interrupted.getItem(DOCUMENT_CACHE_KEY)&&!!await readDurableRecord('interrupted'),'Interrupted cleanup retains both committed durable result and original source');
 await repairDurableIndex(localStorage);check(!interrupted.getItem(DOCUMENT_CACHE_KEY)&&!!interrupted.getItem(DURABLE_KEY),'Restart repair completes migration only after verifying durable data');
 const workspace:Workspace={version:1,active:'',projects:[{id:'a',title:'A',closed:true},{id:'b',title:'B',closed:true}]};localStorage.setItem(WORKSPACE_KEY,JSON.stringify(workspace));const journal=indexedStorageJournal(),manifest=localStorage.getItem(WORKSPACE_KEY),marker=a.getItem(DURABLE_KEY);
 rejected=false;try{await deleteClosedProject(localStorage,workspace,'a',{...journal,put:async value=>{if(value.committed)throw Error('commit failure');await journal.put(value);}});}catch{rejected=true;}
 check(rejected&&localStorage.getItem(WORKSPACE_KEY)===manifest&&a.getItem(DURABLE_KEY)===marker&&!!await readDurableRecord('a'),'Failed delete commit restores list/index and retains durable document');
 const record=(await readDurableRecord('a'))!,markerKey='agent-webcad-project:a:'+DURABLE_KEY;
 const pending:StorageUndo={id:crypto.randomUUID(),target:'a',durableToken:record.token,committed:false,before:{[markerKey]:marker},after:{[markerKey]:null}};
 await journal.put(pending);a.removeItem(DURABLE_KEY);await recoverStorageTransactions(localStorage,journal);
 check(a.getItem(DURABLE_KEY)===marker&&!!await readDurableRecord('a'),'Interrupted preparation recovers the index without losing the committed document');
 await journal.put(pending);a.removeItem(DURABLE_KEY);await journal.put({...pending,committed:true});await recoverStorageTransactions(localStorage,journal);
 check(!await readDurableRecord('a')&&!a.getItem(DURABLE_KEY),'Committed deletion atomically removes durable data and recovery never resurrects it');
 check(!!await readDurableRecord('b'),'Deleting A preserves B with the same internal IDs');
 a.setItem(DURABLE_KEY,marker!);rejected=false;try{await loadProjectCheckpoint(localStorage,'a');}catch{rejected=true;}check(rejected,'Missing durable data cannot silently open a blank document from its index');
 output.textContent=lines.join('\n')+`\nALL ${lines.length} CHECKS PASSED`;
}catch(e){output.textContent=lines.join('\n')+`\nFAIL: ${e instanceof Error?e.stack:String(e)}`;}};installBrowserChecks(run,output);
