import { cadDocument } from "../state/cadDocument";
import { useEffect, useState } from "react";
import { cancelKernelTasks, subscribeKernelProgress, type KernelTaskProgress } from "../cad/kernelGeometryService";
import type { KernelStatus } from "../cad/kernelGeometryService";
import type { WorkPlaneId } from "../precision/workPlane";
import type { PointMeasurement } from "../viewport/CadViewport";
import type { SnapPreferences } from "../precision/snapPreferences";
import {GeometryTaskStatus} from "./GeometryTaskStatus";
import {SaveStatus} from "./SaveStatus";
import { SnapSettings } from "./SnapSettings";

type StatusBarProps = {
  saveStatus?:string;fileStatus?:string;onSave:()=>void;onSaveAs:()=>void;
  selectedObjectId: string | null;
  selectedObjectIds?: string[];
  selectedLayerId: string;
  canUndo: boolean;
  isModified: boolean;
  gridVisible: boolean;
  kernelStatus: KernelStatus;
  snapEnabled: boolean;
  snapPreferences?: SnapPreferences;
  onSnapPreferencesChange?: (value: SnapPreferences) => void;
  orthoEnabled: boolean;
  activeWorkPlane: WorkPlaneId;
  distanceMeasurement?: PointMeasurement | null;
  workPlaneLocked: boolean;
  onCycleWorkPlane: () => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onToggleOrtho: () => void;
};

export function StatusBar({ saveStatus,fileStatus,onSave,onSaveAs,selectedObjectId, selectedObjectIds = selectedObjectId ? [selectedObjectId] : [], selectedLayerId, isModified, gridVisible, kernelStatus, snapEnabled, snapPreferences,onSnapPreferencesChange, orthoEnabled, activeWorkPlane, distanceMeasurement, workPlaneLocked, onCycleWorkPlane, onToggleGrid, onToggleSnap, onToggleOrtho }: StatusBarProps) {
  const [progress, setProgress] = useState<KernelTaskProgress | null>(null);
  useEffect(() => subscribeKernelProgress(setProgress), []);
  const selectedObject = selectedObjectId ? cadDocument.objects[selectedObjectId] : null;
  const activeLayer = cadDocument.layers[selectedLayerId];
  const blockedSelectionCount = selectedObjectIds.filter((id) => {
    const object = cadDocument.objects[id];
    const layer = object ? cadDocument.layers[object.layerId] : undefined;
    const feature = Object.values(cadDocument.features).find((entry) => entry.output === id);
    return Boolean(object && (!feature || !object.visible || layer?.visible === false || layer?.locked));
  }).length;

  return (
    <footer className="status-bar">
      <GeometryTaskStatus status={kernelStatus} progress={progress} onCancel={cancelKernelTasks}/>
      <span className="status-units" title="Document coordinate units: millimeters">mm</span>
      <div className="status-precision" role="group" aria-label="Drafting precision">
        <button type="button" aria-label={`Work plane ${activeWorkPlane}`} title={workPlaneLocked ? "Finish the active sketch to change its work plane" : "Cycle drawing work plane: XY / XZ / YZ"} disabled={workPlaneLocked} onClick={onCycleWorkPlane}>Plane <strong>{activeWorkPlane}</strong></button>
        <button type="button" aria-label="Grid" title="Toggle grid display · does not change snapping" aria-pressed={gridVisible} onClick={onToggleGrid}>Grid <strong>{gridVisible ? "ON" : "OFF"}</strong></button>
        <button type="button" aria-label="OSNAP" title="Toggle object and grid snapping (F3)" aria-pressed={snapEnabled} onClick={onToggleSnap}>OSNAP <strong>{snapEnabled ? "ON" : "OFF"}</strong></button>
        {snapPreferences&&onSnapPreferencesChange&&<SnapSettings value={snapPreferences} onChange={onSnapPreferencesChange}/>}
        <button type="button" aria-label="Ortho" title="Constrain to work-plane axes (F8)" aria-pressed={orthoEnabled} onClick={onToggleOrtho}>Ortho <strong>{orthoEnabled ? "ON" : "OFF"}</strong></button>
      </div>
      <span className="status-spacer" />
      {distanceMeasurement && <span className="status-measurement" title="Last two-point measurement">Distance <strong>{distanceMeasurement.distance.toFixed(2)} mm</strong> · {distanceMeasurement.angle.toFixed(1)}°</span>}
      <span className="status-object-count">{cadDocument.rootObjects.length} objects</span>
      <span className="status-layer" title={`Active layer: ${activeLayer?.name ?? "—"}`}>Layer <strong>{activeLayer?.name ?? "—"}{activeLayer?.locked ? " · Locked" : activeLayer?.visible === false ? " · Hidden" : ""}</strong></span>
      <span className={`status-selection${selectedObjectIds.length ? " has-selection" : ""}`} title={selectedObject ? `Primary: ${selectedObject.name} · ${selectedObject.id}${blockedSelectionCount ? ` · ${blockedSelectionCount} non-editable` : ""}` : "Click an object or drag a selection window"}>{selectedObjectIds.length > 1 ? <><strong>{selectedObjectIds.length} selected</strong><span> · {selectedObject?.name ?? "—"}</span></> : selectedObject ? selectedObject.name : "No selection"}</span>
      <SaveStatus local={saveStatus??(isModified?"Local changes pending":"Local save status unavailable")} file={fileStatus??"File download not started in this session"} onSave={onSave} onDownload={onSaveAs}/>
    </footer>
  );
}
