export type DrawingTopologyControl = {
  id: string;
  role: "vertex" | "center" | "radius" | "start" | "end";
  index?: number;
};

export type DrawingTopologySegment = {
  id: string;
  startControlId: string;
  endControlId: string;
};

export type DrawingTopologyCurve = {
  id: string;
  kind: "circle" | "arc";
};

export type DrawingTopology = {
  version: 1;
  controls: DrawingTopologyControl[];
  segments: DrawingTopologySegment[];
  curves: DrawingTopologyCurve[];
};

/**
 * Builds document-owned topology references for drawing entities.
 * A stable prefix is used for persisted/generated geometry; otherwise UUIDs
 * keep references unique while the new entity is being created.
 */
export function createDrawingTopology(
  kind: string,
  params: Record<string, unknown>,
  stablePrefix?: string,
): DrawingTopology {
  const id = (role: string, index: number) =>
    stablePrefix ? `${stablePrefix}:${role}:${index}` : `${role}-${crypto.randomUUID()}`;
  const controls: DrawingTopologyControl[] = [];
  const segments: DrawingTopologySegment[] = [];
  const curves: DrawingTopologyCurve[] = [];

  if ((kind === "line" || kind === "polyline" || kind === "rectangle") && Array.isArray(params.points)) {
    params.points.forEach((_, index) => controls.push({ id: id("vertex", index), role: "vertex", index }));
    for (let index = 0; index < controls.length - 1; index += 1) {
      segments.push({
        id: id("segment", index),
        startControlId: controls[index].id,
        endControlId: controls[index + 1].id,
      });
    }
    if ((kind === "rectangle" || params.closed === true) && controls.length > 2) {
      segments.push({
        id: id("segment", controls.length - 1),
        startControlId: controls.at(-1)!.id,
        endControlId: controls[0].id,
      });
    }
  } else if (kind === "circle") {
    controls.push(
      { id: id("center", 0), role: "center" },
      { id: id("radius", 0), role: "radius" },
    );
    curves.push({ id: id("curve", 0), kind: "circle" });
  } else if (kind === "arc") {
    controls.push(
      { id: id("center", 0), role: "center" },
      { id: id("start", 0), role: "start" },
      { id: id("end", 0), role: "end" },
    );
    curves.push({ id: id("curve", 0), kind: "arc" });
  }

  return { version: 1, controls, segments, curves };
}
