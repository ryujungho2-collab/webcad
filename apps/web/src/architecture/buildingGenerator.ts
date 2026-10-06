import type { CadCommand } from "@agent-webcad/cad-commands";
import { validateCommand } from "@agent-webcad/cad-commands";
import type { SketchLoop } from "../precision/sketchProfiles";
import type { Vec3 } from "../precision/workPlane";

export type BuildingPreset = {
  floors: number;
  wallHeight: number;
  wallThickness: number;
  slabThickness: number;
  roof: "gable" | "flat";
  roofHeight: number;
  openings: boolean;
};

export const HOUSE_PRESET: BuildingPreset = {
  floors: 2,
  wallHeight: 2800,
  wallThickness: 200,
  slabThickness: 200,
  roof: "gable",
  roofHeight: 1500,
  openings: true,
};

export const APARTMENT_PRESET: BuildingPreset = {
  floors: 3,
  wallHeight: 2800,
  wallThickness: 200,
  slabThickness: 200,
  roof: "flat",
  roofHeight: 1100,
  openings: true,
};

export type BuildingPlanResult =
  | { ok: true; command: CadCommand; summary: string[] }
  | { ok: false; reason: string };

/** Coincident-face poison: overlapping solids sink into each other by this. */
const SINK = 0.5;
/** Opening cutters overshoot the wall faces by this on every side. */
const CUT_OVER = 0.5;
const EAVE_OVERHANG = 300;
const DOOR = { width: 900, height: 2100 };
const WINDOW = { width: 1200, height: 1200, sill: 900 };

type Edge = { start: Vec3; end: Vec3 };

function edgeLength(edge: Edge): number {
  return Math.hypot(edge.end[0] - edge.start[0], edge.end[1] - edge.start[1]);
}

function unit2D(edge: Edge): [number, number] | null {
  const dx = edge.end[0] - edge.start[0];
  const dy = edge.end[1] - edge.start[1];
  const length = Math.hypot(dx, dy);
  return length > 1e-9 ? [dx / length, dy / length] : null;
}

/** Wall footprint corners at elevation z: edge extended by half thickness, widened to full thickness. */
function wallFootprint(edge: Edge, thickness: number, z: number): Vec3[] | null {
  const dir = unit2D(edge);
  if (!dir) return null;
  const normal: [number, number] = [-dir[1], dir[0]];
  const half = thickness / 2;
  const corner = (along: number, across: number): Vec3 => [
    edge.start[0] + dir[0] * along + normal[0] * across,
    edge.start[1] + dir[1] * along + normal[1] * across,
    z,
  ];
  const length = edgeLength(edge);
  return [
    corner(-half, half),
    corner(length + half, half),
    corner(length + half, -half),
    corner(-half, -half),
  ];
}

function closedPolyline(points: Vec3[]): Record<string, unknown> {
  return { points, closed: true };
}

type Builder = {
  commands: Exclude<CadCommand, { type: "batch" }>[];
  push(command: Exclude<CadCommand, { type: "batch" }>): void;
};

function makeBuilder(): Builder {
  const commands: Builder["commands"] = [];
  return { commands, push: (command) => commands.push(command) };
}

/**
 * Plans a building from one closed straight-edge footprint loop.
 * Everything is axis-free world geometry: walls, slabs, opening cutters and
 * the roof are closed-polyline drawings that later extrude, so no rotation
 * math exists anywhere in the pipeline. Deterministic ids make re-apply a
 * safe no-op (the batch rejects atomically on collision) instead of
 * duplicating the building.
 */
