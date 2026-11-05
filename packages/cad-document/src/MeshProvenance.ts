import {meshEdges,type EditableMesh} from "./EditableMesh";
import type {MeshTopologyChange} from "./MeshTopology";

export type TopologyDomain="vertices"|"edges"|"faces";
export type TopologyInventory=Record<TopologyDomain,string[]>;
export type TopologyProvenance={version:1;base:TopologyInventory;events:{revision:number;change:MeshTopologyChange}[]};
const domains:TopologyDomain[]=["vertices","edges","faces"];
export function topologyInventory(m:EditableMesh):TopologyInventory{return {vertices:m.vertices.map(v=>v.id),edges:meshEdges(m).map(e=>e.id),faces:m.faces.map(f=>f.id)};}
export function appendMeshProvenance(before:EditableMesh,after:EditableMesh,change?:MeshTopologyChange){
 const history:TopologyProvenance=structuredClone(before.provenance??{version:1,base:topologyInventory(before),events:[]});
 if(history.events.length>=200)throw Error("Topology history budget reached (200 edits); no history was silently discarded.");
 const identity:MeshTopologyChange={operation:"transform",vertices:{},edges:{},faces:{},generated:{vertices:[],edges:[],faces:[]},deleted:{vertices:[],edges:[],faces:[]}};
 history.events.push({revision:history.events.length+1,change:structuredClone(change??identity)});after.provenance=history;
 if(!validMeshProvenance(after))throw Error("Invalid cumulative topology history or provenance memory budget exceeded.");
}
export function validMeshProvenance(mesh:EditableMesh):boolean{
 const h=mesh.provenance;if(h===undefined)return true;
 try{if(!h||h.version!==1||!Array.isArray(h.events)||h.events.length>200||JSON.stringify(h).length>8_000_000)return false;
 const active={} as Record<TopologyDomain,Set<string>>,ever={} as Record<TopologyDomain,Set<string>>;
 for(const d of domains){if(!Array.isArray(h.base?.[d])||h.base[d].length>80000||h.base[d].some(id=>typeof id!=="string"||!id.length||id.length>220)||new Set(h.base[d]).size!==h.base[d].length)return false;active[d]=new Set(h.base[d]);ever[d]=new Set(h.base[d]);}
 for(let i=0;i<h.events.length;i++){const e=h.events[i];if(e.revision!==i+1||!e.change||typeof e.change.operation!=="string"||e.change.operation.length>64)return false;
  for(const d of domains){const c=e.change,removed=c.deleted?.[d],added=c.generated?.[d],map=c[d];if(!Array.isArray(removed)||!Array.isArray(added)||!map||typeof map!=="object"||Array.isArray(map)||new Set(removed).size!==removed.length||new Set(added).size!==added.length||removed.some(id=>!active[d].has(id))||added.some(id=>typeof id!=="string"||!id.length||id.length>220||active[d].has(id)||d!=="edges"&&ever[d].has(id)))return false;
   const old=new Set(active[d]);removed.forEach(id=>active[d].delete(id));added.forEach(id=>{active[d].add(id);ever[d].add(id);});
   if(Object.entries(map).some(([id,to])=>!old.has(id)||!Array.isArray(to)||new Set(to).size!==to.length||to.some(id=>!active[d].has(id)))||removed.some(id=>!Object.hasOwn(map,id)))return false;
  }
 }
 const current=topologyInventory(mesh);return domains.every(d=>current[d].length===active[d].size&&current[d].every(id=>active[d].has(id)));
 }catch{return false;}
}
export function resolveTopologyReference(mesh:EditableMesh,domain:TopologyDomain,id:string,fromRevision=0){
 if(!validMeshProvenance(mesh))throw Error("Invalid topology provenance.");const h=mesh.provenance;
 if(!h)return {status:"history-unavailable" as const,ids:[],revision:0};
 if(!Number.isInteger(fromRevision)||fromRevision<0||fromRevision>h.events.length)throw Error("Reference revision is outside recorded history.");
 const available=new Set(h.base[domain]);for(const e of h.events.slice(0,fromRevision)){e.change.deleted[domain].forEach(id=>available.delete(id));e.change.generated[domain].forEach(id=>available.add(id));}
 if(!available.has(id))return {status:"unknown" as const,ids:[],revision:h.events.length};let ids=[id];
 for(const e of h.events.slice(fromRevision))ids=[...new Set(ids.flatMap(id=>e.change[domain][id]??[id]))];
 return {status:!ids.length?"deleted":ids.length===1?"resolved":"split",ids,revision:h.events.length};
}
