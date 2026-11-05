import {useRef} from "react";
type NumericFieldProps = {
  label: string;
  context: string;
  unit: string;
  value: string;
  mixed?: boolean;
  disabled?: boolean;
  min?: string;
  step: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  unitInput?:boolean;
};

/** Presentation only: preserve the exact draft; never round model values. */
export function NumericField(props: NumericFieldProps) {
  const original=useRef(props.value),cancelled=useRef(false);
  return (
    <label className="property-row numeric-row" data-axis={props.label.toLowerCase()}>
      <span>{props.label}</span>
      <span className={`numeric-control${props.mixed && props.value === "Mixed" ? " is-mixed" : ""}`}>
        <input aria-label={`${props.context} ${props.label}`} type={props.mixed||props.unitInput ? "text" : "number"}
          title={props.mixed && props.value === "Mixed" ? "Mixed values. Enter a value to apply it to the selection." : `${props.context} ${props.label} (${props.unit})`}
          className={props.mixed && props.value === "Mixed" ? "numeric-input numeric-input-mixed" : "numeric-input"}
          inputMode="decimal"
          disabled={props.disabled} min={props.mixed ? undefined : props.min} step={props.mixed ? undefined : props.step} value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          onFocus={(event) => {original.current=props.value;cancelled.current=false;event.currentTarget.select();}}
          onBlur={()=>{if(!cancelled.current)props.onCommit?.();cancelled.current=false;}}
          onKeyDown={(event) => { if(event.nativeEvent.isComposing||event.keyCode===229)return;if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancelled.current=true;props.onChange(original.current);event.currentTarget.blur();}else if (event.key === "Enter") event.currentTarget.blur(); }} />
        <span aria-hidden="true" className="numeric-unit">{props.unit}</span>
      </span>
    </label>
  );
}