export function planBuilding(loop: SketchLoop, preset: BuildingPreset, tag: string): BuildingPlanResult {
  if (loop.workPlane !== "XY") {
    return { ok: false, reason: "Building footprints must lie on the XY plane." };
  }
  const lineEdges: Edge[] = [];
  for (const segment of loop.segments) {
    if (segment.kind !== "line") {
      return { ok: false, reason: "Building footprints need straight edges — arcs and circles are not supported yet." };
    }
    lineEdges.push({ start: segment.start, end: segment.end });
  }
  if (lineEdges.length < 3) {
    return { ok: false, reason: "Building footprints need at least three wall edges." };
  }
  if (!(preset.floors >= 1 && preset.floors <= 20)) {
    return { ok: false, reason: "Floors must be between 1 and 20." };
  }
  const { wallHeight: H, wallThickness: T, slabThickness: S } = preset;
  if (!(H > 0 && T > 0 && S > 0)) {
    return { ok: false, reason: "Wall height, thickness and slab thickness must be positive." };
  }

  const builder = makeBuilder();
  const summary: string[] = [];
  const footprintId = (name: string) => `building-${tag}-${name}`;
  const storyTop = (floor: number) => floor * (H + S) + S + H;

  const addSlab = (name: string, points: Vec3[], z: number, thickness: number) => {
    const drawingId = footprintId(name);
    builder.push({ type: "create-drawing", id: drawingId, drawing: "polyline", params: { ...closedPolyline(points.map(([x, y]) => [x, y, z] as Vec3)), workPlane: "XY" } });
    const solidId = `${drawingId}-solid`;
    builder.push({ type: "create-extrude", id: solidId, profileObjectIds: [drawingId], distance: thickness });
    return solidId;
  };

  const addWall = (floor: number, wallIndex: number, edge: Edge, baseZ: number, height: number, thickness: number): string | null => {
    const corners = wallFootprint(edge, thickness, baseZ - SINK);
    if (!corners) return null;
    const drawingId = footprintId(`wall-f${floor}-${wallIndex}`);
    builder.push({ type: "create-drawing", id: drawingId, drawing: "polyline", params: { ...closedPolyline(corners), workPlane: "XY" } });
    const solidId = `${drawingId}-solid`;
    builder.push({ type: "create-extrude", id: solidId, profileObjectIds: [drawingId], distance: height + SINK });
    return solidId;
  };

  const addOpeningCut = (targetId: string, name: string, edge: Edge, thickness: number, alongCenter: number, width: number, sillZ: number, height: number): string | null => {
    const dir = unit2D(edge);
    if (!dir) return null;
    const normal: [number, number] = [-dir[1], dir[0]];
    const half = width / 2;
    const across = thickness / 2 + CUT_OVER;
    const at = (along: number, side: number): Vec3 => [
      edge.start[0] + dir[0] * along + normal[0] * side,
      edge.start[1] + dir[1] * along + normal[1] * side,
      sillZ - CUT_OVER,
    ];
    const corners = [at(alongCenter - half, across), at(alongCenter + half, across), at(alongCenter + half, -across), at(alongCenter - half, -across)];
    const drawingId = footprintId(name);
    builder.push({ type: "create-drawing", id: drawingId, drawing: "polyline", params: { ...closedPolyline(corners), workPlane: "XY" } });
    const toolId = `${drawingId}-solid`;
    builder.push({ type: "create-extrude", id: toolId, profileObjectIds: [drawingId], distance: height + 2 * CUT_OVER });
    // Deterministic result id: the next cut in the chain targets it, so the
    // whole building stays a static plan with no apply-time resolution.
    const resultId = `${toolId}-result`;
    builder.push({ type: "boolean-operation", operation: "cut", target: targetId, tool: toolId, id: resultId });
    return resultId;
  };

  // Ground slab from the footprint polygon itself (any shape, not just boxes).
  const footprintPoints = lineEdges.map((edge) => edge.start);
  addSlab("slab-ground", footprintPoints, 0, S);
  summary.push(`Ground slab ${footprintPoints.length}-sided, ${S} mm`);

  let longestEdge = 0;
  lineEdges.forEach((edge, index) => {
    if (edgeLength(edge) > edgeLength(lineEdges[longestEdge])) longestEdge = index;
  });

  for (let floor = 0; floor < preset.floors; floor += 1) {
    const baseZ = floor * (H + S) + S;
    if (floor > 0) {
      addSlab(`slab-f${floor}`, footprintPoints, baseZ - S, S);
      summary.push(`Floor ${floor + 1} slab`);
    }
    lineEdges.forEach((edge, wallIndex) => {
      const length = edgeLength(edge);
      let targetId = addWall(floor, wallIndex, edge, baseZ, H, T);
      if (!targetId) return;
      summary.push(`Floor ${floor + 1} wall ${wallIndex + 1}: ${Math.round(length)} mm`);
      if (!preset.openings) return;
      // v1 rules: a door on the longest ground-floor wall, windows spaced
      // along every other long-enough wall. Each cut chains through
      // deterministic result ids (see addOpeningCut).
      const cuts: { along: number; width: number; sill: number; height: number; label: string }[] = [];
      if (floor === 0 && wallIndex === longestEdge) {
        cuts.push({ along: length / 2, width: DOOR.width, sill: baseZ, height: DOOR.height, label: "door" });
      } else if (length >= 1800) {
        const count = Math.max(1, Math.floor(length / 3000));
        for (let slot = 0; slot < count; slot += 1) {
          cuts.push({
            along: (length * (slot + 1)) / (count + 1),
            width: Math.min(WINDOW.width, length - 600),
            sill: baseZ + WINDOW.sill,
            height: WINDOW.height,
            label: `window-${slot}`,
          });
        }
      }
      for (const cut of cuts) {
        const next = addOpeningCut(targetId, `opening-f${floor}-${wallIndex}-${cut.label}`, edge, T, cut.along, cut.width, cut.sill, cut.height);
        if (!next) return;
        targetId = next;
        summary.push(`Floor ${floor + 1} wall ${wallIndex + 1} ${cut.label}`);
      }
    });
  }
  const topZ = storyTop(preset.floors - 1);
  if (preset.roof === "gable") {
    const xs = footprintPoints.map(([x]) => x);
    const ys = footprintPoints.map(([, y]) => y);
    const minX = Math.min(...xs) - EAVE_OVERHANG;
    const maxX = Math.max(...xs) + EAVE_OVERHANG;
    const maxY = Math.max(...ys) + EAVE_OVERHANG;
    const depth = maxY - Math.min(...ys) + 2 * EAVE_OVERHANG;
    const apex: Vec3 = [(minX + maxX) / 2, maxY, topZ - SINK + preset.roofHeight];
    const triangle: Vec3[] = [[minX, maxY, topZ - SINK], [maxX, maxY, topZ - SINK], apex];
    const drawingId = footprintId("roof");
    builder.push({ type: "create-drawing", id: drawingId, drawing: "polyline", params: { ...closedPolyline(triangle), workPlane: "XZ" } });
    builder.push({ type: "create-extrude", id: `${drawingId}-solid`, profileObjectIds: [drawingId], distance: -depth });
    summary.push(`Gable roof span ${Math.round(maxX - minX)} mm, rise ${preset.roofHeight} mm`);
  } else {
    addSlab("slab-roof", footprintPoints, topZ - SINK, S);
    lineEdges.forEach((edge, wallIndex) => {
      addWall(preset.floors, wallIndex, { start: [edge.start[0], edge.start[1], 0], end: [edge.end[0], edge.end[1], 0] }, topZ - SINK + S, preset.roofHeight, T);
    });
    summary.push(`Flat roof with parapet ${preset.roofHeight} mm`);
  }

  const command: CadCommand = {
    type: "batch",
    label: `Building (${preset.floors}F ${preset.roof})`,
    commands: builder.commands,
  };
  if (!validateCommand(command)) {
    return { ok: false, reason: "Planned building commands failed validation." };
  }
  return { ok: true, command, summary };
}
