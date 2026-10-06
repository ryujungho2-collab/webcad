import {cadDocument} from "../state/cadDocument";
import {PropertySection} from "../ui/PropertySection";

export function ParameterBindingsNotice({objectId,sketchId,onEdit}:{objectId?:string;sketchId?:string;onEdit?:()=>void}){
  const bindings=Object.values(cadDocument.parameterBindings??{}).filter(binding=>binding.target.kind === "feature" ? binding.target.objectId === objectId : binding.target.sketchId === sketchId);
  if(!bindings.length)return null;
  return <PropertySection title="Driven parameters" meta="fx">
    {bindings.map(binding=><p className="property-hint" key={binding.id}>{binding.target.kind === "feature"?binding.target.parameter:`${binding.target.constraintId}${binding.target.component?`.${binding.target.component}`:""}`} = <strong>{binding.expression}</strong></p>)}
    <p className="property-hint">Edit the expression or its variables to change these values.</p>
    {onEdit&&<button type="button" onClick={onEdit}>Edit variables</button>}
  </PropertySection>;
}
