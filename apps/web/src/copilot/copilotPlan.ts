import type { CadCommand } from "@agent-webcad/cad-commands";
import { validateCommand } from "@agent-webcad/cad-commands";
import type { ExtrudeProfile } from "@agent-webcad/cad-kernel";
import { planeToWorld, WORK_PLANES, type Vec3, type WorkPlaneId } from "../precision/workPlane";

/**
 * Copilot plan pipeline.
 *
 * A plan is a pure derivation: natural language -> validated CadCommands plus
 * a human-readable summary. Plans never touch the document; preview renders
 * ghost meshes from the same params and apply dispatches them through the
 * standard undoable `dispatchCadCommand` path (single batch history entry).
 *
 * Profile intents (rectangle/circle, optional extrude) build drawing params
 * and the extrude kernel profile from the same corner numbers, so preview
 * and commit are geometrically identical by construction. Extrude commands
 * reference planner-assigned profile IDs; the batch executes sequentially so
 * each extrude resolves its profile from the live document exactly like the
 * manual select-profile-then-extrude flow.
 */

export type CopilotPrimitive = "box" | "cylinder" | "sphere" | "cone" | "torus";

export type CopilotGhost =
  | {
    kind: "primitive";
    key: string;
    primitive: CopilotPrimitive;
    params: Record<string, number>;
    position: [number, number, number];
  }
  | {
    kind: "drawing";
    key: string;
    drawing: "line" | "polyline" | "rectangle" | "circle" | "arc";
    /** Drawing params for create-drawing-render: kind + workPlane + points/center/radius. */
    params: Record<string, unknown>;
  }
  | {
    kind: "extrude";
    key: string;
    profile: ExtrudeProfile;
    distance: number;
  };

export type CopilotPlan = {
  /** Ready-to-dispatch command: single create or labelled batch. */
  command: CadCommand;
  /** One summary line per created object, shown in the panel and preview. */
  summary: string[];
  /** Ghost specs for transient viewport preview. Mirrors `command` exactly. */
  ghosts: CopilotGhost[];
};

export type CopilotPlanResult =
  | { ok: true; plan: CopilotPlan }
  | { ok: false; reason: string };

/**
 * Backend seam for a future LLM function-calling adapter. The rule parser
 * below is the default backend; an LLM backend must return the same shape
 * (validated commands only) so panel/preview/apply never change.
 */
export interface CopilotBackend {
  plan(input: string): CopilotPlanResult;
}

const PRIMITIVE_KEYWORDS: { primitive: CopilotPrimitive; keywords: string[]; label: string }[] = [
  { primitive: "box", keywords: ["box", "박스", "상자", "직육면체"], label: "Box" },
  { primitive: "cylinder", keywords: ["cylinder", "원기둥", "실린더", "원통"], label: "Cylinder" },
  { primitive: "sphere", keywords: ["sphere", "구", "스피어", "공"], label: "Sphere" },
  { primitive: "cone", keywords: ["cone", "원뿔", "콘"], label: "Cone" },
  { primitive: "torus", keywords: ["torus", "토러스", "도넛"], label: "Torus" },
];

const DEFAULT_BOX: Record<string, number> = { width: 10, depth: 10, height: 10 };
const DEFAULT_PRIMITIVE_PARAMS: Record<CopilotPrimitive, Record<string, number>> = {
  box: DEFAULT_BOX,
  cylinder: { radius: 5, height: 10 },
  sphere: { radius: 5 },
  cone: { radius1: 5, radius2: 2, height: 10 },
  torus: { majorRadius: 6, minorRadius: 2 },
};

function detectPrimitive(normalized: string): typeof PRIMITIVE_KEYWORDS[number] | null {
  for (const entry of PRIMITIVE_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) return entry;
  }
  return null;
}

/** Leading count: `3개`, trailing `x3` / `3x`, `3 copies`. Dimension triples
 * (`10x10x10`) never count: count patterns anchor to string edges or to
 * explicit count words. Korean numerals are out of scope. */
function parseCount(normalized: string): number {
  const match = normalized.match(/(\d+)\s*(?:개|copies|copy)(?:의)?(?![a-z가-힣])/) ??
    normalized.match(/(?:^|\s)x\s*(\d+)\s*$/) ??
    normalized.match(/(?:^|\s)(\d+)\s*x\s*$/) ??
    normalized.match(/^(\d+)\s*x(?:\s|$)/);
  if (!match) return 1;
  const count = Math.floor(Number(match[1]));
  return count >= 1 && count <= 20 ? count : 1;
}

