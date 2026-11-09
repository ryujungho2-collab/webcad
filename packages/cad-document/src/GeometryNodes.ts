import {meshElementId,meshVector,type MeshVector} from "./EditableMesh";

export type GeometrySocket="mesh"|"curve"|"instances";
export type GeometryNodeType="mesh-primitive"|"transform"|"join"|"subdivision"|"curve-primitive"|"resample-curve"|"curve-to-mesh"|"instance-on-points"|"realize-instances"|"group-input"|"group-output";
export type GeometryNode={id:string;type:GeometryNodeType;params:Record<string,unknown>};
export type GeometryLink={from:string;to:string;input:string};
export type GeometryNodeGraph={version:1;nodes:GeometryNode[];links:GeometryLink[];output:string};
export type GeometryGraphAction={kind:"add";node:GeometryNode}|{kind:"remove";nodeId:string}|{kind:"connect";link:GeometryLink}|{kind:"disconnect";nodeId:string;input:string}|{kind:"parameters";nodeId:string;params:Record<string,unknown>};
export const GEOMETRY_NODE_TYPES:Record<GeometryNodeType,{inputs:Record<string,GeometrySocket>;output:GeometrySocket}>={
 "mesh-primitive":{inputs:{},output:"mesh"},transform:{inputs:{geometry:"mesh"},output:"mesh"},join:{inputs:{a:"mesh",b:"mesh"},output:"mesh"},subdivision:{inputs:{geometry:"mesh"},output:"mesh"},
 "curve-primitive":{inputs:{},output:"curve"},"resample-curve":{inputs:{curve:"curve"},output:"curve"},"curve-to-mesh":{inputs:{path:"curve",profile:"curve"},output:"mesh"},
 "instance-on-points":{inputs:{geometry:"mesh",points:"curve"},output:"instances"},"realize-instances":{inputs:{instances:"instances"},output:"mesh"},"group-input":{inputs:{},output:"mesh"},"group-output":{inputs:{geometry:"mesh"},output:"mesh"}
};
const keys=(p:Record<string,unknown>,names:string[])=>Object.keys(p).length===names.length&&names.every(k=>Object.hasOwn(p,k));
const finite=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v:unknown,min:number,max:number)=>finite(v,min,max)&&Number.isInteger(v);
export function validGeometryNode(n:unknown):n is GeometryNode{
 if(!n||typeof n!=="object"||Array.isArray(n))return false;const node=n as GeometryNode,p=node.params;
 if(!meshElementId(node.id)||!Object.hasOwn(GEOMETRY_NODE_TYPES,node.type)||!p||typeof p!=="object"||Array.isArray(p)||Object.keys(node).some(k=>!["id","type","params"].includes(k)))return false;
 switch(node.type){
  case "mesh-primitive":return keys(p,["shape","size","sides"])&&["cube","ngon"].includes(String(p.shape))&&finite(p.size,.001,1e6)&&integer(p.sides,3,32);
  case "transform":return keys(p,["translation","rotation","scale"])&&meshVector(p.translation)&&meshVector(p.rotation)&&meshVector(p.scale)&&p.scale.every(v=>v>0&&v<=1e4);
  case "subdivision":return keys(p,["level","boundary"])&&integer(p.level,0,3)&&["smooth","fixed"].includes(String(p.boundary));
  case "curve-primitive":return p.kind==="circle"?keys(p,["kind","radius","segments"])&&finite(p.radius,.001,1e6)&&integer(p.segments,3,128):p.kind==="polyline"&&keys(p,["kind","points","closed"])&&Array.isArray(p.points)&&p.points.length>=2&&p.points.length<=128&&p.points.every(meshVector)&&typeof p.closed==="boolean"&&(!p.closed||p.points.length>=3);
  case "resample-curve":return keys(p,["count"])&&integer(p.count,2,128);
  case "curve-to-mesh":return keys(p,["caps"])&&typeof p.caps==="boolean";
  case "instance-on-points":return keys(p,["scale"])&&meshVector(p.scale)&&p.scale.every(v=>v>0&&v<=1e4);
  case "group-input":return keys(p,["objectId"])&&typeof p.objectId==="string"&&p.objectId.length>0&&p.objectId.length<=200;
  default:return keys(p,[]);
 }
}
/** Validate the whole stored DAG, including unused draft nodes. Required sockets are checked on the active output closure. */
export function validateGeometryGraph(value:unknown){
 const errors:string[]=[],order:string[]=[],active=new Set<string>();const g=value as GeometryNodeGraph;
 if(!g||g.version!==1||!Array.isArray(g.nodes)||!g.nodes.length||g.nodes.length>64||!g.nodes.every(validGeometryNode)||new Set(g.nodes.map(n=>n.id)).size!==g.nodes.length||!Array.isArray(g.links)||g.links.length>128||!meshElementId(g.output)||Object.keys(g).some(k=>!["version","nodes","links","output"].includes(k)))return {valid:false,errors:["Invalid graph shape, parameters or 64 node / 128 link budget."],order,active:[] as string[],draftMissing:[] as string[]};
 const nodes=new Map(g.nodes.map(n=>[n.id,n])),connected=new Set<string>(),incoming=new Map<string,GeometryLink[]>();
 if(nodes.get(g.output)?.type!=="group-output"||g.nodes.filter(n=>n.type==="group-output").length!==1)errors.push("Exactly one Group Output must be the graph output.");
 for(const l of g.links){if(!l||typeof l!=="object"||Object.keys(l).some(k=>!["from","to","input"].includes(k))){errors.push("Invalid link.");continue;}const a=nodes.get(l.from),b=nodes.get(l.to),key=JSON.stringify([l.to,l.input]);if(!a||!b||!Object.hasOwn(GEOMETRY_NODE_TYPES[b.type].inputs,l.input)||GEOMETRY_NODE_TYPES[a.type].output!==GEOMETRY_NODE_TYPES[b.type].inputs[l.input])errors.push("Missing node or socket type mismatch.");if(connected.has(key))errors.push("Input socket accepts one connection.");connected.add(key);incoming.set(l.to,[...(incoming.get(l.to)??[]),l]);}
 const visiting=new Set<string>(),done=new Set<string>();const visit=(id:string)=>{if(visiting.has(id)){errors.push("Cyclic Geometry Nodes graph.");return;}if(done.has(id))return;visiting.add(id);for(const l of incoming.get(id)??[])if(nodes.has(l.from))visit(l.from);visiting.delete(id);done.add(id);order.push(id);};g.nodes.forEach(n=>visit(n.id));
 const reach=(id:string)=>{if(active.has(id))return;active.add(id);for(const l of incoming.get(id)??[])reach(l.from);};reach(g.output);
 const draftMissing:string[]=[];for(const n of g.nodes)for(const input of Object.keys(GEOMETRY_NODE_TYPES[n.type].inputs))if(!connected.has(JSON.stringify([n.id,input])))(active.has(n.id)?errors:draftMissing).push(`Missing input ${n.id}.${input}`);
 return {valid:errors.length===0,errors:[...new Set(errors)],order,active:[...active],draftMissing};
}
export function geometryGraphInputs(g:GeometryNodeGraph){return [...new Set(g.nodes.filter(n=>n.type==="group-input").map(n=>String(n.params.objectId)))];}
export function applyGeometryGraphActions(graph:GeometryNodeGraph,actions:GeometryGraphAction[]):GeometryNodeGraph{
 if(!Array.isArray(actions)||!actions.length||actions.length>128)throw Error("Graph edits require 1–128 actions.");const g=structuredClone(graph);
 for(const a of actions){if(!a||typeof a!=="object")throw Error("Invalid graph action.");switch(a.kind){
  case "add":if(!validGeometryNode(a.node)||g.nodes.some(n=>n.id===a.node.id))throw Error("Invalid or duplicate node.");g.nodes.push(structuredClone(a.node));break;
  case "remove":if(a.nodeId===g.output||!g.nodes.some(n=>n.id===a.nodeId))throw Error("Cannot remove missing node or Group Output.");g.nodes=g.nodes.filter(n=>n.id!==a.nodeId);g.links=g.links.filter(l=>l.from!==a.nodeId&&l.to!==a.nodeId);break;
  case "parameters":{const n=g.nodes.find(n=>n.id===a.nodeId);if(!n||!validGeometryNode({...n,params:a.params}))throw Error("Invalid node parameters.");n.params=structuredClone(a.params);break;}
  case "connect":if(!a.link)throw Error("Missing link.");g.links.push(structuredClone(a.link));break;
  case "disconnect":{const index=g.links.findIndex(l=>l.to===a.nodeId&&l.input===a.input);if(index<0)throw Error("Missing connection.");g.links.splice(index,1);break;}
  default:throw Error("Unsupported graph action.");
 }}const result=validateGeometryGraph(g);if(!result.valid)throw Error(result.errors.join(" "));return g;
}
export function createGeometryGraph(preset:"subdivision"|"sweep"|"instances"|"input"="subdivision",objectId=""):GeometryNodeGraph{
 const output:GeometryNode={id:"output",type:"group-output",params:{}};let nodes:GeometryNode[],links:GeometryLink[];
 const primitive:GeometryNode={id:"primitive",type:"mesh-primitive",params:{shape:"cube",size:10,sides:6}},path:GeometryNode={id:"path",type:"curve-primitive",params:{kind:"polyline",points:[[0,0,0],[0,0,30],[10,0,50]],closed:false}};
 if(preset==="input"){nodes=[{id:"input",type:"group-input",params:{objectId}},output];links=[{from:"input",to:"output",input:"geometry"}];}
 else if(preset==="sweep"){nodes=[path,{id:"profile",type:"curve-primitive",params:{kind:"circle",radius:2,segments:8}},{id:"sweep",type:"curve-to-mesh",params:{caps:true}},output];links=[{from:"path",to:"sweep",input:"path"},{from:"profile",to:"sweep",input:"profile"},{from:"sweep",to:"output",input:"geometry"}];}
 else if(preset==="instances"){nodes=[primitive,{...path,params:{kind:"polyline",points:[[0,0,0],[40,0,0]],closed:false}},{id:"resample",type:"resample-curve",params:{count:3}},{id:"instances",type:"instance-on-points",params:{scale:[1,1,1]}},{id:"realize",type:"realize-instances",params:{}},output];links=[{from:"path",to:"resample",input:"curve"},{from:"primitive",to:"instances",input:"geometry"},{from:"resample",to:"instances",input:"points"},{from:"instances",to:"realize",input:"instances"},{from:"realize",to:"output",input:"geometry"}];}
 else{nodes=[primitive,{id:"subdivision",type:"subdivision",params:{level:1,boundary:"smooth"}},output];links=[{from:"primitive",to:"subdivision",input:"geometry"},{from:"subdivision",to:"output",input:"geometry"}];}
 return {version:1,nodes,links,output:"output"};
}

