import {useEffect,useRef,useState} from "react";
import {createCadMcpRuntime,type CadMcpHost} from "./cadMcpRuntime";

export function useCadMcpBridge(host:CadMcpHost&{disconnect:()=>void;scopeKey:string}){
 const latest=useRef(host);latest.current=host;
 const active=useRef<{controller:AbortController;token?:string;runtime:ReturnType<typeof createCadMcpRuntime>;jobs:Map<string,AbortController>}|null>(null);
 const [status,setStatus]=useState("disabled"),[configuration,setConfiguration]=useState(""),[error,setError]=useState(""),[activity,setActivity]=useState("");
 const post=async(path:string,body:unknown,token?:string,signal?:AbortSignal)=>{const r=await fetch(`/api/mcp/${path}`,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",...token?{Authorization:`Bearer ${token}`}:{ }},body:JSON.stringify(body),signal});const result=await r.json();if(!r.ok)throw Error(result.error??"CAD bridge unavailable. Run the app dev/preview server with its MCP plugin.");return result;};
 function stop(){const c=active.current;if(!c)return;active.current=null;c.controller.abort();for(const job of c.jobs.values())job.abort();c.runtime.dispose();latest.current.disconnect();if(c.token)void post("close",{},c.token).catch(()=>{});}
 function disable(){stop();setStatus("disabled");setConfiguration("");setActivity("");}
 useEffect(()=>()=>stop(),[]);
 useEffect(()=>{disable();},[host.scopeKey]);
 async function enable(){
  if(active.current)return;setError("");setStatus("connecting");
  const runtime=createCadMcpRuntime({context:()=>latest.current.context(),review:(calls,signal)=>latest.current.review(calls,signal),proposal:id=>latest.current.proposal(id)}),c={controller:new AbortController(),runtime,jobs:new Map<string,AbortController>(),token:undefined as string|undefined};active.current=c;
  try{
   const registration=await post("register",{},undefined,c.controller.signal);c.token=registration.uiToken;if(active.current!==c){void post("close",{},c.token).catch(()=>{});return;}
   setConfiguration(JSON.stringify(registration.configuration,null,2));setStatus("enabled");
   while(active.current===c){
    const result=await post("poll",{},c.token,c.controller.signal);
    for(const job of result.jobs){
     if(job.method==="cancel"){c.jobs.get(job.id)?.abort();continue;}
     if(c.jobs.size>=8)throw Error("Too many CAD bridge jobs.");
     const controller=new AbortController();c.jobs.set(job.id,controller);setActivity(`${job.method}${job.params?.calls?.[0]?.name?` · ${job.params.calls[0].name}`:""}`);
     void runtime.invoke(job.method,job.params,controller.signal).then(value=>({ok:true,value}),e=>({ok:false,error:e instanceof Error?e.message:"CAD tool failed."})).then(async result=>{if(active.current===c&&!controller.signal.aborted)await post("result",{id:job.id,result},c.token,c.controller.signal);}).catch(()=>{}).finally(()=>c.jobs.delete(job.id));
    }
   }
  }catch(e){if(active.current===c){stop();setStatus("disabled");setConfiguration("");setError(e instanceof Error?e.message:"CAD bridge unavailable.");}}
 }
 return {status,configuration,error,activity,enable:()=>void enable(),disable};
}
export type CadMcpBridgeControls=ReturnType<typeof useCadMcpBridge>;