function parseSpacing(normalized: string): number {
  const match = normalized.match(/(?:간격|spacing)\s*(\d+(?:\.\d+)?)/);
  if (!match) return 20;
  const spacing = Number(match[1]);
  return Number.isFinite(spacing) && spacing > 0 ? spacing : 20;
}

/** `100x50x30`, `100 50 30`, `100,50,30` (mm). */
function parseTripleDimensions(normalized: string): [number, number, number] | null {
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*[x×,\s]\s*(\d+(?:\.\d+)?)\s*[x×,\s]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const values = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!values.every((value) => Number.isFinite(value) && value > 0)) return null;
  return values as [number, number, number];
}

/** Radius from `반지름/radius N` or `지름/diameter N` (halved). Single
 * letters need word boundaries; `(?<!반)지름` keeps 반지름 from matching
 * the diameter branch. */
function parseRadius(normalized: string): number | null {
  const radiusMatch = normalized.match(/(?:반지름|radius|\br\b)\s*(\d+(?:\.\d+)?)/);
  if (radiusMatch) {
    const radius = Number(radiusMatch[1]);
    return radius > 0 ? radius : null;
  }
  const diameterMatch = normalized.match(/(?<!반)(?:지름|diameter|\bd\b)\s*(\d+(?:\.\d+)?)/);
  if (diameterMatch) {
    const radius = Number(diameterMatch[1]) / 2;
    return radius > 0 ? radius : null;
  }
  // Bare number only when it is the sole number (avoids stealing counts).
  const numbers = [...normalized.matchAll(/(\d+(?:\.\d+)?)/g)].map((entry) => Number(entry[1]));
  if (numbers.length === 1 && numbers[0] > 0) return numbers[0];
  return null;
}

/** Height from `높이/height N` (cylinder/cone only). */
function parseHeight(normalized: string): number | null {
  const match = normalized.match(/(?:높이|height|\bh\b)\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const height = Number(match[1]);
  return height > 0 ? height : null;
}

function paramsFor(primitive: CopilotPrimitive, normalized: string): Record<string, number> {
  const defaults = DEFAULT_PRIMITIVE_PARAMS[primitive];
  if (primitive === "box") {
    const triple = parseTripleDimensions(normalized);
    if (triple) return { width: triple[0], depth: triple[1], height: triple[2] };
    return { ...defaults };
  }
  if (primitive === "sphere") {
    const radius = parseRadius(normalized);
    return { radius: radius ?? defaults.radius };
  }
  if (primitive === "torus") {
    const radius = parseRadius(normalized);
    return { majorRadius: radius ?? defaults.majorRadius, minorRadius: defaults.minorRadius };
  }
  const radius = parseRadius(normalized);
  const height = parseHeight(normalized);
  if (primitive === "cylinder") {
    return { radius: radius ?? defaults.radius, height: height ?? defaults.height };
  }
  return { radius1: radius ?? defaults.radius1, radius2: defaults.radius2, height: height ?? defaults.height };
}

const HINT = "예: “100x50x30 박스 3개”, “반지름 5 원기둥”, “100x50 사각형 돌출 20”, '10x10x10 box x3'";

const DRAWING_KEYWORDS: { drawing: "rectangle" | "circle"; keywords: string[]; label: string }[] = [
  { drawing: "rectangle", keywords: ["사각형", "rectangle", "rect", "네모"], label: "Rectangle" },
  { drawing: "circle", keywords: ["동그라미", "circle"], label: "Circle" },
  // Bare 원 matches too many compounds (원기둥/원뿔/원통); those are claimed
  // by the primitive pass first, so reaching here bare 원 means a circle.
  { drawing: "circle", keywords: ["원"], label: "Circle" },
];

function detectDrawing(normalized: string): typeof DRAWING_KEYWORDS[number] | null {
  for (const entry of DRAWING_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) return entry;
  }
  return null;
}

/** XY default; `XZ`/`YZ` tokens (with or without 평면) select the plane. */
function detectWorkPlane(normalized: string): WorkPlaneId {
  if (/\bxz\b/.test(normalized)) return "XZ";
  if (/\byz\b/.test(normalized)) return "YZ";
  return "XY";
}

/**
 * Extrude intent: `돌출 N` / `extrude N`. A bare 돌출 without a number falls
 * back to a 높이 number, then to the 10 mm default (matches the toolbar).
 * Returns null when no extrude keyword is present.
 */
