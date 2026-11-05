/** Cache-owned handles only. Borrowers own clones, so LRU disposal cannot
 * invalidate an executing operation. Bytes are estimates, never WASM capacity. */
export class RetainedShapeCache<T> {
 private entries=new Map<string,{value:T;bytes:number}>();
 bytes=0;hits=0;evictions=0;releases=0;oversize=0;unknown=0;
 constructor(public byteLimit:number,public countLimit:number,private dispose:(value:T)=>void){}
 get(key:string){const entry=this.entries.get(key);if(!entry)return;this.hits++;this.entries.delete(key);this.entries.set(key,entry);return entry.value;}
 put(key:string,value:T,estimatedBytes:number|undefined){
  this.remove(key,false);
  const bytes=estimatedBytes===undefined?undefined:estimatedBytes+key.length*2;
  if(bytes===undefined||!Number.isFinite(bytes)||bytes<0){this.unknown++;this.dispose(value);this.releases++;return;}
  if(bytes>this.byteLimit||!this.countLimit){this.oversize++;this.dispose(value);this.releases++;return;}
  this.entries.set(key,{value,bytes});this.bytes+=bytes;this.trim();
 }
 private remove(key:string,eviction:boolean){const entry=this.entries.get(key);if(!entry)return;this.entries.delete(key);this.bytes-=entry.bytes;this.dispose(entry.value);this.releases++;if(eviction)this.evictions++;}
 private trim(){while(this.bytes>this.byteLimit||this.entries.size>this.countLimit)this.remove(this.entries.keys().next().value!,true);}
 configure(bytes:number,count:number){if(!Number.isSafeInteger(bytes)||bytes<0||!Number.isSafeInteger(count)||count<0)throw Error("Invalid retained cache budget.");this.byteLimit=bytes;this.countLimit=count;this.trim();}
 clear(resetCounters=false){for(const key of this.entries.keys())this.remove(key,false);if(resetCounters)this.hits=this.evictions=this.releases=this.oversize=this.unknown=0;}
 metrics(){return {entries:this.entries.size,limit:this.countLimit,estimatedBytes:this.bytes,byteLimit:this.byteLimit,hits:this.hits,evictions:this.evictions,releasedHandles:this.releases,oversize:this.oversize,unknownEstimates:this.unknown};}
}
