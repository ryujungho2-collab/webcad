import { cadDocument } from "../state/cadDocument";
import type { KernelStatus } from "../viewport/kernelGeometryService";

type StatusBarProps = {
  selectedObjectId: string | null;
  selectedLayerId: string;
  canUndo: boolean;
  isModified: boolean;
  gridVisible: boolean;
  kernelStatus: KernelStatus;
};

const kernelLabels: Record<KernelStatus, string> = {
  deferred: "Kernel deferred",
  loading: "Kernel loading",
  ready: "Kernel ready",
  working: "Kernel working",
  error: "Kernel error",
};

export function StatusBar({ selectedObjectId, selectedLayerId, canUndo, isModified, gridVisible, kernelStatus }: StatusBarProps) {
  const selectedObject = selectedObjectId ? cadDocument.objects[selectedObjectId] : null;
  const activeLayer = cadDocument.layers[selectedLayerId];

  return (
    <footer className="status-bar">
      <span className="status-ready"><i />Ready</span>
      <span title="Document coordinate units">mm</span>
        <span>Grid <strong>{gridVisible ? "ON" : "OFF"}</strong></span>
      <span>Snap <strong>OFF</strong></span>
      <span className="status-spacer" />
      <span>{cadDocument.rootObjects.length} object{cadDocument.rootObjects.length === 1 ? "" : "s"}</span>
      <span title="Active layer">Layer: <strong>{activeLayer?.name ?? "—"}{activeLayer?.locked ? " · Locked" : ""}</strong></span>
      <span className="status-selection" title={selectedObject?.id}>{selectedObject ? `Selected: ${selectedObject.name}` : "Nothing selected"}</span>
      <span title={canUndo ? "Undo history is available" : "No undo history"}>{isModified ? "Modified" : "Saved"}</span>
      <span className={`status-kernel status-kernel-${kernelStatus}`}>{kernelLabels[kernelStatus]}</span>
    </footer>
  );
}
