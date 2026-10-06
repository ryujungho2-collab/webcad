import { useId, type InputHTMLAttributes } from "react";
import { parameterInput, type ParameterKind } from "../precision/parameterInput";
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max"> & { label: string; value: string; onChange: (value: string) => void; kind?: ParameterKind; min?: number; minExclusive?: boolean; max?: number; relativeTo?: [number, number] };
/** Keep the unrounded draft, including incomplete input, until the public plan validates it. */
export function PrecisionField({ label, value, onChange, kind = "length", min, minExclusive, max, relativeTo, ...rest }: Props) {
  const id = useId(), parsed = parameterInput(value, kind, { min, minExclusive, max, relativeTo });
  return <label>{label}<input {...rest} aria-label={rest["aria-label"] ?? label} type="text" inputMode="text" value={value} aria-invalid={!parsed.valid} aria-describedby={id} onChange={e => onChange(e.target.value)} /><small id={id}>{parsed.hint}</small></label>;
}
