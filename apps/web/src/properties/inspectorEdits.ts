import type {CadDocument} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {parseLength} from "../precision/units";
/** Only the submitted field is patched; mixed and untouched fields retain exact values. */
export function primitivePropertyEdit(document:CadDocument,ids:string[],field:string,draft:string):CadCommand|undefined{
  const value=parseLength(draft);if(value===null||value<=0)throw Error("Enter a positive length in mm, cm, m, in or ft.");
  const features=ids.map(id=>Object.values(document.features).find(f=>f.output===id));
  if(!ids.length||features.some(f=>!f||f.type!=="primitive")||new Set(features.map(f=>f?.params.kind)).size!==1)throw Error("Select primitives of the same kind.");
  const commands:Extract<CadCommand,{type:"update-primitive"}>[]=[];
  for(const id of ids){const object=document.objects[id],layer=object&&document.layers[object.layerId],feature=features.find(f=>f?.output===id)!;
    if(!object?.visible||!layer?.visible||layer.locked)throw Error("Show and unlock every selected object before editing.");
    if(typeof feature.params[field]!=="number"||field==="kind")throw Error("This dimension is not supported by the selected primitive.");
    const params={...Object.fromEntries(Object.entries(feature.params).filter(([key,value])=>key!=="kind"&&typeof value==="number")),[field]:value} as Record<string,number>;
    if(feature.params.kind==="torus"&&params.majorRadius<=params.minorRadius)throw Error("Major radius must exceed tube radius.");
    if(feature.params[field]!==value)commands.push({type:"update-primitive",objectId:id,params});
  }
  return commands.length>1?{type:"batch",label:`Edit ${commands.length} primitives`,commands}:commands[0];
}
