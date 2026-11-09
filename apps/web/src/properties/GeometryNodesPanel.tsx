import {useEffect,useRef,useState} from "react";
import {defaultGeometryNode,createGeometryGraph,GEOMETRY_NODE_TYPES,validateGeometryGraph,type GeometryNode,type GeometryNodeType,type GeometryNodeGraph,type GeometryGraphAction,type GeometryNodeResult} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../state/cadDocument";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../state/documentPlans";
import {evaluateGraphAsync} from "../cad/geometryEvaluationClient";
import {PropertySection} from "../ui/PropertySection";

export function GeometryNodesPanel({selectedObjectId,layerId,revision,onCreated,onDocumentChange}:{selectedObjectId:string|null;layerId:string;revision:number;onCreated:(id:string)=>void;onDocumentChange:()=>void}){
 const feature=Object.values(cadDocument.features).find(f=>f.output===selectedObjectId&&f.type==="geometry-nodes"),graph=feature?.params.graph as GeometryNodeGraph|undefined;
 const [preset,setPreset]=useState<"subdivision"|"sweep"|"instances"|"input">("subdivision"),[source,setSource]=useState(""),[target,setTarget]=useState("primitive"),[params,setParams]=useState("{}"),[nodeType,setNodeType]=useState<GeometryNodeType>("transform"),[newId,setNewId]=useState("transform"),[from,setFrom]=useState("primitive"),[port,setPort]=useState("geometry");
 const [error,setError]=useState(""),[busy,setBusy]=useState(false),[review,setReview]=useState<Awaited<ReturnType<typeof previewCadCommand>>|null>(null),[result,setResult]=useState<GeometryNodeResult|null>(null);
 const plan=useRef<string|null>(null),scope=useRef<AbortController|null>(null),sequence=useRef(0),node=graph?.nodes.find(n=>n.id===target);
 function cancel(){sequence.current++;scope.current?.abort();if(plan.current)discardCadPlan(plan.current);plan.current=null;setReview(null);setBusy(false);}
 useEffect(()=>{cancel();setError("");},[revision,selectedObjectId,layerId]);
 useEffect(()=>{setParams(JSON.stringify(node?.params??{},null,2));setPort(node?Object.keys(GEOMETRY_NODE_TYPES[node.type].inputs)[0]??"geometry":"geometry");},[target,revision,selectedObjectId]);
 useEffect(()=>{const controller=new AbortController();setResult(null);if(feature)void evaluateGraphAsync(cadDocument,feature,{signal:controller.signal,scope:`node-inspector-${feature.output}`}).then(setResult).catch(e=>{if(!controller.signal.aborted)setError(String(e));});return()=>controller.abort();},[revision,selectedObjectId]);
 useEffect(()=>()=>{sequence.current++;scope.current?.abort();if(plan.current)discardCadPlan(plan.current);},[]);
 async function preview(command:CadCommand){cancel();const ticket=++sequence.current,controller=new AbortController();scope.current=controller;setBusy(true);setError("");try{const value=await previewCadCommand(command,{signal:controller.signal});if(ticket!==sequence.current){discardCadPlan(value.planId);return;}plan.current=value.planId;setReview(value);if(!value.result.ok)setError(value.result.reason??"Graph edit rejected.");}catch(e){if(ticket===sequence.current)setError(String(e));}finally{if(ticket===sequence.current)setBusy(false);}}
 const edit=(actions:GeometryGraphAction[])=>selectedObjectId&&void preview({type:"edit-geometry-graph",objectId:selectedObjectId,actions});
 async function apply(){if(!plan.current)return;setBusy(true);try{const response=await applyCadPlan(plan.current);cancel();if(!response.ok)throw Error(response.reason);onDocumentChange();if(response.createdIds[0])onCreated(response.createdIds[0]);}catch(e){setError(String(e));setBusy(false);}}
 return <PropertySection title="Geometry Nodes" meta="Typed procedural mesh · local mm" defaultOpen={false} active={!!graph||!!error||!!review} keepOpen={busy||!!review}>
  <label className="property-row"><span>Graph template</span><select aria-label="Geometry graph template" value={preset} onChange={e=>{cancel();setPreset(e.target.value as typeof preset);}}><option value="subdivision">Mesh + Subdivision</option><option value="sweep">Curve profile Sweep</option><option value="instances">Instances along curve</option><option value="input">Live mesh input</option></select></label>
  {preset==="input"&&<label className="property-row"><span>Source object ID</span><input aria-label="Graph source object" value={source} onChange={e=>setSource(e.target.value)}/></label>}
  <button disabled={busy||preset==="input"&&!source.trim()} onClick={()=>void preview({type:"create-geometry-graph",layerId,graph:createGeometryGraph(preset,source)})}>Review new node graph</button>
  {graph&&<>
   <p className="property-hint">{graph.nodes.length} nodes · {graph.links.length} links. Output is derived; edit parameters and connections here. Group Input uses source object placement in graph-local coordinates.</p>
   <label className="property-row"><span>Node</span><select aria-label="Geometry node" value={target} onChange={e=>{cancel();setTarget(e.target.value);}}><option value="">Choose node</option>{graph.nodes.map(n=><option key={n.id} value={n.id}>{n.id} ({n.type})</option>)}</select></label>
   {node&&<>
    <label>Node parameters (JSON)<textarea aria-label="Node parameters" style={{width:"100%",boxSizing:"border-box"}} rows={5} value={params} onChange={e=>{cancel();setParams(e.target.value);}}/></label>
    <button disabled={busy} onClick={()=>{try{edit([{kind:"parameters",nodeId:node.id,params:JSON.parse(params)}]);}catch(e){setError(String(e));}}}>Review node parameters</button>
    <button disabled={busy||node.id===graph.output} onClick={()=>edit([{kind:"remove",nodeId:node.id}])}>Review delete node</button>
    <label className="property-row"><span>Input socket</span><select aria-label="Node input socket" value={port} onChange={e=>{cancel();setPort(e.target.value);}}>{Object.entries(GEOMETRY_NODE_TYPES[node.type].inputs).map(([key,type])=><option value={key} key={key}>{key}: {type}</option>)}</select></label>
    <label className="property-row"><span>From node</span><select aria-label="Node connection source" value={from} onChange={e=>{cancel();setFrom(e.target.value);}}>{graph.nodes.map(n=><option key={n.id} value={n.id}>{n.id}: {GEOMETRY_NODE_TYPES[n.type].output}</option>)}</select></label>
    <button disabled={busy||!Object.hasOwn(GEOMETRY_NODE_TYPES[node.type].inputs,port)} onClick={()=>edit([...(graph.links.some(l=>l.to===target&&l.input===port)?[{kind:"disconnect" as const,nodeId:target,input:port}]:[]),{kind:"connect",link:{from,to:target,input:port}}])}>Review node connection</button>
    <button disabled={busy||!graph.links.some(l=>l.to===target&&l.input===port)} onClick={()=>edit([{kind:"disconnect",nodeId:target,input:port}])}>Review disconnect node</button>
   </>}
   <label className="property-row"><span>New node type</span><select aria-label="New node type" value={nodeType} onChange={e=>{cancel();setNodeType(e.target.value as GeometryNodeType);}}>{Object.keys(GEOMETRY_NODE_TYPES).filter(t=>t!=="group-output").map(t=><option key={t} value={t}>{t}</option>)}</select></label>
   <label className="property-row"><span>New node ID</span><input aria-label="New node ID" value={newId} onChange={e=>{cancel();setNewId(e.target.value);}}/></label>
   {nodeType==="group-input"&&<label className="property-row"><span>New Group Input object</span><input aria-label="New Group Input source" value={source} onChange={e=>{cancel();setSource(e.target.value);}}/></label>}
   <button disabled={busy||!newId.trim()||nodeType==="group-input"&&!source.trim()} onClick={()=>{const next=defaultGeometryNode(nodeType,newId);if(nodeType==="group-input")next.params={objectId:source};edit([{kind:"add",node:next}]);}}>Review add node</button>
   <ul aria-label="Geometry graph connections">{graph.links.map(l=><li key={`${l.to}.${l.input}`}>{l.from} → {l.to}.{l.input}</li>)}</ul>
   <button disabled={busy} onClick={()=>{const v=validateGeometryGraph(graph);setError(v.valid?`Graph valid. ${v.draftMissing.length} unconnected draft inputs.`:v.errors.join(" "));}}>Validate node graph</button>
   {result&&<p role="status">Evaluated {result.output.mesh.vertices.length} vertices / {result.output.mesh.faces.length} faces. {result.nodes.filter(n=>n.cached).length}/{result.nodes.length} node cache hits; {result.elapsedMs.toFixed(1)} ms. {result.nodes.map(n=>`${n.id}: ${n.cached?"cached":"computed"}`).join(", ")}</p>}
  </>}
  {busy&&<button onClick={cancel}>Cancel geometry evaluation</button>}
  {review&&<div role="status"><p>{review.result.ok?"Validated Geometry Nodes proposal.":"Graph proposal rejected."}</p><button disabled={busy||!review.result.ok||review.stale} onClick={()=>void apply()}>Apply node graph</button><button disabled={busy} onClick={cancel}>Discard node preview</button></div>}
  {error&&<p role="alert">{error}</p>}
 </PropertySection>;
}
