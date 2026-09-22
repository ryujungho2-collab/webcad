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
};

/** Presentation only: preserve the exact draft; never round model values. */
export function NumericField(props: NumericFieldProps) {
  return (
    <label className="property-row numeric-row" data-axis={props.label.toLowerCase()}>
      <span>{props.label}</span>
      <span className="numeric-control">
        <input aria-label={`${props.context} ${props.label}`} type={props.mixed ? "text" : "number"}
          className={props.mixed ? "numeric-input numeric-input-mixed" : "numeric-input"}
          disabled={props.disabled} min={props.mixed ? undefined : props.min} step={props.mixed ? undefined : props.step} value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          onFocus={(event) => { if (props.mixed) event.currentTarget.select(); }}
          onBlur={props.onCommit}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        <span aria-hidden="true" className="numeric-unit">{props.unit}</span>
      </span>
    </label>
  );
}