function parseExtrudeDistance(normalized: string): number | null {
  if (!/(돌출|extrude)/.test(normalized)) return null;
  const direct = normalized.match(/(?:돌출|extrude)\s*(\d+(?:\.\d+)?)/);
  if (direct && Number(direct[1]) > 0) return Number(direct[1]);
  return parseHeight(normalized) ?? 10;
}

/**
 * Rectangle pair `100x50` that is NOT part of a triple (`100x50x30` stays a
 * box). Profiles live on the work plane with an in-plane X offset for copies.
 */
function parsePairDimensions(normalized: string): [number, number] | null {
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?!\s*[x×]\s*\d)/);
  if (!match) return null;
  const values = [Number(match[1]), Number(match[2])];
  if (!values.every((value) => Number.isFinite(value) && value > 0)) return null;
  return values as [number, number];
}

function rectangleProfile(plane: WorkPlaneId, width: number, height: number, xOffset: number, refPrefix: string): { points: Vec3[]; profile: ExtrudeProfile } {
  const frame = WORK_PLANES[plane];
  const corners: Vec3[] = [
    [xOffset, 0], [xOffset + width, 0], [xOffset + width, height], [xOffset, height],
  ].map(([x, y]) => planeToWorld([x, y], frame));
  return {
    points: corners,
    profile: {
      id: refPrefix,
      normal: [...frame.normal] as Vec3,
      segments: corners.map((start, index) => ({
        kind: "line" as const,
        topologyReference: `${refPrefix}/edge:${index}`,
        start,
        end: corners[(index + 1) % corners.length],
      })),
    },
  };
}

function circleProfile(plane: WorkPlaneId, radius: number, xOffset: number, refPrefix: string): { center: Vec3; profile: ExtrudeProfile } {
  const frame = WORK_PLANES[plane];
  const center = planeToWorld([xOffset, 0], frame);
  return {
    center,
    profile: {
      id: refPrefix,
      normal: [...frame.normal] as Vec3,
      segments: [{
        kind: "circle" as const,
        topologyReference: `${refPrefix}/curve:0`,
        center,
        radius,
        normal: [...frame.normal] as Vec3,
        xAxis: [...frame.xAxis] as Vec3,
      }],
    },
  };
}

function describePrimitiveGhost(primitive: string, params: Record<string, number>, position: [number, number, number]): string {
  const dims = Object.entries(params).map(([key, value]) => `${key} ${value}`).join(" · ");
  return `${primitive} (${dims}) at [${position.map((value) => Number(value.toFixed(2))).join(", ")}]`;
}

function profileId(): string {
  return `copilot-profile-${crypto.randomUUID().slice(0, 8)}`;
}

function planPrimitive(detected: typeof PRIMITIVE_KEYWORDS[number], normalized: string): CopilotPlanResult {
  const count = parseCount(normalized);
  const spacing = parseSpacing(normalized);
  const params = paramsFor(detected.primitive, normalized);

  const ghosts: CopilotGhost[] = [];
  const commands: Exclude<CadCommand, { type: "batch" }>[] = [];
  for (let index = 0; index < count; index++) {
    const position: [number, number, number] = [index * spacing, 0, 0];
    ghosts.push({ kind: "primitive", key: `copilot-ghost-${index}`, primitive: detected.primitive, params: { ...params }, position });
    commands.push({ type: "create-primitive", primitive: detected.primitive, params: { ...params }, position });
  }

  const command: CadCommand = commands.length === 1
    ? commands[0]
    : { type: "batch", label: `Copilot: ${count} ${detected.label.toLowerCase()}s`, commands };
  if (!validateCommand(command)) {
    return { ok: false, reason: `Parsed parameters are invalid for ${detected.label.toLowerCase()}. ${HINT}` };
  }
  return {
    ok: true,
    plan: {
      command,
      summary: ghosts.map((ghost) => ghost.kind === "primitive" ? describePrimitiveGhost(detected.label, ghost.params, ghost.position) : ""),
      ghosts,
    },
  };
}

