import type { CadCommand } from "@agent-webcad/cad-commands";
import { parameterTargetKey, type CadDocument, type Sketch, type SketchConstraint } from "@agent-webcad/cad-document";
import { parseSketchDimension, sketchDimensionName } from "../precision/sketchAnnotations";
import { constraintGeometryIds } from "../precision/sketchEditing";
import { formatLength } from "../precision/units";

export type CanvasDimensionDriver = {kind:"dimension"|"variable"|"binding";label:string;draft:string;command:(draft:string)=>CadCommand};

/** Editing a bound dimension deliberately edits its driver, preserving the relationship. */
export function canvasDimensionDriver(document:CadDocument,sketch:Sketch,constraint:SketchConstraint):CanvasDimensionDriver {
  if(!("value" in constraint)||typeof constraint.value!=="number")throw new Error("Select a numeric driving dimension.");
  const target={kind:"sketch-constraint" as const,sketchId:sketch.id,constraintId:constraint.id};
  const binding=Object.values(document.parameterBindings??{}).find(b=>parameterTargetKey(b.target)===parameterTargetKey(target));
  const units=constraint.kind==="angle"?"deg":"mm";
  const expression=(draft:string)=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(draft.trim())?draft.trim()+units:draft.trim();
  if(binding){
    const variable=document.variables?.[binding.expression.trim()];
    if(variable)return {kind:"variable",label:`Edit variable ${variable.name} · all linked values`,draft:variable.expression,
      command:draft=>({type:"set-variable",name:variable.name,quantity:variable.quantity,expression:expression(draft)})};
    return {kind:"binding",label:`Edit driving expression · ${binding.expression}`,draft:binding.expression,
      command:draft=>({type:"set-parameter-binding",target,expression:expression(draft)})};
  }
  return {kind:"dimension",label:`Edit ${sketchDimensionName(sketch,constraint)} · ${units}`,draft:String(constraint.kind==="angle"?constraint.value*180/Math.PI:constraint.value),
    command:draft=>{const value=parseSketchDimension(constraint,draft);if(value===null)throw new Error("Enter a valid dimension with units.");return {type:"set-sketch-dimension",sketchId:sketch.id,constraintId:constraint.id,value};}};
}

export function constraintCaption(sketch:Sketch,constraint:SketchConstraint):string {
  const value="value" in constraint?constraint.value:undefined;
  const text=Array.isArray(value)?`(${value.map(v=>formatLength(v)).join(", ")})`:typeof value==="number"?(constraint.kind==="angle"?`${(value*180/Math.PI).toFixed(2)}°`:formatLength(value)):"";
  return `${sketchDimensionName(sketch,constraint)}${text?` ${text}`:""} · ${constraint.id}`;
}

export function sketchEditImpact(before:Sketch,after:Sketch,constraintId:string,geometryIds:string[]=[]){
  const beforeGeometry=new Map(before.geometry.map(g=>[g.id,g]));
  const afterConstraints=new Map(after.constraints.map(c=>[c.id,c]));
  const changedGeometryIds=after.geometry.filter(g=>JSON.stringify(g)!==JSON.stringify(beforeGeometry.get(g.id))).map(g=>g.id);
  const edited=before.constraints.find(c=>c.id===constraintId);
  const related=new Set([...geometryIds,...changedGeometryIds,...(edited?constraintGeometryIds(edited):[])]);
  return {
    changedGeometryIds,
    relations:before.constraints.filter(c=>related.size&&constraintGeometryIds(c).some(id=>related.has(id))).map(c=>{
      const next=afterConstraints.get(c.id);
      return {id:c.id,before:constraintCaption(before,c),after:next?constraintCaption(after,next):undefined,
        status:!next?"released":JSON.stringify(c)===JSON.stringify(next)?"maintained":"changed"} as const;
    }),
  };
}

export function dimensionEditWithReleases(command:CadCommand,sketchId:string,ids:string[]):CadCommand {
  if(!ids.length)return command;
  if(command.type==="batch")throw new Error("Dimension edits cannot contain nested transactions.");
  return {type:"batch",label:"Edit dimension and release selected constraints",commands:[...ids.map(constraintId=>({type:"remove-sketch-constraint" as const,sketchId,constraintId})),command]};
}
