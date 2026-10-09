import type { CadCommand } from "@agent-webcad/cad-commands";
import type { CadDocument } from "@agent-webcad/cad-document";
import { getObjectTransform } from "../precision/objectTransform";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { WORK_PLANES, type Vec3, type WorkPlaneId } from "../precision/workPlane";

export type CopilotMoveContract = {
  command: "move-object"; maximumTargets: 1; units: "mm"; coordinates: "absolute-world-translation";
  limit: number; target?: { id: string; name: string; workPlane: WorkPlaneId; translation: Vec3 }; disabledReason?: string;
};
const LIMIT = 1e6;

/** Editing authorization comes from the captured edit selection, never a Query read target. */
export function copilotMoveContract(document: CadDocument, selection: string[], workPlane: string): CopilotMoveContract {
  const contract: CopilotMoveContract = { command: "move-object", maximumTargets: 1, units: "mm", coordinates: "absolute-world-translation", limit: LIMIT };
  const reject = (disabledReason: string) => ({ ...contract, disabledReason });
  if (selection.length !== 1) return reject("Select exactly one independent finite 2D drawing to Move. A read target does not grant edit selection.");
  const object = document.objects[selection[0]], features = Object.values(document.features).filter(f => f.output === selection[0]);
  if (!object || features.length !== 1) return reject("The selected drawing reference is missing or ambiguous. Select an existing drawing again.");
  const feature = features[0], layer = document.layers[object.layerId];
  if (!layer || layer.locked || !layer.visible || !object.visible) return reject("The selected target is locked or hidden. Unlock/show its layer and object, then select it again.");
  if (feature.type !== "drawing" || !["line", "polyline", "rectangle", "circle", "arc"].includes(String(feature.params.kind))) return reject("Move currently supports finite 2D drawings only. Use the object's manual editor for this representation.");
  if (feature.pattern || feature.construction || feature.params.sketchId || feature.inputs.length || !document.rootObjects.includes(object.id)) return reject("This drawing has an owner or source relationship. Edit Sketch, Construction, or Pattern instead of moving its generated member.");
  const world = getWorldDrawingGeometry(object, feature);
  if (!world?.planeAligned || !world.points?.length || !world.points.every(p => p.every(Number.isFinite)) || !world.uniformScale) return reject("This drawing has unsupported transformed geometry. Use manual editing and review its plane/scale.");
  if (world.workPlane !== workPlane) return reject(`Switch to the drawing's ${world.workPlane} work plane, then Plan again.`);
  const translation = getObjectTransform(object, feature).translation;
  if (!translation.every(v => Number.isFinite(v) && Math.abs(v) <= LIMIT)) return reject("The target placement exceeds the supported coordinate range. Correct it with manual editing.");
  return { ...contract, target: { id: object.id, name: object.name.slice(0, 200), workPlane: world.workPlane, translation: [...translation] } };
}

export function validateCopilotMove(command: Extract<CadCommand, { type: "move-object" }>, contract?: CopilotMoveContract): void {
  if (!contract?.target) throw new Error(contract?.disabledReason ?? "Move requires the captured edit selection. Select one supported drawing and Plan again.");
  if (command.objectId !== contract.target.id) throw new Error("Move targets an object outside the reviewed edit selection. Select the intended drawing and Plan again.");
  if (!command.translation.every(v => Number.isFinite(v) && Math.abs(v) <= contract.limit)) throw new Error("Move requires finite absolute world coordinates in mm within ±1000000. Correct the values and Plan again.");
  const normal = WORK_PLANES[contract.target.workPlane].normal;
  if (command.translation.some((v, i) => normal[i] !== 0 && v !== contract.target!.translation[i])) throw new Error("Move must stay on the drawing's work plane. Preserve its normal-axis translation and Plan again.");
  if (command.translation.every((v, i) => v === contract.target!.translation[i])) throw new Error("Move does not change the target. Enter a different in-plane translation and Plan again.");
}

/** Recheck ownership and target restrictions against the authoritative document at review/publication. */
export function validateCopilotEdit(command: CadCommand, document: CadDocument, selection: string[], workPlane: string) {
  if (command.type === "move-object") validateCopilotMove(command, copilotMoveContract(document, selection, workPlane));
}
