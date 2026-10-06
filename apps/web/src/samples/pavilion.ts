import type { CadCommand } from "@agent-webcad/cad-commands";

type BatchChildCommand = Exclude<CadCommand, { type: "batch" }>;

/**
 * Showcase pavilion identifiers. Explicit ids let one batch reference its
 * own creations (extrude profile, boolean tool) and let the UI select the
 * finished parts afterwards.
 */
export const PAVILION_PROFILE_ID = "pavilion-slab-profile";
export const PAVILION_SLAB_ID = "pavilion-slab";
export const PAVILION_COLUMN_IDS = [
  "pavilion-column-1",
  "pavilion-column-2",
  "pavilion-column-3",
  "pavilion-column-4",
] as const;
export const PAVILION_ROOF_ID = "pavilion-roof";
export const PAVILION_DOOR_TOOL_ID = "pavilion-door-tool";

/** Roof fillet radius: safely below half the 5 mm slab thickness. */
export const PAVILION_ROOF_FILLET_RADIUS = 1.5;

const SLAB_OUTLINE: [number, number, number][] = [
  [0, 0, 0],
  [120, 0, 0],
  [120, 80, 0],
  [0, 80, 0],
];
const COLUMN_POSITIONS: [number, number, number][] = [
  [12, 12, 6],
  [108, 12, 6],
  [12, 68, 6],
  [108, 68, 6],
];

/**
 * One atomic batch that draws a slab profile, extrudes it, raises four
 * columns and a roof, then cuts a doorway notch. Every step uses only
 * existing commands; a kernel rejection anywhere rolls the whole batch
 * back, so a pavilion either appears complete or not at all.
 */
export function buildPavilionBatch(layerId: string): CadCommand {
  const commands: BatchChildCommand[] = [
    {
      type: "create-drawing",
      id: PAVILION_PROFILE_ID,
      drawing: "rectangle",
      params: { kind: "rectangle", workPlane: "XY", points: SLAB_OUTLINE },
      layerId,
    },
    {
      type: "create-extrude",
      id: PAVILION_SLAB_ID,
      profileObjectIds: [PAVILION_PROFILE_ID],
      distance: 6,
      layerId,
    },
    ...PAVILION_COLUMN_IDS.map(
      (id, index): BatchChildCommand => ({
        type: "create-primitive",
        id,
        primitive: "cylinder",
        params: { radius: 3, height: 40 },
        position: COLUMN_POSITIONS[index],
        layerId,
      }),
    ),
    {
      type: "create-primitive",
      id: PAVILION_ROOF_ID,
      primitive: "box",
      params: { width: 132, depth: 92, height: 5 },
      position: [-6, -6, 46],
      layerId,
    },
    {
      type: "create-primitive",
      id: PAVILION_DOOR_TOOL_ID,
      primitive: "box",
      params: { width: 16, depth: 10, height: 8 },
      position: [52, -2, 0],
      layerId,
    },
    {
      type: "boolean-operation",
      operation: "cut",
      target: PAVILION_SLAB_ID,
      tool: PAVILION_DOOR_TOOL_ID,
    },
  ];
  return { type: "batch", label: "Insert pavilion", commands };
}
