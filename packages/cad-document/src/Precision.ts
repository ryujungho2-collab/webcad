/** Numerical/modeling tolerances are separate from UI snap pixels and drawing tolerances. */
export const CAD_PRECISION = Object.freeze({
  lengthUnit: "mm" as const,
  sketchAngleUnit: "rad" as const,
  objectRotationUnit: "deg" as const,
  linearTolerance: 1e-6,
  angularTolerance: 1e-8,
  brepPropertyRelativeTolerance: 1e-10,
  coordinateRoundoffFactor: 64,
});

export function linearToleranceAt(...coordinates: number[]) {
  if (!coordinates.every(Number.isFinite)) throw new Error("Coordinates must be finite.");
  return Math.max(CAD_PRECISION.linearTolerance,
    CAD_PRECISION.coordinateRoundoffFactor * Number.EPSILON * Math.max(1, ...coordinates.map(Math.abs)));
}

/** Render tessellation is a cache; an editable mesh will own its own source and topology. */
export type GeometryRepresentation = "analytic-curve" | "planar-region" | "brep" | "annotation" | "polygon-mesh";
export type MeasurementBasis = "analytic" | "brep" | "mesh";
export type GeometryMeasurement = {
  basis: MeasurementBasis;
  lengthUnit: "mm";
  volume?: number;
  area?: number;
  length?: number;
  bounds?: { min: [number, number, number]; max: [number, number, number] };
  validity?: "valid" | "invalid";
  /** Mesh measurements must state their approximation; they never imply BRep precision. */
  approximation?: { linearDeviation?: number; reason: string };
};
