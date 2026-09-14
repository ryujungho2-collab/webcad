export type LengthUnit = "mm" | "cm" | "m" | "in" | "ft";

const millimetersPerUnit: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

export function parseLength(value: string, defaultUnit: LengthUnit = "mm") {
  const match = value.trim().toLowerCase().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(mm|cm|m|in|ft)?$/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return number * millimetersPerUnit[(match[2] as LengthUnit | undefined) ?? defaultUnit];
}

export function parseAngle(value: string) {
  const match = value.trim().toLowerCase().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(deg|°)?$/);
  if (!match) return null;
  const degrees = Number(match[1]);
  return Number.isFinite(degrees) ? degrees : null;
}

export function convertLength(millimeters: number, unit: LengthUnit) { return millimeters / millimetersPerUnit[unit]; }

export function formatLength(millimeters: number, unit: LengthUnit = "mm", digits = 2) {
  return `${new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(convertLength(millimeters, unit))} ${unit}`;
}
