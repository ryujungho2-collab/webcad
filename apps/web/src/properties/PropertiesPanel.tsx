
import { useEffect, useRef, useState } from "react";
import { cadDocument } from "../state/cadDocument";
import { dispatchCadCommand } from "../state/dispatchCadCommand";
import { getObjectTransform } from "../state/objectTransform";
import { planBulkTransformEdit } from "../state/selectionCommands";
import { NumericField } from "../ui/NumericField";
import { validateBooleanOperation } from "../cad/kernelGeometryService";
import { measureDrawing } from "../precision/measurements";
import { formatLength } from "../precision/units";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { describeSubObject } from "../viewport/subObjectMeasure";
import type { CornerPreviewRequest } from "../viewport/cornerPreview";
import type { TopologySelectionRef } from "../state/selection";
import { extractSketchLoops } from "../precision/sketchProfiles";
import { getObjectWorldTransformPivot } from "../precision/worldBounds";

type PropertiesPanelProps = {
  documentRevision: number;
  selectedObjectId: string | null;
  selectedObjectIds?: string[];
  isolationActive?: boolean;
  selectedSubObjects?: TopologySelectionRef[];
  selectedLayerId: string;
  onDocumentChange: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onHide: () => void;
  onIsolate: () => void;
  onShowAll: () => void;
  onBooleanCreated: (objectId: string) => void;
  offsetDistance?: string;
  onOffsetDistanceChange?: (value: string) => void;
  offsetSide?: "left" | "right";
  onOffsetSideChange?: (value: "left" | "right") => void;
  offsetActive?: boolean;
  onOffsetStart?: () => void;
  onOffsetCancel?: () => void;
  onCornerPreview?: (preview: CornerPreviewRequest | null) => void;
};

type PrimitiveDraft = Record<string, string>;

type TransformDraft = {
  x: string;
  y: string;
  z: string;
  rx: string;
  ry: string;
  rz: string;
  sx: string;
  sy: string;
  sz: string;
};

const primitiveFields: Record<string, { key: string; label: string }[]> = {
  box: [{ key: "width", label: "Width" }, { key: "depth", label: "Depth" }, { key: "height", label: "Height" }],
  cylinder: [{ key: "radius", label: "Radius" }, { key: "height", label: "Height" }],
  sphere: [{ key: "radius", label: "Radius" }],
  cone: [{ key: "radius1", label: "Base radius" }, { key: "radius2", label: "Top radius" }, { key: "height", label: "Height" }],
  torus: [{ key: "majorRadius", label: "Major radius" }, { key: "minorRadius", label: "Tube radius" }],
};
const emptyTransformDraft: TransformDraft = {
  x: "", y: "", z: "", rx: "", ry: "", rz: "", sx: "", sy: "", sz: "",
};
const transformEpsilon = 1e-9;
const changedVector = (next: [number, number, number], current: [number, number, number]) =>
  next.some((value, index) => Math.abs(value - current[index]) > transformEpsilon);

