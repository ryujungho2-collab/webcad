export const INSPECTOR_PREFERENCES_KEY="agent-webcad-inspector-v1";
type Reader=Pick<Storage,"getItem">;
function values(storage:Reader):Record<string,boolean>{
  try{const data=JSON.parse(storage.getItem(INSPECTOR_PREFERENCES_KEY)??"{}");if(!data||typeof data!=="object"||Array.isArray(data))return {};return Object.fromEntries(Object.entries(data).filter(([key,value])=>key.length<=160&&typeof value==="boolean").slice(-128)) as Record<string,boolean>;}catch{return {};}
}
export function readInspectorSection(storage:Reader,key:string,fallback:boolean){return values(storage)[key]??fallback;}
export function writeInspectorSection(storage:Reader&Pick<Storage,"setItem">,key:string,open:boolean){
  try{storage.setItem(INSPECTOR_PREFERENCES_KEY,JSON.stringify(Object.fromEntries(Object.entries({...values(storage),[key]:open}).slice(-128))));return true;}catch{return false;}
}