export function validGeometryGraphActions(value:unknown):value is GeometryGraphAction[]{
 if(!Array.isArray(value)||!value.length||value.length>128)return false;
 return value.every(a=>{if(!a||typeof a!=="object"||Array.isArray(a))return false;switch(a.kind){
 case "add":return keys(a,["kind","node"])&&validGeometryNode(a.node);
 case "remove":return keys(a,["kind","nodeId"])&&meshElementId(a.nodeId);
 case "parameters":return keys(a,["kind","nodeId","params"])&&meshElementId(a.nodeId)&&!!a.params&&typeof a.params==="object"&&!Array.isArray(a.params)&&JSON.stringify(a.params).length<20000;
 case "connect":return keys(a,["kind","link"])&&!!a.link&&keys(a.link,["from","to","input"])&&[a.link.from,a.link.to,a.link.input].every(meshElementId);
 case "disconnect":return keys(a,["kind","nodeId","input"])&&meshElementId(a.nodeId)&&meshElementId(a.input);
 default:return false;
 }});
}

export function defaultGeometryNode(type:GeometryNodeType,id:string):GeometryNode{
 const params:Record<GeometryNodeType,Record<string,unknown>>={"mesh-primitive":{shape:"cube",size:10,sides:6},transform:{translation:[20,0,0],rotation:[0,0,0],scale:[1,1,1]},join:{},subdivision:{level:1,boundary:"smooth"},"curve-primitive":{kind:"polyline",points:[[0,0,0],[0,0,30]],closed:false},"resample-curve":{count:5},"curve-to-mesh":{caps:true},"instance-on-points":{scale:[1,1,1]},"realize-instances":{},"group-input":{objectId:"source"},"group-output":{}};
 return {id,type,params:params[type]};
}