function planProfile(
  detected: typeof DRAWING_KEYWORDS[number],
  normalized: string,
  plane: WorkPlaneId,
  distance: number | null,
): CopilotPlanResult {
  const count = parseCount(normalized);
  const spacing = parseSpacing(normalized);
  const pair = detected.drawing === "rectangle" ? parsePairDimensions(normalized) : null;
  const radius = detected.drawing === "circle" ? parseRadius(normalized) : null;
  const width = pair?.[0] ?? 100;
  const height = pair?.[1] ?? 60;
  if (detected.drawing === "circle" && !(radius && radius > 0)) {
    return { ok: false, reason: `Circle needs a radius (반지름/지름 N). ${HINT}` };
  }

  const ghosts: CopilotGhost[] = [];
  const commands: Exclude<CadCommand, { type: "batch" }>[] = [];
  const summary: string[] = [];
  for (let index = 0; index < count; index++) {
    const xOffset = index * spacing;
    const refPrefix = `copilot/${index}`;
    if (detected.drawing === "rectangle") {
      const { points, profile } = rectangleProfile(plane, width, height, xOffset, refPrefix);
      const drawingId = profileId();
      const params = { kind: "rectangle", workPlane: plane, points };
      ghosts.push({ kind: "drawing", key: `copilot-ghost-drawing-${index}`, drawing: "rectangle", params });
      summary.push(`Rectangle ${width}×${height} on ${plane} at X+${xOffset}`);
      commands.push({ type: "create-drawing", id: drawingId, drawing: "rectangle", params });
      if (distance !== null) {
        ghosts.push({ kind: "extrude", key: `copilot-ghost-extrude-${index}`, profile, distance });
        summary.push(`Extrude ${distance} mm from ${drawingId}`);
        commands.push({ type: "create-extrude", id: profileId(), profileObjectIds: [drawingId], distance });
      }
    } else {
      const { center, profile } = circleProfile(plane, radius!, xOffset, refPrefix);
      const drawingId = profileId();
      const params = { kind: "circle", workPlane: plane, center, radius: radius! };
      ghosts.push({ kind: "drawing", key: `copilot-ghost-drawing-${index}`, drawing: "circle", params });
      summary.push(`Circle r${radius} on ${plane} at X+${xOffset}`);
      commands.push({ type: "create-drawing", id: drawingId, drawing: "circle", params });
      if (distance !== null) {
        ghosts.push({ kind: "extrude", key: `copilot-ghost-extrude-${index}`, profile, distance });
        summary.push(`Extrude ${distance} mm from ${drawingId}`);
        commands.push({ type: "create-extrude", id: profileId(), profileObjectIds: [drawingId], distance });
      }
    }
  }

  const noun = distance !== null ? `${detected.label.toLowerCase()} extrude` : detected.label.toLowerCase();
  const command: CadCommand = commands.length === 1
    ? commands[0]
    : { type: "batch", label: `Copilot: ${count} ${noun}s`, commands };
  if (!validateCommand(command)) {
    return { ok: false, reason: `Parsed parameters are invalid for ${noun}. ${HINT}` };
  }
  return { ok: true, plan: { command, summary, ghosts } };
}

export function planCopilotCommand(input: string): CopilotPlanResult {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return { ok: false, reason: `Empty prompt. ${HINT}` };
  const primitive = detectPrimitive(normalized);
  const distance = parseExtrudeDistance(normalized);
  if (primitive) {
    // A solid primitive cannot be extruded; the extrude keyword with a solid
    // shape is a confused prompt, not a plannable intent.
    if (distance !== null) {
      return { ok: false, reason: `${primitive.label} is already a solid — describe a rectangle/circle profile to extrude. ${HINT}` };
    }
    return planPrimitive(primitive, normalized);
  }
  const drawing = detectDrawing(normalized);
  if (!drawing) {
    return { ok: false, reason: `No supported shape found (box/cylinder/sphere/cone/torus/rectangle/circle). ${HINT}` };
  }
  return planProfile(drawing, normalized, detectWorkPlane(normalized), distance);
}

export const ruleCopilotBackend: CopilotBackend = { plan: planCopilotCommand };

/**
 * Apply-time layer injection. Plans are layer-agnostic (preview needs no
 * layer); the active layer is bound at Apply so a plan stays valid while
 * the user switches layers between Preview and Apply.
 */
export function withCopilotLayer(command: CadCommand, layerId: string): CadCommand {
  const bind = (entry: CadCommand): CadCommand => {
    if (!("layerId" in entry) || (entry as { layerId?: string }).layerId === undefined) {
      return { ...entry, layerId } as CadCommand;
    }
    return entry;
  };
  if (command.type === "batch") {
    return { ...command, commands: command.commands.map((entry) => bind(entry) as Exclude<CadCommand, { type: "batch" }>) };
  }
  return bind(command);
}
