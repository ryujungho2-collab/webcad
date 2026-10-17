/** Accounted JS payload bytes, not process heap or OCCT live allocation. */
export function payloadBytes(value:unknown):number {
  const seen=new Set<object>(),buffers=new Set<ArrayBufferLike>(),queue:unknown[]=[value];let bytes=0;
  while(queue.length){const item=queue.pop();if(typeof item==="string"){bytes+=item.length*2;continue;}if(typeof item==="number"){bytes+=8;continue;}if(typeof item==="boolean"){bytes+=4;continue;}if(!item||typeof item!=="object"||seen.has(item))continue;seen.add(item);
    if(ArrayBuffer.isView(item)){if(!buffers.has(item.buffer)){buffers.add(item.buffer);bytes+=item.buffer.byteLength;}continue;}
    if(item instanceof ArrayBuffer){if(!buffers.has(item)){buffers.add(item);bytes+=item.byteLength;}continue;}
    bytes+=32;for(const [key,v] of Object.entries(item)){bytes+=key.length*2;queue.push(v);}
  }return bytes;
}
export class CacheBudget {
  private entries=new Map<object,{bytes:number;remove:()=>void}>();
  bytes=0;evictions=0;
  constructor(public limit:number){}
  track(token:object,bytes:number,remove:()=>void){this.remove(token);this.entries.set(token,{bytes,remove});this.bytes+=bytes;this.trim();}
  touch(token:object){const entry=this.entries.get(token);if(entry){this.entries.delete(token);this.entries.set(token,entry);}}
  resize(token:object,bytes:number){const entry=this.entries.get(token);if(!entry)return;this.bytes+=bytes-entry.bytes;entry.bytes=bytes;this.trim();}
  remove(token:object){const entry=this.entries.get(token);if(entry){this.bytes-=entry.bytes;this.entries.delete(token);}}
  setLimit(limit:number){this.limit=limit;this.trim();}
  private trim(){while(this.bytes>this.limit&&this.entries.size){const [token,entry]=this.entries.entries().next().value!;this.remove(token);entry.remove();this.evictions++;}}
  get count(){return this.entries.size;}
}
