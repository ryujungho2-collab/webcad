
import { useEffect, useState } from "react";
import { cadDocument } from "../state/cadDocument";
import { dispatchCadCommand } from "../state/dispatchCadCommand";
import { getObjectTransform } from "../state/objectTransform";

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
};

type BoxDraft = {
  width: string;
  depth: string;
  height: string;
};

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

const emptyBoxDraft: BoxDraft = { width: "", depth: "", height: "" };
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
}: PropertiesPanelProps) {
  const object = selectedObjectId ? cadDocument.objects[selectedObjectId] : null;
  const feature = object
    ? Object.values(cadDocument.features).find((entry) => entry.output === object.id)
    : undefined;
  const isEditableBox = feature?.type === "primitive";
  const objectLayer = object ? cadDocument.layers[object.layerId] : undefined;
  const isLocked = objectLayer?.locked ?? false;
  const [name, setName] = useState("");
  const [boxDraft, setBoxDraft] = useState<BoxDraft>(emptyBoxDraft);
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
      setBoxDraft(emptyBoxDraft);
      return;
    }
    setBoxDraft({
      width: String(feature.params.width ?? ""),
      depth: String(feature.params.depth ?? ""),
      height: String(feature.params.height ?? ""),
    });
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

  async function commitBox() {
    if (!object || !isEditableBox || isLocked) return;
    const values = [boxDraft.width, boxDraft.depth, boxDraft.height].map(Number);
    const current = [feature.params.width, feature.params.depth, feature.params.height].map(Number);
    if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
      setBoxDraft({ width: String(current[0]), depth: String(current[1]), height: String(current[2]) });
      return;
    }
    if (values.every((value, index) => value === current[index])) return;
    await dispatchCadCommand({
      type: "update-box",
      objectId: object.id,
      width: values[0], depth: values[1], height: values[2],
    });
    onDocumentChange();
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
      <div className="inspector-header"><span>Properties</span><small>{isLocked ? "Locked layer" : isEditableBox ? "Box" : "BRep body"}</small></div>

      {isLocked && <div className="inspector-notice">Unlock <strong>{objectLayer?.name}</strong> in Layers to edit this object.</div>}

      <section className="property-section">
        <h3>Identity</h3>
        <label className="property-row"><span>Name</span><input disabled={isLocked} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => void commitName()} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></label>
        <div className="property-row"><span>Type</span><strong>{isEditableBox ? "Primitive / Box" : "BRep body"}</strong></div>
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

      {isEditableBox && (
        <>
          <section className="property-section">
            <h3>Dimensions <small>mm</small></h3>
            {(["width", "depth", "height"] as const).map((key) => (
              <label className="property-row" key={key}><span>{key[0].toUpperCase() + key.slice(1)}</span><input disabled={isLocked} type="number" min="0.001" step="0.1" value={boxDraft[key]} onChange={(event) => setBoxDraft((draft) => ({ ...draft, [key]: event.target.value }))} onBlur={() => void commitBox()} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></label>
            ))}
          </section>
        </>
      )}

      <section className="property-section">
        <h3>Move <small>mm</small></h3>
        {(["x", "y", "z"] as const).map((key) => (
          <label className="property-row" key={key}><span>{key.toUpperCase()}</span><input disabled={isLocked} type="number" step="0.1" value={transformDraft[key]} onChange={(event) => setTransformDraft((draft) => ({ ...draft, [key]: event.target.value }))} onBlur={() => void commitTransform("move")} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></label>
        ))}
      </section>

      <section className="property-section">
        <h3>Rotate <small>deg</small></h3>
        {(["rx", "ry", "rz"] as const).map((key) => (
          <label className="property-row" key={key}><span>{key.slice(1).toUpperCase()}</span><input disabled={isLocked} type="number" step="1" value={transformDraft[key]} onChange={(event) => setTransformDraft((draft) => ({ ...draft, [key]: event.target.value }))} onBlur={() => void commitTransform("rotate")} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></label>
        ))}
      </section>

      <section className="property-section">
        <h3>Scale <small>factor</small></h3>
        {(["sx", "sy", "sz"] as const).map((key) => (
          <label className="property-row" key={key}><span>{key.slice(1).toUpperCase()}</span><input disabled={isLocked} type="number" min="0.001" step="0.1" value={transformDraft[key]} onChange={(event) => setTransformDraft((draft) => ({ ...draft, [key]: event.target.value }))} onBlur={() => void commitTransform("scale")} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></label>
        ))}
      </section>

      <div className="property-actions">
        <button type="button" disabled={!isEditableBox || isLocked} onClick={onDuplicate}>Duplicate</button>
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
