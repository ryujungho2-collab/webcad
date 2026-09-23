/** Internal sketch coordinates are millimetres in the sketch's local work plane. */
export type SketchPoint = [number, number];
export type SketchWorkPlane = "XY" | "XZ" | "YZ";

export type SketchGeometry =
  | { id: string; kind: "line"; startId: string; endId: string; segmentId: string; start: SketchPoint; end: SketchPoint }
  | { id: string; kind: "polyline"; vertices: { id: string; point: SketchPoint }[]; segmentIds: string[]; closed: boolean }
  | { id: string; kind: "rectangle"; cornerIds: [string, string, string, string]; edgeIds: [string, string, string, string]; origin: SketchPoint; width: number; height: number }
  | { id: string; kind: "circle"; centerId: string; curveId: string; center: SketchPoint; radius: number }
  | { id: string; kind: "arc"; centerId: string; startId: string; endId: string; curveId: string; center: SketchPoint; radius: number; startAngle: number; endAngle: number };

/** A point reference uses a persistent sub-element id, never an array offset. */
export type SketchPointRef = { geometryId: string; pointId: string };

export type SketchConstraint =
  | { id: string; kind: "coincident" | "horizontal" | "vertical"; first: SketchPointRef; second: SketchPointRef }
  | { id: string; kind: "distance"; first: SketchPointRef; second: SketchPointRef; value: number }
  | { id: string; kind: "fixed-point"; point: SketchPointRef; value: SketchPoint }
  /** Signed radians from first line direction to second, wrapped to [-pi, pi]. */
  | { id: string; kind: "angle"; firstLineId: string; secondLineId: string; value: number }
  | { id: string; kind: "radius" | "diameter"; geometryId: string; value: number };

/** Dimension identity is separate from its driving value, which lives only in the constraint. */
export type SketchDimension = { id: string; constraintId: string };

export type SketchSolveState = {
  status: "under-constrained" | "fully-constrained";
  degreesOfFreedom: number;
  rank: number;
  residual: number;
  tolerance: number;
};

export type Sketch = {
  id: string;
  workPlane: SketchWorkPlane;
  layerId: string;
  geometry: SketchGeometry[];
  constraints: SketchConstraint[];
  dimensions: SketchDimension[];
  solveState: SketchSolveState;
};
