export type TaskProgress = {stage:string;completed:number;total:number};
export type CooperativeTask = {signal?:AbortSignal;onProgress?:(progress:TaskProgress)=>void};
/** Yield only at detached transaction boundaries; publication stays atomic. */
export function taskCheckpoint(options:CooperativeTask={}) {
 let last=0;
 return async(stage:string,completed:number,total:number,force=false)=>{
  options.signal?.throwIfAborted();
  if(!force&&performance.now()-last<16)return;
  options.onProgress?.({stage,completed,total});
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  options.signal?.throwIfAborted();last=performance.now();
 };
}
