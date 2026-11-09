import type { CadCommand } from "@agent-webcad/cad-commands";
import type { CopilotPlan } from "./copilotPlan";

export type MountingPlateSpec = { width: number; depth: number; thickness: number; margin: number; holeDiameter: number };
export const PLATE_FIELDS = ["width", "depth", "thickness", "margin", "holeDiameter"] as const;

export function validateMountingPlate(spec: MountingPlateSpec) {
  if (!PLATE_FIELDS.every(key => Number.isFinite(spec[key]) && spec[key] >= 0.01 && spec[key] <= 10000))
    throw new Error("Plate dimensions must be between 0.01 and 10000 mm.");
  const { width, depth, margin, holeDiameter } = spec;
  if (holeDiameter >= 2 * margin || 2 * margin + holeDiameter >= Math.min(width, depth))
    throw new Error("The four holes must fit inside the plate without touching each other or its edges. Reduce the diameter/margin or increase the plate size.");
}

/** A recipe expands to ordinary sketch, binding and extrusion commands: no second model format. */
export function mountingPlatePlan(spec: MountingPlateSpec): CopilotPlan {
  validateMountingPlate(spec);
  const token = crypto.randomUUID().replaceAll("-", "");
  const prefix = `plate_${token}`, sketchId = `${prefix}_sketch`, solidId = `${prefix}_solid`, outline = `${prefix}_outline`;
  const variable = (key: keyof MountingPlateSpec) => `${prefix}_${key}`;
  const commands: Exclude<CadCommand, { type: "batch" }>[] = [
    { type: "create-sketch", id: sketchId, workPlane: "XY" },
    { type: "add-sketch-geometry", sketchId, geometry: { id: outline, kind: "rectangle", origin: [0, 0], width: spec.width, height: spec.depth, cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"] }, constraints: [
      { id: "origin", kind: "fixed-point", point: { geometryId: outline, pointId: "a" }, value: [0, 0] },
      { id: "width", kind: "distance", first: { geometryId: outline, pointId: "a" }, second: { geometryId: outline, pointId: "b" }, value: spec.width },
      { id: "depth", kind: "distance", first: { geometryId: outline, pointId: "b" }, second: { geometryId: outline, pointId: "c" }, value: spec.depth },
    ] },
  ];
  const holes: string[] = [];
  for (let i = 0; i < 4; i++) {
    const id = `${prefix}_hole${i}`, x = i % 2 ? spec.width - spec.margin : spec.margin, y = i >= 2 ? spec.depth - spec.margin : spec.margin;
    holes.push(id);
    commands.push({ type: "add-sketch-geometry", sketchId, geometry: { id, kind: "circle", center: [x, y], radius: spec.holeDiameter / 2, centerId: "center", curveId: "curve" }, constraints: [
      { id: `center${i}`, kind: "fixed-point", point: { geometryId: id, pointId: "center" }, value: [x, y] },
      { id: `diameter${i}`, kind: "diameter", geometryId: id, value: spec.holeDiameter },
    ] });
  }
  for (const key of PLATE_FIELDS) commands.push({ type: "set-variable", name: variable(key), quantity: "length", expression: `${spec[key]}mm` });
  const bind = (constraintId: string, expression: string, component?: "x" | "y") => commands.push({ type: "set-parameter-binding", target: { kind: "sketch-constraint", sketchId, constraintId, ...component ? { component } : {} }, expression });
  bind("width", variable("width")); bind("depth", variable("depth"));
  for (let i = 0; i < 4; i++) {
    bind(`center${i}`, i % 2 ? `${variable("width")} - ${variable("margin")}` : variable("margin"), "x");
    bind(`center${i}`, i >= 2 ? `${variable("depth")} - ${variable("margin")}` : variable("margin"), "y");
    bind(`diameter${i}`, variable("holeDiameter"));
  }
  commands.push({ type: "create-extrude", id: solidId, profileObjectIds: [outline, ...holes], distance: spec.thickness });
  commands.push({ type: "set-parameter-binding", target: { kind: "feature", objectId: solidId, parameter: "distance" }, expression: variable("thickness") });
  return {
    command: { type: "batch", label: "Copilot: four-hole mounting plate", commands },
    summary: [`Plate ${spec.width} × ${spec.depth} × ${spec.thickness} mm on XY, origin at the lower-left corner, thickness along +Z.`, `Four through holes Ø${spec.holeDiameter} mm, centers ${spec.margin} mm from both adjacent edges. Width/depth edits retain these margins.`],
    ghosts: [], resultObjectIds: [solidId],
  };
}
