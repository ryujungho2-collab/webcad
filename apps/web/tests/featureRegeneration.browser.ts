import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { isDocumentCommandPending } from "../src/state/documentCommandQueue";
import { buildExtrudeMesh, cancelKernelTasks, meshPositionsBounds, subscribeKernelProgress } from "../src/cad/kernelGeometryService";
import { serializeDocument, deserializeDocument } from "../../../packages/cad-document/src/serialization";
import type { CadCommand } from "@agent-webcad/cad-commands";

const button = document.querySelector<HTMLButtonElement>("#run")!;
const output = document.querySelector<HTMLElement>("#result")!;
const fingerprint = () => { const { revision: _, ...state } = cadDocument; return JSON.stringify(state); };
button.onclick = async () => {
  button.disabled = true;
  const lines: string[] = [];
  const check = (value: unknown, label: string) => {
    if (!value) throw new Error(label);
    lines.push(`PASS: ${label}`); output.textContent = lines.join("\n");
  };
  const apply = async (command: CadCommand) => {
    const result = await dispatchCadCommand(command);
    if (!result.ok) throw new Error(result.reason);
    return result;
  };
  try {
    Object.assign(cadDocument, { id: "browser-regeneration", revision: 0, objects: {}, features: {}, sketches: {},
      layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: [] } }, rootObjects: [], rootLayers: ["layer-default"] });
    cadHistory.clear();
    await apply({ type: "create-sketch", id: "sketch", workPlane: "XY" });
    await apply({ type: "add-sketch-geometry", sketchId: "sketch", geometry: { id: "circle", kind: "circle", centerId: "center", curveId: "curve", center: [0, 0], radius: 10 } });
    await apply({ type: "add-sketch-constraint", sketchId: "sketch", constraint: { id: "radius", kind: "radius", geometryId: "circle", value: 10 } });
    await apply({ type: "create-extrude", id: "plate", profileObjectIds: ["circle"], distance: 5 });
    check(cadDocument.features["feature-plate"].dependencyMode === "live", "Sketch extrusion retains live sources through the Worker path");
    const before = fingerprint();
    let observations = 0, stayedAtomic = true;
    const unsubscribe = subscribeKernelProgress(progress => {
      if (progress) { observations++; stayedAtomic &&= fingerprint() === before; }
    });
    try { await apply({ type: "set-sketch-dimension", sketchId: "sketch", constraintId: "radius", value: 20 }); }
    finally { unsubscribe(); }
    const params = cadDocument.features["feature-plate"].params;
    const mesh = await buildExtrudeMesh(params);
    const bounds = meshPositionsBounds(mesh.positions)!;
    check(mesh.positions instanceof Float64Array && Math.abs(bounds.max[0] - 20) < 0.11, "Driving radius rebuilds the transferred solid mesh to 40 mm diameter");
    check(observations > 0 && stayedAtomic, "Live document remains unchanged during every Worker progress event");
    const after = fingerprint();
    check(undoDocument() && fingerprint() === before && redoDocument() && fingerprint() === after, "One Undo/Redo restores the full sketch and solid together");

    const cancelBefore = serializeDocument(cadDocument), history = JSON.stringify(cadHistory.getPastLabels());
    let cancelled = false;
    const stop = subscribeKernelProgress(progress => {
      if (!cancelled && progress?.phase === "building") { cancelled = true; cancelKernelTasks(); }
    });
    let rejected;
    try { rejected = await dispatchCadCommand({ type: "set-sketch-dimension", sketchId: "sketch", constraintId: "radius", value: 18.25 }); }
    finally { stop(); }
    check(cancelled && !rejected.ok && !rejected.changed && /cancelled/i.test(rejected.reason ?? ""), "Cancelling dependent geometry rejects the initiating command");
    check(serializeDocument(cadDocument) === cancelBefore && JSON.stringify(cadHistory.getPastLabels()) === history && !isDocumentCommandPending(), "Cancellation preserves the full document and history and releases the queue");
    await apply({ type: "set-sketch-dimension", sketchId: "sketch", constraintId: "radius", value: 18.5 });
    const recovered = meshPositionsBounds((await buildExtrudeMesh(cadDocument.features["feature-plate"].params)).positions)!;
    check(Math.abs(recovered.max[0] - 18.5) < 0.11, "A fresh Worker regenerates successfully after cancellation");

    Object.assign(cadDocument, deserializeDocument(serializeDocument(cadDocument)));
    await apply({ type: "set-sketch-dimension", sketchId: "sketch", constraintId: "radius", value: 12 });
    const reopened = cadDocument.features["feature-plate"].params.profile as { segments: { radius: number }[] };
    check(Math.abs(reopened.segments[0].radius - 12) < 1e-6, "Serialized live dependencies regenerate after reopening");
    output.textContent = `${lines.join("\n")}\n\nAll ${lines.length} checks passed.`;
  } catch (error) { output.textContent = [...lines, `FAIL: ${error instanceof Error ? error.message : String(error)}`].join("\n"); }
  finally { button.disabled = false; }
};
