type NumericFieldProps = {
  label: string;
  context: string;
  unit: string;
  value: string;
  disabled?: boolean;
  min?: string;
  step: string;
  onChange: (value: string) => void;
  onCommit: () => void;
};

/** Presentation only: preserve the exact draft; never round model values. */
export function NumericField(props: NumericFieldProps) {
  return (
    <label className="property-row numeric-row" data-axis={props.label.toLowerCase()}>
      <span>{props.label}</span>
      <span className="numeric-control">
        <input aria-label={`${props.context} ${props.label}`} type="number"
          disabled={props.disabled} min={props.min} step={props.step} value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          onBlur={props.onCommit}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        <span aria-hidden="true" className="numeric-unit">{props.unit}</span>
      </span>
    </label>
  );
}