export function PropertiesPanel({
  documentRevision,
  selectedObjectId,
  selectedObjectIds = selectedObjectId ? [selectedObjectId] : [],
  isolationActive = false,
  selectedSubObjects = [],
  selectedLayerId,
  onDocumentChange,
  onDuplicate,
  onDelete,
  onHide,
  onIsolate,
  onShowAll,
  onBooleanCreated,
  offsetDistance: offsetDistanceProp,
  onOffsetDistanceChange,
  offsetSide = "left",
  onOffsetSideChange,
  offsetActive = false,
  onOffsetStart,
  onOffsetCancel,
  onCornerPreview,
}: PropertiesPanelProps) {
  const object = selectedObjectId ? cadDocument.objects[selectedObjectId] : null;
  const selectedObjects = selectedObjectIds.map((id) => cadDocument.objects[id]).filter(Boolean);
  const selectedTransforms = selectedObjects.map((entry) => {
    const f = Object.values(cadDocument.features).find((candidate) => candidate.output === entry.id);
    return getObjectTransform(entry, f);
  });
  const selectedPositions = selectedObjects.map((entry, index) =>
    getObjectWorldTransformPivot(cadDocument, entry.id) ?? selectedTransforms[index].translation
  );
  const mixed = (values: number[]) => values.length > 1 && values.some((value) => Math.abs(value - values[0]) > 1e-9);
  const mixedLayer = selectedObjects.length > 1 && selectedObjects.some((entry) => entry.layerId !== selectedObjects[0].layerId);
  const mixedVisible = selectedObjects.length > 1 && selectedObjects.some((entry) => entry.visible !== selectedObjects[0].visible);
  const feature = object
    ? Object.values(cadDocument.features).find((entry) => entry.output === object.id)
    : undefined;
  const isPrimitive = feature?.type === "primitive";
  const isDrawing = feature?.type === "drawing";
  const isExtrude = feature?.type === "extrude";
  const profileResult = extractSketchLoops(cadDocument, selectedObjectIds);
  const hasEmbeddedArcs = isDrawing && Array.isArray(feature.params.bulges) && feature.params.bulges.some((value) => Math.abs(Number(value)) > 1e-9);
  const drawingMeasurements = isDrawing && object && feature
    ? (() => {
      const world = getWorldDrawingGeometry(object, feature);
      if (!world) return {};
      return measureDrawing({ kind: world.kind, workPlane: world.workPlane, points: world.points, center: world.center, radius: world.radius, startAngle: world.startAngle, endAngle: world.endAngle, closed: world.closed, profileSegments: world.profileSegments });
    })()
    : {};
  const primitiveKind = isPrimitive && typeof feature.params.kind === "string" ? feature.params.kind : "box";
  const selectedPrimitiveKinds = selectedObjects.map((entry) => {
    const candidate = Object.values(cadDocument.features).find((item) => item.output === entry.id);
    return candidate?.type === "primitive" && typeof candidate.params.kind === "string" ? candidate.params.kind : null;
  });
  const multiPrimitiveKind = selectedObjects.length > 1 && selectedPrimitiveKinds.every((kind) => kind !== null && kind === selectedPrimitiveKinds[0])
    ? (selectedPrimitiveKinds[0] as string)
    : null;
  const effectivePrimitiveKind = multiPrimitiveKind ?? primitiveKind;
  const fields = primitiveFields[effectivePrimitiveKind] ?? primitiveFields.box;
  const primitiveFieldMixed = (key: string) => {
    if (!multiPrimitiveKind) return false;
    const values = selectedObjects.map((entry) => {
      const candidate = Object.values(cadDocument.features).find((item) => item.output === entry.id);
      return candidate?.type === "primitive" ? Number(candidate.params[key]) : Number.NaN;
    });
    return values.length > 1 && values.some((value) => value !== values[0]);
  };
  const objectLayer = object ? cadDocument.layers[object.layerId] : undefined;
  const isLocked = objectLayer?.locked ?? false;
  const allSelectedEditable = selectedObjects.length > 0 && selectedObjects.every((entry) => {
    const layer = cadDocument.layers[entry.layerId];
    return Boolean(entry.visible && layer?.visible && !layer.locked);
  });
  // Single selection keeps the exact legacy behavior (primary layer lock).
  // Multi-selection edits are all-or-nothing batches, so disable them unless
  // every member is editable.
  const bulkEditDisabled = selectedObjects.length > 1 ? !allSelectedEditable : isLocked;
  const [name, setName] = useState("");
  const [primitiveDraft, setPrimitiveDraft] = useState<PrimitiveDraft>({});
  const [extrudeDistance, setExtrudeDistance] = useState("10");
  const [booleanToolId, setBooleanToolId] = useState("");
  const [booleanError, setBooleanError] = useState("");
  const [transformDraft, setTransformDraft] = useState<TransformDraft>(emptyTransformDraft);
  const [offsetDistanceLocal, setOffsetDistanceLocal] = useState("10");
  const [cornerDistance, setCornerDistance] = useState("5");
  const [previewTreatment, setPreviewTreatment] = useState<"fillet" | "chamfer" | null>(null);
  const offsetDistance = offsetDistanceProp ?? offsetDistanceLocal;
  const setOffsetDistance = (value: string) => { setOffsetDistanceLocal(value); onOffsetDistanceChange?.(value); };
  const visibilityInputRef = useRef<HTMLInputElement>(null);
  const allVisible = selectedObjects.length > 0 && selectedObjects.every((entry) => entry.visible);

  useEffect(() => {
    if (visibilityInputRef.current) visibilityInputRef.current.indeterminate = mixedVisible;
  }, [mixedVisible]);

  useEffect(() => {
    const subObject = selectedSubObjects[0];
    const canPreview = Boolean(
      object && !isLocked && previewTreatment && selectedObjects.length === 1 && selectedSubObjects.length === 1 &&
      subObject?.kind === "drawing-control" && subObject.objectId === object.id,
    );
    if (!canPreview || !object || !subObject || !previewTreatment) {
      onCornerPreview?.(null);
      return;
    }
    const distance = Number(cornerDistance);
    if (!Number.isFinite(distance) || distance <= 1e-9) {
      onCornerPreview?.(null);
      return;
    }
    onCornerPreview?.({ objectId: object.id, controlId: subObject.topologyId, treatment: previewTreatment, distance });
    return () => onCornerPreview?.(null);
  }, [object, isLocked, previewTreatment, selectedObjects.length, selectedSubObjects, cornerDistance, onCornerPreview]);

  useEffect(() => {
    setName(object?.name ?? "");
    if (object) {
      const transform = getObjectTransform(object, feature);
      const transformValues = {
        x: mixed(selectedPositions.map((position) => position[0])),
        y: mixed(selectedPositions.map((position) => position[1])),
        z: mixed(selectedPositions.map((position) => position[2])),
        rx: mixed(selectedTransforms.map((t) => t.rotation[0])),
        ry: mixed(selectedTransforms.map((t) => t.rotation[1])),
        rz: mixed(selectedTransforms.map((t) => t.rotation[2])),
        sx: mixed(selectedTransforms.map((t) => t.scale[0])),
        sy: mixed(selectedTransforms.map((t) => t.scale[1])),
        sz: mixed(selectedTransforms.map((t) => t.scale[2])),
      };
      setTransformDraft({
        x: transformValues.x ? "Mixed" : String(getObjectWorldTransformPivot(cadDocument, object.id)?.[0] ?? transform.translation[0]),
        y: transformValues.y ? "Mixed" : String(getObjectWorldTransformPivot(cadDocument, object.id)?.[1] ?? transform.translation[1]),
        z: transformValues.z ? "Mixed" : String(getObjectWorldTransformPivot(cadDocument, object.id)?.[2] ?? transform.translation[2]),
        rx: transformValues.rx ? "Mixed" : String(transform.rotation[0]),
        ry: transformValues.ry ? "Mixed" : String(transform.rotation[1]),
        rz: transformValues.rz ? "Mixed" : String(transform.rotation[2]),
        sx: transformValues.sx ? "Mixed" : String(transform.scale[0]),
        sy: transformValues.sy ? "Mixed" : String(transform.scale[1]),
        sz: transformValues.sz ? "Mixed" : String(transform.scale[2]),
      });
    } else {
      setTransformDraft(emptyTransformDraft);
    }
    if (multiPrimitiveKind) {
      const next: PrimitiveDraft = {};
      for (const { key } of fields) {
        const values = selectedObjects.map((entry) => {
          const candidate = Object.values(cadDocument.features).find((item) => item.output === entry.id);
          return candidate?.type === "primitive" ? candidate.params[key] : undefined;
        });
        next[key] = values.every((value) => String(value) === String(values[0])) ? String(values[0] ?? "") : "Mixed";
      }
      setPrimitiveDraft(next);
      setBooleanToolId("");
      return;
    }
    if (!feature || feature.type !== "primitive") {
      setPrimitiveDraft({});
      return;
    }
    setPrimitiveDraft(Object.fromEntries(Object.entries(feature.params).filter(([key]) => key !== "kind").map(([key, value]) => [key, String(value)])));
    setBooleanToolId("");
  }, [selectedObjectId, selectedObjectIds.join("\0"), documentRevision]);

  useEffect(() => {
    setExtrudeDistance(isExtrude ? String(feature.params.distance) : "10");
  }, [selectedObjectId, documentRevision, isExtrude]);

  async function commitName() {
    if (!object || isLocked) return;
    if (!name.trim()) {
      setName(object.name);
      return;
    }
    if (name.trim() === object.name) return;
    await dispatchCadCommand({ type: "rename-object", objectId: object.id, name });
    onDocumentChange();
  }

  async function commitPrimitive() {
    if (multiPrimitiveKind) {
      const allEditable = selectedObjects.every((entry) => {
        const layer = cadDocument.layers[entry.layerId];
        return Boolean(entry.visible && layer?.visible && !layer.locked);
      });
      if (!allEditable) return;
      const edited: Record<string, number> = {};
      for (const { key } of fields) {
        const draft = primitiveDraft[key];
        if (draft === undefined || draft === "Mixed" || draft.trim() === "") continue;
        const value = Number(draft);
        if (!Number.isFinite(value) || value <= 0) return;
        edited[key] = value;
      }
      if (Object.keys(edited).length === 0) return;
      const commands: Array<{ type: "update-primitive"; objectId: string; params: Record<string, number> }> = [];
      for (const entry of selectedObjects) {
        const candidate = Object.values(cadDocument.features).find((item) => item.output === entry.id);
        if (!candidate || candidate.type !== "primitive") return;
        const current = Object.fromEntries(Object.entries(candidate.params).filter(([key]) => key !== "kind")) as Record<string, number>;
        const params: Record<string, number> = { ...current, ...edited };
        const numeric = Object.fromEntries(fields.map(({ key }) => [key, Number(params[key])]));
        if (Object.values(numeric).some((value) => !Number.isFinite(value) || (value as number) <= 0)) return;
        if (multiPrimitiveKind === "torus" && numeric.majorRadius <= numeric.minorRadius) return;
        if (JSON.stringify(current) === JSON.stringify(params)) continue;
        commands.push({ type: "update-primitive", objectId: entry.id, params });
      }
      if (commands.length) await dispatchCadCommand(commands.length === 1 ? commands[0] : { type: "batch", label: `Edit ${commands.length} primitives`, commands });
      onDocumentChange();
      return;
    }
    if (!object || !isPrimitive || isLocked) return;
    const params = Object.fromEntries(fields.map(({ key }) => [key, Number(primitiveDraft[key])]));
    if (Object.values(params).some((value) => !Number.isFinite(value) || value <= 0) || (primitiveKind === "torus" && params.majorRadius <= params.minorRadius)) {
      setPrimitiveDraft(Object.fromEntries(Object.entries(feature.params).filter(([key]) => key !== "kind").map(([key, value]) => [key, String(value)])));
      return;
    }
    await dispatchCadCommand({ type: "update-primitive", objectId: object.id, params });
    onDocumentChange();
  }

  async function runBoolean(operation: "union" | "cut" | "intersect") {
    if (!object || !feature || !isPrimitive || isLocked || !booleanToolId) return;
    const tool = cadDocument.objects[booleanToolId];
    const toolFeature = tool && Object.values(cadDocument.features).find((entry) => entry.output === tool.id);
    if (!tool || !toolFeature || toolFeature.type !== "primitive") return;
    const params = { operation, operands: [
      { params: structuredClone(feature.params), transform: structuredClone(getObjectTransform(object, feature)) },
      { params: structuredClone(toolFeature.params), transform: structuredClone(getObjectTransform(tool, toolFeature)) },
    ] };
    try {
      setBooleanError("");
      await validateBooleanOperation(params);
    } catch {
      setBooleanError("The selected solids do not produce a valid boolean result.");
      return;
    }
    const id = await dispatchCadCommand({ type: "boolean-operation", operation, target: object.id, tool: booleanToolId });
    if (typeof id === "string") { onBooleanCreated(id); onDocumentChange(); }
  }

  async function commitTransform(kind: "move" | "rotate" | "scale") {
    if (!object || isLocked) return;
    const allEditable = selectedObjects.every((entry) => {
      const layer = cadDocument.layers[entry.layerId];
      return Boolean(entry.visible && layer?.visible && !layer.locked);
    });
    if (!allEditable) return;
    const keys = kind === "move"
      ? ["x", "y", "z"] as const
      : kind === "rotate"
        ? ["rx", "ry", "rz"] as const
        : ["sx", "sy", "sz"] as const;
    const values = keys.map((key) => {
      const draft = transformDraft[key];
      if (draft === "Mixed" || draft.trim() === "") return null;
      const value = Number(draft);
      return Number.isFinite(value) ? value : Number.NaN;
    }) as [number | null, number | null, number | null];
    const commands = planBulkTransformEdit(
      cadDocument,
      selectedObjects.map((entry) => entry.id),
      kind === "move" ? "translate" : kind,
      values,
    );
    if (!commands) return;
    if (commands.length) await dispatchCadCommand(selectedObjects.length > 1 ? {
      type: "batch",
      label: `${kind === "move" ? "Move" : kind === "rotate" ? "Rotate" : "Scale"} selection`,
      commands,
    } : commands[0]);
    onDocumentChange();
  }

  async function changeLayer(layerId: string) {
    if (!object || isLocked || selectedObjects.some((entry) => {
      const layer = cadDocument.layers[entry.layerId];
      return !entry.visible || !layer?.visible || Boolean(layer.locked);
    })) return;
    const commands = selectedObjects.filter((entry) => entry.layerId !== layerId).map((entry) => ({ type: "move-object-to-layer" as const, objectId: entry.id, layerId }));
    if (commands.length) await dispatchCadCommand({ type: "batch", label: `Move ${commands.length} objects to layer`, commands });
    onDocumentChange();
  }

  async function setVisibility(visible: boolean) {
    if (!object || selectedObjects.some((entry) => {
      const layer = cadDocument.layers[entry.layerId];
      return Boolean(layer?.locked);
    })) return;
    const commands = selectedObjects.filter((entry) => entry.visible !== visible).map((entry) => ({ type: "set-object-visible" as const, objectId: entry.id, visible }));
    if (commands.length) await dispatchCadCommand({ type: "batch", label: `${visible ? "Show" : "Hide"} ${commands.length} objects`, commands });
    onDocumentChange();
  }

  async function commitOffset() {
    if (!object || !isDrawing || isLocked || hasEmbeddedArcs || selectedObjects.length !== 1) return;
    const distance = Number(offsetDistance);
    if (!Number.isFinite(distance) || distance <= 1e-9) return;
    const id = await dispatchCadCommand({ type: "offset-drawing", objectId: object.id, distance, side: offsetSide });
    if (typeof id === "string") {
      onOffsetCancel?.();
      onBooleanCreated(id);
    }
    onDocumentChange();
  }

  async function commitCornerTreatment(treatment: "fillet" | "chamfer") {
    if (!object || !feature || feature.type !== "drawing" || isLocked || selectedObjects.length !== 1 || selectedSubObjects.length !== 1) return;
    const selected = selectedSubObjects[0];
    if (selected.objectId !== object.id || selected.kind !== "drawing-control") return;
    const distance = Number(cornerDistance);
    if (!Number.isFinite(distance) || distance <= 1e-9) return;
    await dispatchCadCommand({ type: "edit-drawing-corner", objectId: object.id, controlId: selected.topologyId, treatment, distance });
    onDocumentChange();
  }

  async function closeProfile() {
    if (!object || !feature || feature.type !== "drawing" || isLocked || selectedObjects.length !== 1) return;
    await dispatchCadCommand({ type: "close-drawing-profile", objectId: object.id });
    onDocumentChange();
  }

  async function commitExtrude() {
    const distance = Number(extrudeDistance);
    if (!Number.isFinite(distance) || Math.abs(distance) <= 1e-9) return;
    if (isExtrude && object) {
      await dispatchCadCommand({ type: "update-extrude", objectId: object.id, distance });
      onDocumentChange();
      return;
    }
    if (!profileResult.ok) return;
    const id = await dispatchCadCommand({ type: "create-extrude", profileObjectIds: selectedObjectIds, distance, layerId: selectedLayerId });
    if (typeof id === "string") onBooleanCreated(id);
    onDocumentChange();
  }

  if (!object) {
    const activeLayer = cadDocument.layers[selectedLayerId];
    return (
      <div className="properties-content">
        <div className="inspector-header"><span>Properties</span><small>No selection</small></div>
        <div className="inspector-empty">
          <div className="inspector-empty-icon">◇</div>
          <strong>Select model geometry</strong>
          <span>Pick an object in the viewport or Explorer to edit its parameters.</span>
        </div>
        <section className="property-section">
          <h3>Document</h3>
          <div className="property-row"><span>Objects</span><strong>{cadDocument.rootObjects.length}</strong></div>
          <div className="property-row"><span>Layers</span><strong>{cadDocument.rootLayers.length}</strong></div>
          <div className="property-row"><span>Active layer</span><strong>{activeLayer?.name ?? "—"}</strong></div>
        </section>
      </div>
    );
  }

  return (
    <div className="properties-content">
      <div className="inspector-header"><span>Properties</span><small>{selectedObjects.length > 1 ? `${selectedObjects.length} selected` : isLocked ? "Locked layer" : isPrimitive ? primitiveKind : isDrawing ? String(feature.params.kind) : isExtrude ? "Extrude" : feature?.type === "boolean" ? "Boolean result" : "BRep body"}</small></div>

      {isLocked && <div className="inspector-notice">Unlock <strong>{objectLayer?.name}</strong> in Layers to edit this object.</div>}

      <section className="property-section">
        <h3>Identity</h3>
        {selectedObjects.length === 1 ? <>
          <label className="property-row"><span>Name</span><input disabled={isLocked} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => void commitName()} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></label>
          <div className="property-row"><span>Type</span><strong>{isPrimitive ? `Primitive / ${primitiveKind[0].toUpperCase()}${primitiveKind.slice(1)}` : isDrawing ? `Drawing / ${String(feature.params.kind)}` : isExtrude ? "Feature / Extrude" : feature?.type === "boolean" ? "Feature / Boolean" : "BRep body"}</strong></div>
          <div className="property-row" title={object.id}><span>ID</span><code>{object.id}</code></div>
        </> : <>
          <div className="property-row"><span>Selection</span><strong>{selectedObjects.length} objects</strong></div>
          <div className="property-row"><span>Primary</span><strong>{object.name}</strong></div>
        </>}
      </section>

      {selectedSubObjects.length > 0 && (
        <section className="property-section">
          <h3>Direct selection <small>{selectedSubObjects.length}</small></h3>
          {selectedSubObjects.map((entry) => {
            const measure = describeSubObject(cadDocument, entry);
            return (
              <div key={`${entry.objectId}:${entry.kind}:${entry.topologyId}`}>
                <div className="property-row"><span>{entry.kind === "drawing-control" ? "Vertex" : entry.kind === "drawing-segment" ? "Segment" : entry.kind === "drawing-curve" ? "Curve" : entry.kind}</span><code>{entry.topologyId}</code></div>
                {measure?.rows.map((row) => <div className="property-row" key={row.label}><span>{measure.title} {row.label}</span><strong>{row.value}</strong></div>)}
              </div>
            );
          })}
          {isDrawing && selectedObjects.length === 1 && selectedSubObjects.length === 1 && selectedSubObjects[0].kind === "drawing-control" && ["polyline", "rectangle"].includes(String(feature.params.kind)) && <>
            <NumericField label="Corner" context="Corner treatment" unit="mm" disabled={isLocked} min="0.001" step="0.1" value={cornerDistance} onChange={setCornerDistance} />
            <div className="property-actions">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => void commitCornerTreatment("fillet")}
                onMouseEnter={() => setPreviewTreatment("fillet")}
                onMouseLeave={() => setPreviewTreatment(null)}
                onFocus={() => setPreviewTreatment("fillet")}
                onBlur={() => setPreviewTreatment(null)}
              >Fillet</button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => void commitCornerTreatment("chamfer")}
                onMouseEnter={() => setPreviewTreatment("chamfer")}
                onMouseLeave={() => setPreviewTreatment(null)}
                onFocus={() => setPreviewTreatment("chamfer")}
                onBlur={() => setPreviewTreatment(null)}
              >Chamfer</button>
            </div>
            <p className="property-hint">Applies an exact radius or equal-distance setback to the selected straight corner. Hover a button to preview.</p>
          </>}
        </section>
      )}

      <section className="property-section">
        <h3>General</h3>
        <label className="property-row"><span>Layer</span><select disabled={bulkEditDisabled} value={mixedLayer ? "__mixed__" : object.layerId} onChange={(event) => void changeLayer(event.target.value)}><option value="__mixed__" disabled>Mixed</option>{cadDocument.rootLayers.map((layerId) => {
          const layer = cadDocument.layers[layerId];
          return layer && <option key={layer.id} value={layer.id} disabled={layer.locked && layer.id !== object.layerId}>{layer.name}{layer.locked ? " (locked)" : ""}</option>;
        })}</select></label>
        <label className="property-row"><span>Visible</span><input ref={visibilityInputRef} className={mixedVisible ? "property-toggle property-toggle-mixed" : "property-toggle"} type="checkbox" disabled={bulkEditDisabled} checked={allVisible} onChange={(event) => void setVisibility(event.target.checked)} /></label>
      </section>

      {((isPrimitive && selectedObjects.length === 1) || multiPrimitiveKind) && (
        <>
          <section className="property-section">
            <h3>Dimensions <small>mm{multiPrimitiveKind ? ` · ${selectedObjects.length} × ${multiPrimitiveKind}` : ""}</small></h3>
            {fields.map(({ key, label }) => (
              <NumericField key={key} label={label} context="Dimensions" unit="mm" disabled={bulkEditDisabled} min="0.001" step="0.1" mixed={primitiveFieldMixed(key)} value={primitiveDraft[key] ?? ""} onChange={(value) => setPrimitiveDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitPrimitive()} />
            ))}
            {multiPrimitiveKind && <p className="property-hint">Mixed fields keep each object&apos;s value. Type a value to apply it to all {selectedObjects.length} objects.</p>}
          </section>
        </>
      )}

      {isDrawing && selectedObjects.length === 1 && (
        <section className="property-section">
          <h3>Geometry <small>{String(feature.params.workPlane ?? "XY")} plane</small></h3>
          {drawingMeasurements.distance !== undefined && <div className="property-row"><span>{feature.params.kind === "arc" ? "Arc length" : feature.params.kind === "rectangle" || drawingMeasurements.area !== undefined && feature.params.kind === "polyline" ? "Perimeter" : "Length"}</span><strong>{formatLength(drawingMeasurements.distance, "mm", 2)}</strong></div>}
          {drawingMeasurements.angle !== undefined && <div className="property-row"><span>Angle</span><strong>{(drawingMeasurements.angle * 180 / Math.PI).toFixed(2)} °</strong></div>}
          {drawingMeasurements.radius !== undefined && <div className="property-row"><span>Radius</span><strong>{formatLength(drawingMeasurements.radius, "mm", 2)}</strong></div>}
          {drawingMeasurements.diameter !== undefined && <div className="property-row"><span>Diameter</span><strong>{formatLength(drawingMeasurements.diameter, "mm", 2)}</strong></div>}
          {drawingMeasurements.area !== undefined && <div className="property-row"><span>Area</span><strong>{drawingMeasurements.area.toFixed(2)} mm²</strong></div>}
          {feature.params.kind === "polyline" && feature.params.closed !== true && <div className="property-actions"><button type="button" disabled={isLocked} onClick={() => void closeProfile()}>Close profile</button></div>}
        </section>
      )}

      {((selectedObjects.length === 1 && isExtrude) || (selectedObjects.length > 0 && selectedObjects.every((entry) => Object.values(cadDocument.features).some((candidate) => candidate.output === entry.id && candidate.type === "drawing")))) && (
        <section className="property-section">
          <h3>Extrude <small>mm</small></h3>
          <NumericField label="Distance" context="Extrude" unit="mm" disabled={isLocked || (!isExtrude && !profileResult.ok)} step="0.1" value={extrudeDistance} onChange={setExtrudeDistance} onCommit={() => isExtrude && void commitExtrude()} />
          {!isExtrude && <div className="property-row"><span>Profile</span><strong>{profileResult.ok ? "Closed · Ready" : "Invalid"}</strong></div>}
          {!isExtrude && !profileResult.ok && <p className="property-hint">{profileResult.reason}</p>}
          {isExtrude && <div className="property-row"><span>Sources</span><strong>{feature.inputs.length}</strong></div>}
          <div className="property-actions"><button type="button" disabled={isLocked || (!isExtrude && !profileResult.ok)} onClick={() => void commitExtrude()}>{isExtrude ? "Update extrusion" : "Create solid"}</button></div>
        </section>
      )}

      {isDrawing && selectedObjects.length === 1 && ["line", "polyline", "rectangle", "circle", "arc"].includes(String(feature.params.kind)) && (
        <section className="property-section">
          <h3>Offset <small>mm</small></h3>
          <NumericField label="Distance" context="Offset" unit="mm" disabled={isLocked || hasEmbeddedArcs || selectedObjects.length !== 1} step="0.1" value={offsetDistance} onChange={setOffsetDistance} />
          <label className="property-row"><span>Side</span><select value={offsetSide} disabled={isLocked || hasEmbeddedArcs || selectedObjects.length !== 1} onChange={(event) => onOffsetSideChange?.(event.currentTarget.value as "left" | "right")}><option value="left">{feature.params.kind === "circle" || feature.params.kind === "arc" ? "Outside" : "Left of path"}</option><option value="right">{feature.params.kind === "circle" || feature.params.kind === "arc" ? "Inside" : "Right of path"}</option></select></label>
          <div className="property-actions"><button type="button" disabled={isLocked || hasEmbeddedArcs || selectedObjects.length !== 1} onClick={() => offsetActive ? onOffsetCancel?.() : onOffsetStart?.()}>{offsetActive ? "Cancel offset" : "Preview offset"}</button><button type="button" disabled={isLocked || hasEmbeddedArcs || selectedObjects.length !== 1 || !offsetActive} onClick={() => void commitOffset()}>Commit</button></div>
          <p className="property-hint">{hasEmbeddedArcs ? "Offset of profiles containing fillet arcs is not yet supported." : "Move the pointer across the profile to choose side, then Commit."}</p>
        </section>
      )}


      {isPrimitive && selectedObjects.length === 1 && (
        <section className="property-section">
          <h3>Boolean <small>Consumes target + tool</small></h3>
          <label className="property-row"><span>Tool</span><select disabled={isLocked} value={booleanToolId} onChange={(event) => setBooleanToolId(event.target.value)}><option value="">Choose primitive…</option>{cadDocument.rootObjects.filter((id) => id !== object.id).map((id) => {
            const candidate = cadDocument.objects[id]; const candidateFeature = candidate && Object.values(cadDocument.features).find((entry) => entry.output === id); const candidateLayer = candidate && cadDocument.layers[candidate.layerId];
            return candidate && candidateFeature?.type === "primitive" && !candidateLayer?.locked ? <option key={id} value={id}>{candidate.name}</option> : null;
          })}</select></label>
          <div className="property-actions property-boolean-actions"><button type="button" disabled={isLocked || !booleanToolId} onClick={() => void runBoolean("union")}>Union</button><button type="button" disabled={isLocked || !booleanToolId} onClick={() => void runBoolean("cut")}>Cut</button><button type="button" disabled={isLocked || !booleanToolId} onClick={() => void runBoolean("intersect")}>Intersect</button></div>
          {booleanError && <p className="boolean-error" role="status">{booleanError}</p>}
        </section>
      )}

      <section className="property-section">
        <h3>Position <small>World · mm</small></h3>
        {(["x", "y", "z"] as const).map((key) => (
          <NumericField key={key} label={key.toUpperCase()} context="Position" unit="mm" disabled={bulkEditDisabled} step="0.1" mixed={mixed(selectedPositions.map((position) => position[["x","y","z"].indexOf(key)]))} value={transformDraft[key]} onChange={(value) => setTransformDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitTransform("move")} />
        ))}
      </section>

      <section className="property-section">
        <h3>Rotate <small>deg</small></h3>
        {(["rx", "ry", "rz"] as const).map((key) => (
          <NumericField key={key} label={key.slice(1).toUpperCase()} context="Rotation" unit="°" disabled={bulkEditDisabled} step="1" mixed={mixed(selectedTransforms.map((t) => t.rotation[["rx","ry","rz"].indexOf(key)]))} value={transformDraft[key]} onChange={(value) => setTransformDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitTransform("rotate")} />
        ))}
      </section>

      <section className="property-section">
        <h3>Scale <small>factor</small></h3>
        {(["sx", "sy", "sz"] as const).map((key) => (
          <NumericField key={key} label={key.slice(1).toUpperCase()} context="Scale" unit="×" min="0.001" disabled={bulkEditDisabled} step="0.1" mixed={mixed(selectedTransforms.map((t) => t.scale[["sx","sy","sz"].indexOf(key)]))} value={transformDraft[key]} onChange={(value) => setTransformDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitTransform("scale")} />
        ))}
      </section>

      <div className="property-actions">
        <button type="button" disabled={!feature || bulkEditDisabled} onClick={onDuplicate}>Duplicate</button>
        <button type="button" disabled={bulkEditDisabled} className="danger-button" onClick={onDelete}>Delete</button>
      </div>
      <div className="property-actions property-visibility-actions">
        <button type="button" onClick={onHide}>Hide</button>
        <button type="button" onClick={onIsolate}>{isolationActive ? "Exit Isolation" : "Isolate"}</button>
        <button type="button" onClick={onShowAll}>Show all</button>
      </div>
    </div>
  );
}
