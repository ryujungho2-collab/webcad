
import { useEffect, useState } from "react";
import { cadDocument } from "../state/cadDocument";
import { dispatchCadCommand } from "../state/dispatchCadCommand";
import { getObjectTransform } from "../state/objectTransform";
import { NumericField } from "../ui/NumericField";
import { validateBooleanOperation } from "../viewport/kernelGeometryService";
import { measureDrawing } from "../precision/measurements";
import { formatLength } from "../precision/units";

type PropertiesPanelProps = {
  documentRevision: number;
  selectedObjectId: string | null;
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
  const feature = object
    ? Object.values(cadDocument.features).find((entry) => entry.output === object.id)
    : undefined;
  const isPrimitive = feature?.type === "primitive";
  const isDrawing = feature?.type === "drawing";
  const drawingMeasurements = isDrawing ? measureDrawing(feature.params) : {};
  const primitiveKind = isPrimitive && typeof feature.params.kind === "string" ? feature.params.kind : "box";
  const fields = primitiveFields[primitiveKind] ?? primitiveFields.box;
  const objectLayer = object ? cadDocument.layers[object.layerId] : undefined;
  const isLocked = objectLayer?.locked ?? false;
  const [name, setName] = useState("");
  const [primitiveDraft, setPrimitiveDraft] = useState<PrimitiveDraft>({});
  const [booleanToolId, setBooleanToolId] = useState("");
  const [booleanError, setBooleanError] = useState("");
  const [transformDraft, setTransformDraft] = useState<TransformDraft>(emptyTransformDraft);

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
    if (kind === "scale") {
      const keys = ["sx", "sy", "sz"] as const;
      const scale = keys.map((key) => Number(transformDraft[key])) as [number, number, number];
      if (scale.some((value) => !Number.isFinite(value) || value <= 0)) {
        setTransformDraft((draft) => ({ ...draft, sx: String(current.scale[0]), sy: String(current.scale[1]), sz: String(current.scale[2]) }));
        return;
      }
      await dispatchCadCommand({ type: "scale-object", objectId: object.id, scale });
    } else {
      const keys = kind === "move" ? ["x", "y", "z"] as const : ["rx", "ry", "rz"] as const;
      const values = keys.map((key) => Number(transformDraft[key])) as [number, number, number];
      if (values.some((value) => !Number.isFinite(value))) {
        const fallback = kind === "move" ? current.translation : current.rotation;
        setTransformDraft((draft) => ({
          ...draft,
          [keys[0]]: String(fallback[0]), [keys[1]]: String(fallback[1]), [keys[2]]: String(fallback[2]),
        }));
        return;
      }
      await dispatchCadCommand(kind === "move"
        ? { type: "move-object", objectId: object.id, translation: values }
        : { type: "rotate-object", objectId: object.id, rotation: values });
    }
    onDocumentChange();
  }

  async function changeLayer(layerId: string) {
    if (!object || isLocked || layerId === object.layerId) return;
    await dispatchCadCommand({ type: "move-object-to-layer", objectId: object.id, layerId });
    onDocumentChange();
  }

  async function toggleVisibility() {
    if (!object) return;
    await dispatchCadCommand({ type: "set-object-visible", objectId: object.id, visible: !object.visible });
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
      <div className="inspector-header"><span>Properties</span><small>{isLocked ? "Locked layer" : isPrimitive ? primitiveKind : isDrawing ? String(feature.params.kind) : feature?.type === "boolean" ? "Boolean result" : "BRep body"}</small></div>

      {isLocked && <div className="inspector-notice">Unlock <strong>{objectLayer?.name}</strong> in Layers to edit this object.</div>}

      <section className="property-section">
        <h3>Identity</h3>
        <label className="property-row"><span>Name</span><input disabled={isLocked} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => void commitName()} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></label>
        <div className="property-row"><span>Type</span><strong>{isPrimitive ? `Primitive / ${primitiveKind[0].toUpperCase()}${primitiveKind.slice(1)}` : isDrawing ? `Drawing / ${String(feature.params.kind)}` : feature?.type === "boolean" ? "Feature / Boolean" : "BRep body"}</strong></div>
        <div className="property-row" title={object.id}><span>ID</span><code>{object.id}</code></div>
      </section>

      <section className="property-section">
        <h3>General</h3>
        <label className="property-row"><span>Layer</span><select disabled={isLocked} value={object.layerId} onChange={(event) => void changeLayer(event.target.value)}>{cadDocument.rootLayers.map((layerId) => {
          const layer = cadDocument.layers[layerId];
          return layer && <option key={layer.id} value={layer.id} disabled={layer.locked && layer.id !== object.layerId}>{layer.name}{layer.locked ? " (locked)" : ""}</option>;
        })}</select></label>
        <label className="property-row"><span>Visible</span><input className="property-toggle" type="checkbox" checked={object.visible} onChange={() => void toggleVisibility()} /></label>
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
          {drawingMeasurements.distance !== undefined && <div className="property-row"><span>{feature.params.kind === "arc" ? "Arc length" : "Length"}</span><strong>{formatLength(drawingMeasurements.distance, "mm", 2)}</strong></div>}
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
          <NumericField key={key} label={key.toUpperCase()} context="Position" unit="mm" disabled={isLocked} step="0.1" value={transformDraft[key]} onChange={(value) => setTransformDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitTransform("move")} />
        ))}
      </section>

      <section className="property-section">
        <h3>Rotate <small>deg</small></h3>
        {(["rx", "ry", "rz"] as const).map((key) => (
          <NumericField key={key} label={key.slice(1).toUpperCase()} context="Rotation" unit="°" disabled={isLocked} step="1" value={transformDraft[key]} onChange={(value) => setTransformDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitTransform("rotate")} />
        ))}
      </section>

      <section className="property-section">
        <h3>Scale <small>factor</small></h3>
        {(["sx", "sy", "sz"] as const).map((key) => (
          <NumericField key={key} label={key.slice(1).toUpperCase()} context="Scale" unit="×" disabled={isLocked} min="0.001" step="0.1" value={transformDraft[key]} onChange={(value) => setTransformDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitTransform("scale")} />
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
