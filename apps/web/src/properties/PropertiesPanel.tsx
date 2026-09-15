
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { cadDocument } from "../state/cadDocument";
import { dispatchCadCommand } from "../state/dispatchCadCommand";
import { getObjectTransform } from "../state/objectTransform";
import { NumericField } from "../ui/NumericField";
import { validateBooleanOperation } from "../viewport/kernelGeometryService";
import { measureDrawing } from "../precision/measurements";
import { formatLength } from "../precision/units";
import { selectionBounds } from "../state/selection";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";

type PropertiesPanelProps = {
  documentRevision: number;
  selectedObjectId: string | null;
  selectedObjectIds?: string[];
  selectedLayerId: string;
  onDocumentChange: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onHide: () => void;
  onIsolate: () => void;
  onShowAll: () => void;
  onBooleanCreated: (objectId: string) => void;
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

export function PropertiesPanel({
  documentRevision,
  selectedObjectId,
  selectedObjectIds = selectedObjectId ? [selectedObjectId] : [],
  selectedLayerId,
  onDocumentChange,
  onDuplicate,
  onDelete,
  onHide,
  onIsolate,
  onShowAll,
  onBooleanCreated,
}: PropertiesPanelProps) {
  const object = selectedObjectId ? cadDocument.objects[selectedObjectId] : null;
  const selectedObjects = selectedObjectIds.map((id) => cadDocument.objects[id]).filter(Boolean);
  const selectedTransforms = selectedObjects.map((entry) => {
    const f = Object.values(cadDocument.features).find((candidate) => candidate.output === entry.id);
    return getObjectTransform(entry, f);
  });
  const mixed = (values: number[]) => values.length > 1 && values.some((value) => Math.abs(value - values[0]) > 1e-9);
  const mixedLayer = selectedObjects.length > 1 && selectedObjects.some((entry) => entry.layerId !== selectedObjects[0].layerId);
  const mixedVisible = selectedObjects.length > 1 && selectedObjects.some((entry) => entry.visible !== selectedObjects[0].visible);
  const feature = object
    ? Object.values(cadDocument.features).find((entry) => entry.output === object.id)
    : undefined;
  const isPrimitive = feature?.type === "primitive";
  const isDrawing = feature?.type === "drawing";
  const drawingMeasurements = isDrawing && object && feature
    ? (() => {
      const world = getWorldDrawingGeometry(object, feature);
      if (!world) return {};
      return measureDrawing({ kind: world.kind, workPlane: world.workPlane, points: world.points, center: world.center, radius: world.radius, startAngle: world.startAngle, endAngle: world.endAngle });
    })()
    : {};
  const primitiveKind = isPrimitive && typeof feature.params.kind === "string" ? feature.params.kind : "box";
  const fields = primitiveFields[primitiveKind] ?? primitiveFields.box;
  const objectLayer = object ? cadDocument.layers[object.layerId] : undefined;
  const isLocked = objectLayer?.locked ?? false;
  const [name, setName] = useState("");
  const [primitiveDraft, setPrimitiveDraft] = useState<PrimitiveDraft>({});
  const [booleanToolId, setBooleanToolId] = useState("");
  const [booleanError, setBooleanError] = useState("");
  const [transformDraft, setTransformDraft] = useState<TransformDraft>(emptyTransformDraft);
  const visibilityInputRef = useRef<HTMLInputElement>(null);
  const allVisible = selectedObjects.length > 0 && selectedObjects.every((entry) => entry.visible);

  useEffect(() => {
    if (visibilityInputRef.current) visibilityInputRef.current.indeterminate = mixedVisible;
  }, [mixedVisible]);

  useEffect(() => {
    setName(object?.name ?? "");
    if (object) {
      const transform = getObjectTransform(object, feature);
      setTransformDraft({
        x: String(transform.translation[0]),
        y: String(transform.translation[1]),
        z: String(transform.translation[2]),
        rx: String(transform.rotation[0]),
        ry: String(transform.rotation[1]),
        rz: String(transform.rotation[2]),
        sx: String(transform.scale[0]),
        sy: String(transform.scale[1]),
        sz: String(transform.scale[2]),
      });
    } else {
      setTransformDraft(emptyTransformDraft);
    }
    if (!feature || feature.type !== "primitive") {
      setPrimitiveDraft({});
      return;
    }
    setPrimitiveDraft(Object.fromEntries(Object.entries(feature.params).filter(([key]) => key !== "kind").map(([key, value]) => [key, String(value)])));
    setBooleanToolId("");
  }, [selectedObjectId, documentRevision]);

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
    const current = getObjectTransform(object, feature);
    const allEditable = selectedObjects.every((entry) => {
      const layer = cadDocument.layers[entry.layerId];
      return Boolean(entry.visible && layer?.visible && !layer.locked);
    });
    if (!allEditable) return;
    const group = selectedObjects.length > 1;
    if (kind === "scale") {
      const keys = ["sx", "sy", "sz"] as const;
      const scale = keys.map((key, index) => { const value = Number(transformDraft[key]); return Number.isFinite(value) ? value : current.scale[index]; }) as [number, number, number];
      if (scale.some((value) => value <= 0)) return;
      if (!group) await dispatchCadCommand({ type: "scale-object", objectId: object.id, scale });
      else {
        const factor: [number, number, number] = [scale[0] / current.scale[0], scale[1] / current.scale[1], scale[2] / current.scale[2]];
        const bounds = selectionBounds({ ids: selectedObjects.map((entry) => entry.id), primaryId: object.id });
        if (!bounds || factor.some((v) => !Number.isFinite(v) || v <= 0)) return;
        const pivot = new THREE.Vector3((bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2);
        const commands = selectedObjects.flatMap((entry) => {
          const f = Object.values(cadDocument.features).find((candidate) => candidate.output === entry.id);
          const t = getObjectTransform(entry, f); const p = new THREE.Vector3(...t.translation).sub(pivot).multiply(new THREE.Vector3(...factor)).add(pivot);
          return [{ type: "move-object" as const, objectId: entry.id, translation: p.toArray() as [number, number, number] }, { type: "scale-object" as const, objectId: entry.id, scale: [t.scale[0] * factor[0], t.scale[1] * factor[1], t.scale[2] * factor[2]] as [number, number, number] }];
        });
        await dispatchCadCommand({ type: "batch", commands });
      }
    } else {
      const keys = kind === "move" ? ["x", "y", "z"] as const : ["rx", "ry", "rz"] as const;
      const fallback = kind === "move" ? current.translation : current.rotation;
      const values = keys.map((key, index) => { const value = Number(transformDraft[key]); return Number.isFinite(value) ? value : fallback[index]; }) as [number, number, number];
      // A mixed field is a presentation state. Blurring it without entering a
      // replacement value must not silently overwrite the group with the
      // primary object's value.
      if (keys.some((key) => transformDraft[key] === "Mixed")) return;
      if (!group) await dispatchCadCommand({ type: kind === "move" ? "move-object" : "rotate-object", objectId: object.id, [kind === "move" ? "translation" : "rotation"]: values } as never);
      else {
        const bounds = selectionBounds({ ids: selectedObjects.map((entry) => entry.id), primaryId: object.id }); if (!bounds) return;
        const pivot = new THREE.Vector3((bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2);
        const delta = kind === "move" ? values.map((v, i) => v - current.translation[i]) as [number, number, number] : values.map((v, i) => v - current.rotation[i]) as [number, number, number];
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...delta.map((v) => v * Math.PI / 180) as [number, number, number]));
        const commands = selectedObjects.flatMap((entry) => {
          const f = Object.values(cadDocument.features).find((candidate) => candidate.output === entry.id); const t = getObjectTransform(entry, f);
          const p = new THREE.Vector3(...t.translation); if (kind === "move") p.add(new THREE.Vector3(...delta)); else p.sub(pivot).applyQuaternion(q).add(pivot);
          return [{ type: "move-object" as const, objectId: entry.id, translation: p.toArray() as [number, number, number] }, ...(kind === "rotate" ? [{ type: "rotate-object" as const, objectId: entry.id, rotation: [t.rotation[0] + delta[0], t.rotation[1] + delta[1], t.rotation[2] + delta[2]] as [number, number, number] }] : [])];
        });
        await dispatchCadCommand({ type: "batch", commands });
      }
    }
    onDocumentChange();
  }

  async function changeLayer(layerId: string) {
    if (!object || isLocked || selectedObjects.some((entry) => {
      const layer = cadDocument.layers[entry.layerId];
      return !entry.visible || !layer?.visible || Boolean(layer.locked);
    })) return;
    await dispatchCadCommand({ type: "batch", commands: selectedObjects.map((entry) => ({ type: "move-object-to-layer", objectId: entry.id, layerId })) });
    onDocumentChange();
  }

  async function setVisibility(visible: boolean) {
    if (!object || selectedObjects.some((entry) => {
      const layer = cadDocument.layers[entry.layerId];
      return Boolean(layer?.locked);
    })) return;
    await dispatchCadCommand({ type: "batch", commands: selectedObjects.map((entry) => ({ type: "set-object-visible", objectId: entry.id, visible })) });
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
      <div className="inspector-header"><span>Properties</span><small>{selectedObjects.length > 1 ? `${selectedObjects.length} selected` : isLocked ? "Locked layer" : isPrimitive ? primitiveKind : isDrawing ? String(feature.params.kind) : feature?.type === "boolean" ? "Boolean result" : "BRep body"}</small></div>

      {isLocked && <div className="inspector-notice">Unlock <strong>{objectLayer?.name}</strong> in Layers to edit this object.</div>}

      <section className="property-section">
        <h3>Identity</h3>
        <label className="property-row"><span>Name</span><input disabled={isLocked} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => void commitName()} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></label>
        <div className="property-row"><span>Type</span><strong>{isPrimitive ? `Primitive / ${primitiveKind[0].toUpperCase()}${primitiveKind.slice(1)}` : isDrawing ? `Drawing / ${String(feature.params.kind)}` : feature?.type === "boolean" ? "Feature / Boolean" : "BRep body"}</strong></div>
        <div className="property-row" title={object.id}><span>ID</span><code>{object.id}</code></div>
      </section>

      <section className="property-section">
        <h3>General</h3>
        <label className="property-row"><span>Layer</span><select disabled={isLocked} value={mixedLayer ? "__mixed__" : object.layerId} onChange={(event) => void changeLayer(event.target.value)}><option value="__mixed__" disabled>Mixed</option>{cadDocument.rootLayers.map((layerId) => {
          const layer = cadDocument.layers[layerId];
          return layer && <option key={layer.id} value={layer.id} disabled={layer.locked && layer.id !== object.layerId}>{layer.name}{layer.locked ? " (locked)" : ""}</option>;
        })}</select></label>
        <label className="property-row"><span>Visible</span><input ref={visibilityInputRef} className={mixedVisible ? "property-toggle property-toggle-mixed" : "property-toggle"} type="checkbox" checked={allVisible} onChange={(event) => void setVisibility(event.target.checked)} /></label>
      </section>

      {isPrimitive && (
        <>
          <section className="property-section">
            <h3>Dimensions <small>mm</small></h3>
            {fields.map(({ key, label }) => (
              <NumericField key={key} label={label} context="Dimensions" unit="mm" disabled={isLocked} min="0.001" step="0.1" value={primitiveDraft[key] ?? ""} onChange={(value) => setPrimitiveDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitPrimitive()} />
            ))}
          </section>
        </>
      )}

      {isDrawing && (
        <section className="property-section">
          <h3>Geometry <small>{String(feature.params.workPlane ?? "XY")} plane</small></h3>
          {drawingMeasurements.distance !== undefined && <div className="property-row"><span>{feature.params.kind === "arc" ? "Arc length" : feature.params.kind === "rectangle" || drawingMeasurements.area !== undefined && feature.params.kind === "polyline" ? "Perimeter" : "Length"}</span><strong>{formatLength(drawingMeasurements.distance, "mm", 2)}</strong></div>}
          {drawingMeasurements.angle !== undefined && <div className="property-row"><span>Angle</span><strong>{(drawingMeasurements.angle * 180 / Math.PI).toFixed(2)} °</strong></div>}
          {drawingMeasurements.radius !== undefined && <div className="property-row"><span>Radius</span><strong>{formatLength(drawingMeasurements.radius, "mm", 2)}</strong></div>}
          {drawingMeasurements.diameter !== undefined && <div className="property-row"><span>Diameter</span><strong>{formatLength(drawingMeasurements.diameter, "mm", 2)}</strong></div>}
          {drawingMeasurements.area !== undefined && <div className="property-row"><span>Area</span><strong>{drawingMeasurements.area.toFixed(2)} mm²</strong></div>}
        </section>
      )}

      {isPrimitive && (
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
          <NumericField key={key} label={key.toUpperCase()} context="Position" unit="mm" disabled={isLocked} step="0.1" mixed={mixed(selectedTransforms.map((t) => t.translation[["x","y","z"].indexOf(key)]))} value={mixed(selectedTransforms.map((t) => t.translation[["x","y","z"].indexOf(key)])) ? "Mixed" : transformDraft[key]} onChange={(value) => setTransformDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitTransform("move")} />
        ))}
      </section>

      <section className="property-section">
        <h3>Rotate <small>deg</small></h3>
        {(["rx", "ry", "rz"] as const).map((key) => (
          <NumericField key={key} label={key.slice(1).toUpperCase()} context="Rotation" unit="°" disabled={isLocked} step="1" mixed={mixed(selectedTransforms.map((t) => t.rotation[["rx","ry","rz"].indexOf(key)]))} value={mixed(selectedTransforms.map((t) => t.rotation[["rx","ry","rz"].indexOf(key)])) ? "Mixed" : transformDraft[key]} onChange={(value) => setTransformDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitTransform("rotate")} />
        ))}
      </section>

      <section className="property-section">
        <h3>Scale <small>factor</small></h3>
        {(["sx", "sy", "sz"] as const).map((key) => (
          <NumericField key={key} label={key.slice(1).toUpperCase()} context="Scale" unit="×" disabled={isLocked} min="0.001" step="0.1" mixed={mixed(selectedTransforms.map((t) => t.scale[["sx","sy","sz"].indexOf(key)]))} value={mixed(selectedTransforms.map((t) => t.scale[["sx","sy","sz"].indexOf(key)])) ? "Mixed" : transformDraft[key]} onChange={(value) => setTransformDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitTransform("scale")} />
        ))}
      </section>

      <div className="property-actions">
        <button type="button" disabled={!feature || isLocked} onClick={onDuplicate}>Duplicate</button>
        <button type="button" disabled={isLocked} className="danger-button" onClick={onDelete}>Delete</button>
      </div>
      <div className="property-actions property-visibility-actions">
        <button type="button" onClick={onHide}>Hide</button>
        <button type="button" onClick={onIsolate}>Isolate</button>
        <button type="button" onClick={onShowAll}>Show all</button>
      </div>
    </div>
  );
}
