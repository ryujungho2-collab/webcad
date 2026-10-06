import type { Camera } from "three";
import type { SnapPreferences } from "../../precision/snapPreferences";
import type { Vec3 } from "../../precision/workPlane";

/** Canvas hosts depend on these types without importing a tool's React code. */
export type DrawingEditCanvas = {
  project: (point: Vec3) => [number, number];
  getCanvas: () => HTMLCanvasElement | null;
  getCamera: () => Camera | null;
  onClose: () => void;
  onApplied: (ids: string[]) => void;
  onFrame: (points: Vec3[]) => void;
};

export type ContourMode = "join" | "explode" | "break" | "polyline" | "lengthen" | "stretch";
export type ContourSession = { id: string; mode: ContourMode; objectIds: string[] };
export type ContourToolProps = DrawingEditCanvas & {
  session: ContourSession;
  snapEnabled: boolean;
  snapPreferences?: SnapPreferences;
};

export type CurveSession = { id: string; objectIds: string[] };
export type CurveNextAction = { label: string; run: () => void };
export type CurveWorkbenchProps = DrawingEditCanvas & {
  session: CurveSession;
  constructionVisible: boolean;
  nextActions?: CurveNextAction[];
};
