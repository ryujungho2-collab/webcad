import { cadDocument } from "../state/cadDocument";
import type { KernelStatus } from "../viewport/kernelGeometryService";
import type { WorkPlaneId } from "../precision/workPlane";
import type { PointMeasurement } from "../viewport/CadViewport";

type StatusBarProps = {
  selectedObjectId: string | null;
  selectedObjectIds?: string[];
  selectedLayerId: string;
  canUndo: boolean;
  isModified: boolean;
  gridVisible: boolean;
  kernelStatus: KernelStatus;
  snapEnabled: boolean;
  orthoEnabled: boolean;
  activeWorkPlane: WorkPlaneId;
  distanceMeasurement?: PointMeasurement | null;
};

const kernelLabels: Record<KernelStatus, string> = {
  deferred: "Kernel deferred",
  loading: "Kernel loading",
  ready: "Kernel ready",
  working: "Kernel working",
  error: "Kernel error",
};

export function StatusBar({ selectedObjectId, selectedObjectIds = selectedObjectId ? [selectedObjectId] : [], selectedLayerId, canUndo, isModified, gridVisible, kernelStatus, snapEnabled, orthoEnabled, activeWorkPlane, distanceMeasurement }: StatusBarProps) {
  const selectedObject = selectedObjectId ? cadDocument.objects[selectedObjectId] : null;
  const activeLayer = cadDocument.layers[selectedLayerId];

  return (
    <footer className="status-bar">
      <span className="status-ready"><i />Ready</span>
      <span title="Document coordinate units">mm</span>
      <span>Plane <strong>{activeWorkPlane}</strong></span>
      <span>Grid <strong>{gridVisible ? "ON" : "OFF"}</strong></span>
      <span title="Active object snap mode">OSNAP <strong>{snapEnabled ? "ON" : "OFF"}</strong></span>
      <span>Ortho <strong>{orthoEnabled ? "ON" : "OFF"}</strong></span>
      <span className="status-spacer" />
      {distanceMeasurement && <span title="Last two-point measurement">Distance: <strong>{distanceMeasurement.distance.toFixed(2)} mm</strong> · {distanceMeasurement.angle.toFixed(1)}°</span>}
      <span>{cadDocument.rootObjects.length} object{cadDocument.rootObjects.length === 1 ? "" : "s"}</span>
      <span title="Active layer">Layer: <strong>{activeLayer?.name ?? "—"}{activeLayer?.locked ? " · Locked" : ""}</strong></span>
      <span className="status-selection" title={selectedObject?.id}>{selectedObjectIds.length > 1 ? `${selectedObjectIds.length} objects selected` : selectedObject ? `Selected: ${selectedObject.name}` : "Nothing selected"}</span>
      <span title={canUndo ? "Undo history is available" : "No undo history"}>{isModified ? "Modified" : "Saved"}</span>
      <span className={`status-kernel status-kernel-${kernelStatus}`}>{kernelLabels[kernelStatus]}</span>
    </footer>
  );
}
