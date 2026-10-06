/** Internal sketch coordinates are millimetres in the sketch's local work plane. */
export type SketchPoint = [number, number];
export type SketchWorkPlane = "XY" | "XZ" | "YZ";

export type SketchGeometry = { construction?: boolean } & (
  | { id: string; kind: "line"; startId: string; endId: string; segmentId: string; start: SketchPoint; end: SketchPoint }
  | { id: string; kind: "polyline"; vertices: { id: string; point: SketchPoint }[]; segmentIds: string[]; closed: boolean }
  | { id: string; kind: "rectangle"; cornerIds: [string, string, string, string]; edgeIds: [string, string, string, string]; origin: SketchPoint; width: number; height: number; /** In-plane orientation in radians; omitted means zero. */ angle?: number }
  | { id: string; kind: "circle"; centerId: string; curveId: string; center: SketchPoint; radius: number }
  | { id: string; kind: "arc"; centerId: string; startId: string; endId: string; curveId: string; center: SketchPoint; radius: number; startAngle: number; endAngle: number });

/** A point reference uses a persistent sub-element id, never an array offset. */
export type SketchPointRef = { geometryId: string; pointId: string };
/** A straight edge reference remains stable when its vertices move. */
export type SketchSegmentRef = { geometryId: string; segmentId: string };

export type SketchConstraint =
  | { id: string; kind: "coincident" | "horizontal" | "vertical"; first: SketchPointRef; second: SketchPointRef }
  | { id: string; kind: "distance"; first: SketchPointRef; second: SketchPointRef; value: number }
  | { id: string; kind: "fixed-point"; point: SketchPointRef; value: SketchPoint }
  /** Signed radians from first line direction to second, wrapped to [-pi, pi]. */
  | { id: string; kind: "angle"; firstLineId: string; secondLineId: string; firstSegmentId?: string; secondSegmentId?: string; value: number }
  | { id: string; kind: "radius" | "diameter"; geometryId: string; value: number }
  | { id: string; kind: "parallel" | "perpendicular" | "equal-length"; firstSegment: SketchSegmentRef; secondSegment: SketchSegmentRef }
  | { id: string; kind: "concentric" | "equal-radius"; firstCurveId: string; secondCurveId: string }
  /** Signed side of the directed supporting line is preserved through edits. */
  | { id: string; kind: "tangent-line"; line: SketchSegmentRef; curveId: string; side: 1 | -1 }
  | { id: string; kind: "tangent-circles"; firstCurveId: string; secondCurveId: string; contact: "external" | "internal" }
  | { id: string; kind: "point-on-line"; point: SketchPointRef; line: SketchSegmentRef }
  | { id: string; kind: "point-on-circle"; point: SketchPointRef; curveId: string }
  | { id: string; kind: "symmetric"; first: SketchPointRef; second: SketchPointRef; axis: SketchSegmentRef };

/** Dimension identity is separate from its driving value, which lives only in the constraint. */
export type SketchDimension = { id: string; constraintId: string };

export type SketchSolveState = {
  status: "under-constrained" | "fully-constrained";
  degreesOfFreedom: number;
  rank: number;
  residual: number;
  tolerance: number;
  angularTolerance?: number;
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
