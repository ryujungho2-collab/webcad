import type {CadDocument} from "@agent-webcad/cad-document";
import type {TopologySelectionRef} from "./selection";
import {getObjectTransform} from "../precision/objectTransform";
import {explodedDisplayOffset} from "../precision/modelPresentation";
import {measureSelectedDistance} from "../cad/kernelGeometryService";
export async function measureSelectedPair(document:CadDocument,a:TopologySelectionRef,b:TopologySelectionRef,signal?:AbortSignal,mode:import("@agent-webcad/cad-kernel").SelectedDistanceMode="shortest"){
 const operand=(ref:TopologySelectionRef)=>{const object=document.objects[ref.objectId],feature=Object.values(document.features).find(f=>f.output===ref.objectId),layer=object&&document.layers[object.layerId];
 if(!object?.visible||!layer?.visible||layer.locked||!feature)throw Error("Selected object is unavailable, hidden or locked.");
 if(!["brep-face","brep-edge"].includes(ref.kind))throw Error("Select a BRep face or edge.");
 if(document.modelPresentation?.clipping?.enabled||explodedDisplayOffset(document,ref.objectId).some(n=>n!==0))throw Error("Assemble the display and disable clipping before measuring.");
 return {params:structuredClone(feature.params),transform:getObjectTransform(object,feature)};};
 if(a.objectId===b.objectId&&a.kind===b.kind&&a.topologyId===b.topologyId)throw Error("Choose two different elements.");
 return measureSelectedDistance(operand(a),operand(b),{kind:a.kind as "brep-face"|"brep-edge",key:a.topologyId},{kind:b.kind as "brep-face"|"brep-edge",key:b.topologyId},{signal},mode);
}
