
import { useEffect, useRef, useState } from "react";
import { cadDocument } from "../state/cadDocument";
import { dispatchCadCommand as dispatchDocumentCommand } from "../state/dispatchCadCommand";
import { getObjectTransform } from "../precision/objectTransform";
import { planBulkTransformEdit } from "../state/selectionCommands";
import { NumericField } from "../ui/NumericField";
import { PropertySection } from "../ui/PropertySection";
import { validateBooleanOperation, validateChamferOperation, validateFilletOperation } from "../cad/kernelGeometryService";
import { measureDrawing } from "../precision/measurements";
import { formatLength } from "../precision/units";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { resolveDimension } from "../precision/dimensionGeometry";
import { planDiameterFromSelection, planDimensionFromSelection } from "../state/dimensionCommands";
import { DiameterDimensionReview } from "./DiameterDimensionReview";
import { describeSubObject } from "../viewport/subObjectMeasure";
import type { CornerPreviewRequest } from "../viewport/cornerPreview";
import type { TopologySelectionRef } from "../state/selection";
import { extractSketchLoops } from "../precision/sketchProfiles";
import { getObjectWorldTransformPivot } from "../precision/worldBounds";
import { loftReady, sweepReady } from "../state/profileSelection";
import { WORK_PLANES, type WorkPlaneId } from "../precision/workPlane";
import { ExactMeasurements } from "./ExactMeasurements";
import {ParameterBindingsNotice} from "./ParameterBindingsNotice";
import { DependencyNotice } from "./DependencyNotice";
import { VectorStyleEditor } from "./VectorStyleEditor";
import { DEFAULT_VECTOR_STYLE, type CadVectorStyle } from "@agent-webcad/cad-document";
import type { CadImageCrop, CadImageNodeParams } from "@agent-webcad/cad-document";
import { ImageInspector } from "./ImageInspector";

type PropertiesPanelProps = {
  onEditAngularDimension?: (id:string)=>void;
  onEditPattern?:(id:string)=>void;
  onVariables?:()=>void;
  documentRevision: number;
  draftingPlane?: WorkPlaneId;
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
  onFilletPreview?: (params: Record<string, unknown> | null) => void;
  onChamferPreview?: (params: Record<string, unknown> | null) => void;
  onImageCropPreview?: (value: { objectId: string; crop: CadImageNodeParams["crop"]; mask: NonNullable<CadImageNodeParams["mask"]>; opacity: number; adjustments: NonNullable<CadImageNodeParams["adjustments"]>; revealSource: boolean; asset?: import("@agent-webcad/cad-document").CadRasterAsset } | null) => void;
  imageCropEditingId?: string | null;
  onImageCropHandleModeChange?: (objectId: string, active: boolean) => void;
  onImageCropDraftRegister?: (objectId: string, update: ((crop: CadImageCrop) => void) | null) => void;
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

export function PropertiesPanel(props: PropertiesPanelProps) {
  const [diameterSource, setDiameterSource] = useState<string | null>(null);
  return <>
    <PropertiesContent {...props} onDiameterDimension={setDiameterSource}/>
    {diameterSource && <DiameterDimensionReview objectId={diameterSource} layerId={props.selectedLayerId} revision={props.documentRevision} onClose={() => setDiameterSource(null)} onApplied={id => { props.onBooleanCreated(id); props.onDocumentChange(); }}/>}
  </>;
}

function PropertiesContent({
  onDiameterDimension,
  onEditAngularDimension,
  onEditPattern,
  onVariables,
  documentRevision,
  draftingPlane,
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
  onFilletPreview,
  onChamferPreview,
  onImageCropPreview,
  imageCropEditingId,
  onImageCropHandleModeChange,
  onImageCropDraftRegister,
}: PropertiesPanelProps & { onDiameterDimension: (id: string) => void }) {
  const normalAxis = draftingPlane ? WORK_PLANES[draftingPlane].normal.findIndex((value) => value !== 0) : -1;
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
  const isSolid = feature?.type === "primitive" || feature?.type === "extrude" || feature?.type === "boolean" || feature?.type === "fillet" || feature?.type === "chamfer" || feature?.type === "revolve" || feature?.type === "sweep" || feature?.type === "loft";
  const isDrawing = feature?.type === "drawing";
  const isImage = feature?.type === "image";
  const isDimension = feature?.type === "dimension";
  const isSweep = feature?.type === "sweep";
  const isLoft = feature?.type === "loft";
  const dimensionKind = isDimension ? String(feature.params.kind) : null;
  const dimensionLabel = dimensionKind === "linear" ? "Linear" : dimensionKind === "diameter" ? "Diameter" : dimensionKind === "angular" ? "Angular" : "Radius";
  const dimensionResolved = isDimension && feature ? resolveDimension(feature.params) : null;
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
  const vectorStyle: CadVectorStyle = {
    ...DEFAULT_VECTOR_STYLE,
    ...(objectLayer?.style ? { stroke: objectLayer.style.color, strokeWidth: objectLayer.style.lineWeight } : {}),
    ...(isDrawing && feature.params.vectorStyle && typeof feature.params.vectorStyle === "object" ? feature.params.vectorStyle as Partial<CadVectorStyle> : {}),
  };
  const allSelectedEditable = selectedObjects.length > 0 && selectedObjects.every((entry) => {
    const layer = cadDocument.layers[entry.layerId];
    return Boolean(entry.visible && layer?.visible && !layer.locked);
  });
  // Single selection keeps the exact legacy behavior (primary layer lock).
  // Multi-selection edits are all-or-nothing batches, so disable them unless
  // every member is editable.
  const constructionOwned = selectedObjects.some(entry => Object.values(cadDocument.features).some(f => f.output === entry.id && f.construction));
  const generalEditDisabled = selectedObjects.length > 1 ? !allSelectedEditable : isLocked;
  const bulkEditDisabled = constructionOwned || generalEditDisabled || dimensionKind === "angular";
  const [name, setName] = useState("");
  const [primitiveDraft, setPrimitiveDraft] = useState<PrimitiveDraft>({});
  const [extrudeDistance, setExtrudeDistance] = useState("10");
  const [revolveAngle, setRevolveAngle] = useState("360");
  const [revolveAxis, setRevolveAxis] = useState<"x" | "y">("x");
  const [loftRuled, setLoftRuled] = useState(false);
  const [profileSolidError, setProfileSolidError] = useState("");
  const [commandError, setCommandError] = useState("");
  const [draftRevision, setDraftRevision] = useState(0);
  async function dispatchCadCommand(command: Parameters<typeof dispatchDocumentCommand>[0]) {
    const result = await dispatchDocumentCommand(command);
    setCommandError(!result.ok && result.reason && !result.reason.startsWith("Command rejected:") ? result.reason : "");
    if (!result.ok) setDraftRevision(value => value + 1);
    return result;
  }
  useEffect(() => { setCommandError(""); }, [selectedObjectId, selectedObjectIds.join("\0")]);
  const [booleanToolId, setBooleanToolId] = useState("");
  const [booleanError, setBooleanError] = useState("");
  const [transformDraft, setTransformDraft] = useState<TransformDraft>(emptyTransformDraft);
  const [offsetDistanceLocal, setOffsetDistanceLocal] = useState("10");
  const [cornerDistance, setCornerDistance] = useState("5");
  const [filletRadius, setFilletRadius] = useState("2");
  const [filletError, setFilletError] = useState("");
  const [solidFilletHover, setSolidFilletHover] = useState(false);
  const [chamferDistance, setChamferDistance] = useState("2");
  const [chamferError, setChamferError] = useState("");
  const [dimensionOffset, setDimensionOffset] = useState("10");
  const [dimensionAngle, setDimensionAngle] = useState("45");
  const [dimensionText, setDimensionText] = useState("");
  const [solidChamferHover, setSolidChamferHover] = useState(false);
  const [previewTreatment, setPreviewTreatment] = useState<"fillet" | "chamfer" | null>(null);
  const offsetDistance = offsetDistanceProp ?? offsetDistanceLocal;
  const setOffsetDistance = (value: string) => { setOffsetDistanceLocal(value); onOffsetDistanceChange?.(value); };
  const visibilityInputRef = useRef<HTMLInputElement>(null);
  const allVisible = selectedObjects.length > 0 && selectedObjects.every((entry) => entry.visible);

  useEffect(() => {
    if (visibilityInputRef.current) visibilityInputRef.current.indeterminate = mixedVisible;
  }, [mixedVisible]);

  // Dimension drafts follow the selected annotation; resync on selection or
  // document change so the fields always show committed values.
  useEffect(() => {
    if (!isDimension || !feature) return;
    setDimensionOffset(String(feature.params.offset ?? 10));
    setDimensionAngle(String(feature.params.angle ?? 45));
    setDimensionText(typeof feature.params.text === "string" ? feature.params.text : "");
  }, [isDimension, feature, selectedObjectId, documentRevision]);

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

  const isFilletable = feature?.type === "primitive" || feature?.type === "extrude" || feature?.type === "boolean" || feature?.type === "fillet" || feature?.type === "chamfer" || feature?.type === "revolve" || feature?.type === "sweep" || feature?.type === "loft";
  const isRevolve = feature?.type === "revolve";
  const isChamferable = isFilletable;
  const filletEdgeKeys = object
    ? [...new Set(selectedSubObjects.filter((entry) => entry.kind === "brep-edge" && entry.objectId === object.id).map((entry) => entry.topologyId))]
    : [];
  useEffect(() => {
    if (!object || !feature || !isFilletable || isLocked || selectedObjects.length !== 1 || !solidFilletHover) {
      onFilletPreview?.(null);
      return;
    }
    const edgeKeys = [...new Set(selectedSubObjects.filter((entry) => entry.kind === "brep-edge" && entry.objectId === object.id).map((entry) => entry.topologyId))];
    if (!edgeKeys.length) {
      onFilletPreview?.(null);
      return;
    }
    const radius = Number(filletRadius);
    if (!Number.isFinite(radius) || radius <= 0) {
      onFilletPreview?.(null);
      return;
    }
    onFilletPreview?.({
      kind: "fillet",
      radius,
      edgeKeys,
      source: { params: feature.params, transform: getObjectTransform(object, feature) },
    });
    return () => onFilletPreview?.(null);
  }, [object, feature, isFilletable, isLocked, selectedObjects.length, selectedSubObjects, filletRadius, solidFilletHover, onFilletPreview]);

  useEffect(() => {
    if (!object || !feature || !isChamferable || isLocked || selectedObjects.length !== 1 || !solidChamferHover) {
      onChamferPreview?.(null);
      return;
    }
    const edgeKeys = [...new Set(selectedSubObjects.filter((entry) => entry.kind === "brep-edge" && entry.objectId === object.id).map((entry) => entry.topologyId))];
    if (!edgeKeys.length) {
      onChamferPreview?.(null);
      return;
    }
    const distance = Number(chamferDistance);
    if (!Number.isFinite(distance) || distance <= 0) {
      onChamferPreview?.(null);
      return;
    }
    onChamferPreview?.({
      kind: "chamfer",
      distance,
      edgeKeys,
      source: { params: feature.params, transform: getObjectTransform(object, feature) },
    });
    return () => onChamferPreview?.(null);
  }, [object, feature, isChamferable, isLocked, selectedObjects.length, selectedSubObjects, chamferDistance, solidChamferHover, onChamferPreview]);

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
  }, [selectedObjectId, selectedObjectIds.join("\0"), documentRevision, draftRevision]);

  useEffect(() => {
    setExtrudeDistance(isExtrude ? String(feature.params.distance) : "10");
  }, [selectedObjectId, documentRevision, isExtrude, draftRevision]);

  useEffect(() => {
    setRevolveAngle(isRevolve ? String(feature.params.angle ?? 360) : "360");
  }, [selectedObjectId, documentRevision, isRevolve, draftRevision]);

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
    if (!object || !feature || !isSolid || isLocked || !booleanToolId) return;
    const tool = cadDocument.objects[booleanToolId];
    const toolFeature = tool && Object.values(cadDocument.features).find((entry) => entry.output === tool.id);
    if (!tool || !toolFeature || (toolFeature.type !== "primitive" && toolFeature.type !== "extrude" && toolFeature.type !== "boolean" && toolFeature.type !== "fillet" && toolFeature.type !== "chamfer" && toolFeature.type !== "revolve" && toolFeature.type !== "sweep" && toolFeature.type !== "loft")) return;
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
    const result = await dispatchCadCommand({ type: "boolean-operation", operation, target: object.id, tool: booleanToolId });
    const id = result.createdIds[0];
    if (id) { onBooleanCreated(id); onDocumentChange(); }
    else setBooleanError(result.reason ?? "The selected solids do not produce a valid boolean result.");
  }

  async function commitSolidFillet() {
    if (!object || !feature || !isFilletable || isLocked || selectedObjects.length !== 1) return;
    if (!filletEdgeKeys.length) return;
    const radius = Number(filletRadius);
    if (!Number.isFinite(radius) || radius <= 0) return;
    try {
      setFilletError("");
      await validateFilletOperation({
        radius,
        edgeKeys: filletEdgeKeys,
        source: { params: feature.params, transform: getObjectTransform(object, feature) },
      });
    } catch {
      setFilletError("The selected edges do not produce a valid fillet. The radius may be too large.");
      return;
    }
    const filletResult = await dispatchCadCommand({ type: "fillet", target: object.id, edges: filletEdgeKeys, radius });
    const filletId = filletResult.createdIds[0];
    if (filletId) { onBooleanCreated(filletId); onDocumentChange(); }
    else setFilletError(filletResult.reason ?? "The selected edges do not produce a valid fillet. The radius may be too large.");
  }

  async function commitSolidChamfer() {
    if (!object || !feature || !isChamferable || isLocked || selectedObjects.length !== 1) return;
    if (!filletEdgeKeys.length) return;
    const distance = Number(chamferDistance);
    if (!Number.isFinite(distance) || distance <= 0) return;
    try {
      setChamferError("");
      await validateChamferOperation({
        distance,
        edgeKeys: filletEdgeKeys,
        source: { params: feature.params, transform: getObjectTransform(object, feature) },
      });
    } catch {
      setChamferError("The selected edges do not produce a valid chamfer. The distance may be too large.");
      return;
    }
    const chamferResult = await dispatchCadCommand({ type: "chamfer", target: object.id, edges: filletEdgeKeys, distance });
    const chamferId = chamferResult.createdIds[0];
    if (chamferId) { onBooleanCreated(chamferId); onDocumentChange(); }
    else setChamferError(chamferResult.reason ?? "The selected edges do not produce a valid chamfer. The distance may be too large.");
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
    const result = await dispatchCadCommand({ type: "offset-drawing", objectId: object.id, distance, side: offsetSide });
    const id = result.createdIds[0];
    if (id) {
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

  async function commitDimensionFromSelection() {
    if (!object || isLocked || selectedObjects.length !== 1) return;
    const command = planDimensionFromSelection(cadDocument, object.id);
    if (!command) return;
    const result = await dispatchCadCommand({ ...command, layerId: selectedLayerId });
    const id = result.createdIds[0];
    if (id) onBooleanCreated(id);
    onDocumentChange();
  }

  async function commitDimensionEdit(patch: Record<string, unknown>) {
    if (!object || !isDimension || isLocked) return;
    await dispatchCadCommand({ type: "update-dimension", objectId: object.id, params: patch });
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
    const result = await dispatchCadCommand({ type: "create-extrude", profileObjectIds: selectedObjectIds, distance, layerId: selectedLayerId });
    const id = result.createdIds[0];
    if (id) onBooleanCreated(id);
    onDocumentChange();
  }

  async function commitRevolve() {
    const angle = Number(revolveAngle);
    if (!Number.isFinite(angle) || angle <= 0 || angle > 360) return;
    if (isRevolve && object) {
      await dispatchCadCommand({ type: "update-revolve", objectId: object.id, angle });
      onDocumentChange();
      return;
    }
    if (!profileResult.ok) return;
    const result = await dispatchCadCommand({ type: "create-revolve", profileObjectIds: selectedObjectIds, axis: revolveAxis, angle, layerId: selectedLayerId });
    const id = result.createdIds[0];
    if (id) onBooleanCreated(id);
    onDocumentChange();
  }

  const sweepMatch = sweepReady(cadDocument, selectedObjectIds);
  const loftMatch = loftReady(cadDocument, selectedObjectIds);

  async function commitSweep() {
    if (!sweepMatch || isLocked) return;
    setProfileSolidError("");
    const result = await dispatchCadCommand({ type: "create-sweep", profileObjectIds: [sweepMatch.profile], pathObjectId: sweepMatch.path, layerId: selectedLayerId });
    const id = result.createdIds[0];
    if (id) {
      onBooleanCreated(id);
    } else if (!result.ok) {
      setProfileSolidError(result.reason ?? "Sweep rejected: the kernel could not sweep this profile along the path.");
    }
    onDocumentChange();
  }

  async function commitLoft() {
    if (!loftMatch || isLocked) return;
    setProfileSolidError("");
    const result = await dispatchCadCommand({ type: "create-loft", profileObjectIds: loftMatch, ruled: loftRuled, layerId: selectedLayerId });
    const id = result.createdIds[0];
    if (id) {
      onBooleanCreated(id);
    } else if (!result.ok) {
      setProfileSolidError(result.reason ?? "Loft rejected: the kernel could not blend these profiles.");
    }
    onDocumentChange();
  }

  if (!object) {
    const activeLayer = cadDocument.layers[selectedLayerId];
    return (
      <div className="properties-content">
        <div className="inspector-header"><span>Inspector</span><small>No selection</small></div>
        <div className="inspector-empty">
          <div className="inspector-empty-icon" aria-hidden="true">◇</div>
          <strong>Inspect your model</strong>
          <span>Select geometry in the viewport or Explorer to edit its properties.</span>
        </div>
        <PropertySection title="Document">
          <div className="property-row"><span>Objects</span><strong>{cadDocument.rootObjects.length}</strong></div>
          <div className="property-row"><span>Layers</span><strong>{cadDocument.rootLayers.length}</strong></div>
          <div className="property-row"><span>Active layer</span><strong>{activeLayer?.name ?? "?"}</strong></div>
        </PropertySection>
      </div>
    );
  }

  if(feature?.pattern){
    const p=feature.pattern,members=Object.values(cadDocument.features).filter(f=>f.pattern?.id===p.id);
    const act=async(type:"detach-pattern"|"delete-pattern")=>{const result=await dispatchDocumentCommand({type,patternId:p.id});if(result.ok)onDocumentChange();else setCommandError(result.reason??"Pattern operation rejected.");};
    return <div className="properties-content"><PropertySection title="Live pattern"><strong>{p.spec.kind} · {members.length} generated curves</strong><p>Edit the sources to change every instance. Edit the pattern to change its axis, spacing or placements.</p><button type="button" onClick={()=>onEditPattern?.(p.id)}>Edit pattern</button><button type="button" onClick={()=>void act("detach-pattern")}>Detach pattern</button><button type="button" onClick={()=>void act("delete-pattern")}>Delete pattern</button><small>Detach keeps all current curves as independent drawings. Delete keeps the originals.</small></PropertySection>{commandError&&<p role="alert">{commandError}</p>}<ExactMeasurements objectId={object.id} revision={documentRevision}/></div>;
  }
  return (
    <div className="properties-content">
      {commandError && <div className="inspector-notice inspector-error" role="alert">{commandError}</div>}
      {selectedObjects.length===1&&(isSolid||isDrawing)&&<ExactMeasurements objectId={object.id} revision={documentRevision}/>}
      {selectedObjects.length===1&&<ParameterBindingsNotice objectId={object.id} onEdit={onVariables}/>}
      <div className="inspector-header"><span>Inspector</span><small>{selectedObjects.length} selected</small></div>
      <div className="inspector-selection-summary">
        <span className="inspector-selection-mark" aria-hidden="true">◇</span>
        <div><strong title={object.name}>{object.name}</strong><span>{selectedObjects.length > 1 ? `Primary · ${selectedObjects.length} objects selected` : isImage ? "Image · raster" : isPrimitive ? `Primitive · ${primitiveKind}` : isDrawing ? `Drawing · ${String(feature.params.kind)}` : isDimension ? `Dimension · ${dimensionLabel}` : isExtrude ? "Extrude" : feature?.type === "boolean" ? "Boolean result" : feature?.type === "fillet" ? "Fillet" : feature?.type === "chamfer" ? "Chamfer" : feature?.type === "revolve" ? "Revolve" : feature?.type === "sweep" ? "Sweep" : feature?.type === "loft" ? "Loft" : "BRep body"}</span></div>
        {isLocked && <span className="inspector-state-badge">Locked</span>}
      </div>

      {isLocked && <div className="inspector-notice">Unlock <strong>{objectLayer?.name}</strong> in Layers to edit this object.</div>}

      <PropertySection title="Identity" meta={selectedObjects.length > 1 ? "Multiple" : "Name / ID"} defaultOpen={false}>
        {selectedObjects.length === 1 ? <>
          <label className="property-row"><span>Name</span><input disabled={isLocked} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => void commitName()} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></label>
          <div className="property-row"><span>Type</span><strong>{isImage ? "Image / Raster" : isPrimitive ? `Primitive / ${primitiveKind[0].toUpperCase()}${primitiveKind.slice(1)}` : isDrawing ? `Drawing / ${String(feature.params.kind)}` : isDimension ? `Dimension / ${dimensionLabel}` : isExtrude ? "Feature / Extrude" : feature?.type === "boolean" ? "Feature / Boolean" : feature?.type === "fillet" ? "Feature / Fillet" : feature?.type === "chamfer" ? "Feature / Chamfer" : feature?.type === "revolve" ? "Feature / Revolve" : feature?.type === "sweep" ? "Feature / Sweep" : feature?.type === "loft" ? "Feature / Loft" : "BRep body"}</strong></div>
          <div className="property-row" title={object.id}><span>ID</span><code>{object.id}</code></div>
        </> : <>
          <div className="property-row"><span>Selection</span><strong>{selectedObjects.length} objects</strong></div>
          <div className="property-row"><span>Primary</span><strong>{object.name}</strong></div>
        </>}
      </PropertySection>

      {selectedSubObjects.length > 0 && (
        <PropertySection title="Direct selection" meta={selectedSubObjects.length} onOpenChange={(open) => { if (!open) setPreviewTreatment(null); }}>
          {selectedSubObjects.map((entry) => {
            const measure = describeSubObject(cadDocument, entry);
            return (
              <div key={`${entry.objectId}:${entry.kind}:${entry.topologyId}`}>
                <div className="property-row"><span>{entry.kind === "drawing-control" ? "Vertex" : entry.kind === "drawing-segment" ? "Segment" : entry.kind === "drawing-curve" ? "Curve" : entry.kind === "brep-edge" ? "Edge" : entry.kind === "brep-face" ? "Face" : entry.kind}</span><code>{entry.topologyId}</code></div>
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
            <p className="property-hint">Radius or equal setback at this corner. Hover to preview.</p>
          </>}
        </PropertySection>
      )}

      {selectedObjects.length===1&&<DependencyNotice objectId={object.id} revision={documentRevision}/>}
      {constructionOwned && <p className="property-hint">Defined by construction. Edit the live sources in Dependencies; derived coordinates follow automatically.</p>}
      <PropertySection title="General" meta={mixedLayer || mixedVisible ? "Mixed" : undefined}>
        <label className="property-row"><span>Layer</span><select disabled={generalEditDisabled} value={mixedLayer ? "__mixed__" : object.layerId} onChange={(event) => void changeLayer(event.target.value)}><option value="__mixed__" disabled>Mixed</option>{cadDocument.rootLayers.map((layerId) => {
          const layer = cadDocument.layers[layerId];
          return layer && <option key={layer.id} value={layer.id} disabled={layer.locked && layer.id !== object.layerId}>{layer.name}{layer.locked ? " (locked)" : ""}</option>;
        })}</select></label>
        <label className="property-row"><span>Visible</span><input ref={visibilityInputRef} className={mixedVisible ? "property-toggle property-toggle-mixed" : "property-toggle"} type="checkbox" disabled={generalEditDisabled} checked={allVisible} onChange={(event) => void setVisibility(event.target.checked)} /></label>
      </PropertySection>

      {((isPrimitive && selectedObjects.length === 1) || multiPrimitiveKind) && (
        <PropertySection title="Dimensions" meta={multiPrimitiveKind ? `${selectedObjects.length} · ${multiPrimitiveKind}` : "mm"}>
          {fields.map(({ key, label }) => (
            <NumericField key={key} label={label} context="Dimensions" unit="mm" disabled={bulkEditDisabled} min="0.001" step="0.1" mixed={primitiveFieldMixed(key)} value={primitiveDraft[key] ?? ""} onChange={(value) => setPrimitiveDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitPrimitive()} />
          ))}
          {multiPrimitiveKind && <p className="property-hint">Enter a value to apply it to all {selectedObjects.length} objects. Mixed values stay unchanged.</p>}
        </PropertySection>
      )}

      {isDrawing && selectedObjects.length === 1 && (
        <PropertySection title="Geometry" meta={`${String(feature.params.workPlane ?? "XY")} plane`}>
          {drawingMeasurements.distance !== undefined && <div className="property-row"><span>{feature.params.kind === "arc" ? "Arc length" : feature.params.kind === "rectangle" || drawingMeasurements.area !== undefined && feature.params.kind === "polyline" ? "Perimeter" : "Length"}</span><strong>{formatLength(drawingMeasurements.distance, "mm", 2)}</strong></div>}
          {drawingMeasurements.angle !== undefined && <div className="property-row"><span>Angle</span><strong>{(drawingMeasurements.angle * 180 / Math.PI).toFixed(2)} °</strong></div>}
          {drawingMeasurements.radius !== undefined && <div className="property-row"><span>Radius</span><strong>{formatLength(drawingMeasurements.radius, "mm", 2)}</strong></div>}
          {drawingMeasurements.diameter !== undefined && <div className="property-row"><span>Diameter</span><strong>{formatLength(drawingMeasurements.diameter, "mm", 2)}</strong></div>}
          {drawingMeasurements.area !== undefined && <div className="property-row"><span>Area</span><strong>{drawingMeasurements.area.toFixed(2)} mm²</strong></div>}
          {feature.params.kind === "polyline" && feature.params.closed !== true && <div className="property-actions"><button type="button" disabled={isLocked} onClick={() => void closeProfile()}>Close profile</button></div>}
          {!isLocked && object && planDimensionFromSelection(cadDocument, object.id) && <div className="property-actions"><button type="button" onClick={() => void commitDimensionFromSelection()}>Add dimension</button></div>}
          {!isLocked && object && planDiameterFromSelection(cadDocument, object.id) && <div className="property-actions"><button type="button" onClick={() => onDiameterDimension(object.id)}>Add diameter dimension</button></div>}
        </PropertySection>
      )}

      {isDrawing && selectedObjects.length === 1 && <VectorStyleEditor key={object.id} objectId={object.id} style={vectorStyle} disabled={isLocked || !object.visible || objectLayer?.visible === false} revision={documentRevision} onDocumentChange={onDocumentChange} />}

      {isImage && selectedObjects.length === 1 && feature && <ImageInspector key={object.id} objectId={object.id} params={feature.params as unknown as CadImageNodeParams} asset={cadDocument.rasterAssets?.[String(feature.params.assetId)]!} disabled={isLocked || !object.visible || objectLayer?.visible === false} revision={documentRevision} onDocumentChange={onDocumentChange} cropHandlesActive={imageCropEditingId === object.id} onCropHandleModeChange={onImageCropHandleModeChange} onCropDraftRegister={onImageCropDraftRegister} onCropPreview={onImageCropPreview ?? (() => {})} />}

      {isDimension && selectedObjects.length === 1 && (
        <PropertySection title="Annotation" meta={dimensionLabel}>
          {dimensionResolved && <div className="property-row"><span>Measured</span><strong>{dimensionResolved.text}</strong></div>}
          {dimensionKind === "angular" && <><div className="property-row"><span>References</span><strong>{String((feature.params.first as {objectId?:string}|undefined)?.objectId ?? "?")} · {String((feature.params.second as {objectId?:string}|undefined)?.objectId ?? "?")}</strong></div><button type="button" disabled={isLocked} onClick={()=>object&&onEditAngularDimension?.(object.id)}>Edit Angular Dimension</button></>}
          {dimensionKind === "linear" && (
            <label className="property-row"><span>Orientation</span><select disabled={isLocked} value={String(feature.params.orientation ?? "aligned")} onChange={(event) => void commitDimensionEdit({ orientation: event.target.value })}><option value="aligned">Aligned</option><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
          )}
          {dimensionKind === "linear" && (
            <NumericField label="Offset" context="Dimension" unit="mm" disabled={isLocked} step="0.5" value={dimensionOffset} onChange={setDimensionOffset} onCommit={() => {
              const value = Number(dimensionOffset);
              if (Number.isFinite(value)) void commitDimensionEdit({ offset: value });
            }} />
          )}
          {(dimensionKind === "radius" || dimensionKind === "diameter") && (
            <NumericField label="Leader angle" context="Dimension" unit="°" disabled={isLocked} step="5" value={dimensionAngle} onChange={setDimensionAngle} onCommit={() => {
              const value = Number(dimensionAngle);
              if (Number.isFinite(value)) void commitDimensionEdit({ angle: value });
            }} />
          )}
          {dimensionKind !== "angular" && <label className="property-row"><span>Text</span><input disabled={isLocked} placeholder="Auto" value={dimensionText} onChange={(event) => setDimensionText(event.target.value)} onBlur={() => void commitDimensionEdit({ text: dimensionText })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>}
          <p className="property-hint">Linked annotation follows source edits in the same Undo step. {dimensionKind === "angular" ? "Edit references, rays, radius and text in the reviewed tool." : "Empty text shows the measured value."}</p>
        </PropertySection>
      )}

      <PropertySection title="Transform">
        <div className="transform-group">
          <div className="transform-group-label">Position <span>World · mm</span></div>
          <div className="transform-axis-grid">
            {(["x", "y", "z"] as const).map((key) => (
              <NumericField key={key} label={key.toUpperCase()} context="Position" unit="mm" disabled={bulkEditDisabled || normalAxis === ["x", "y", "z"].indexOf(key)} step="0.1" mixed={mixed(selectedPositions.map((position) => position[["x","y","z"].indexOf(key)]))} value={transformDraft[key]} onChange={(value) => setTransformDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitTransform("move")} />
            ))}
          </div>
        </div>
        <div className="transform-group">
          <div className="transform-group-label">Rotation <span>deg</span></div>
          <div className="transform-axis-grid">
            {(["rx", "ry", "rz"] as const).map((key) => (
              <NumericField key={key} label={key.slice(1).toUpperCase()} context="Rotation" unit="°" disabled={bulkEditDisabled || (normalAxis >= 0 && normalAxis !== ["rx", "ry", "rz"].indexOf(key))} step="1" mixed={mixed(selectedTransforms.map((t) => t.rotation[["rx","ry","rz"].indexOf(key)]))} value={transformDraft[key]} onChange={(value) => setTransformDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitTransform("rotate")} />
            ))}
          </div>
        </div>
        <div className="transform-group">
          <div className="transform-group-label">Scale <span>factor</span></div>
          <div className="transform-axis-grid">
            {(["sx", "sy", "sz"] as const).map((key) => (
              <NumericField key={key} label={key.slice(1).toUpperCase()} context="Scale" unit="×" min="0.001" disabled={bulkEditDisabled} step="0.1" mixed={mixed(selectedTransforms.map((t) => t.scale[["sx","sy","sz"].indexOf(key)]))} value={transformDraft[key]} onChange={(value) => setTransformDraft((draft) => ({ ...draft, [key]: value }))} onCommit={() => void commitTransform("scale")} />
            ))}
          </div>
        </div>
        {selectedObjects.length > 1 && <p className="property-hint">Edits apply to the selection. Mixed axes retain each object&apos;s value.</p>}
      </PropertySection>

      {((selectedObjects.length === 1 && isExtrude) || (selectedObjects.length > 0 && selectedObjects.every((entry) => Object.values(cadDocument.features).some((candidate) => candidate.output === entry.id && candidate.type === "drawing")))) && (
        <PropertySection title="Extrude" meta={isExtrude ? "Feature" : profileResult.ok ? "Ready" : "Needs closed profile"} defaultOpen={isExtrude || profileResult.ok} active={isExtrude}>
          <NumericField label="Distance" context="Extrude" unit="mm" disabled={isLocked || (!isExtrude && !profileResult.ok)} step="0.1" value={extrudeDistance} onChange={setExtrudeDistance} onCommit={() => isExtrude && void commitExtrude()} />
          {!isExtrude && <div className="property-row"><span>Profile</span><strong>{profileResult.ok ? "Closed · Ready" : "Invalid"}</strong></div>}
          {!isExtrude && !profileResult.ok && <p className="property-hint">{profileResult.reason}</p>}
          {isExtrude && <div className="property-row"><span>Sources</span><strong>{feature.inputs.length}</strong></div>}
          <div className="property-actions"><button type="button" disabled={isLocked || (!isExtrude && !profileResult.ok)} onClick={() => void commitExtrude()}>{isExtrude ? "Update extrusion" : "Create solid"}</button></div>
        </PropertySection>
      )}

      {((selectedObjects.length === 1 && isRevolve) || (selectedObjects.length > 0 && selectedObjects.every((entry) => Object.values(cadDocument.features).some((candidate) => candidate.output === entry.id && candidate.type === "drawing")))) && (
        <PropertySection title="Revolve" meta={isRevolve ? "Feature" : profileResult.ok ? "Ready" : "Needs closed profile"} defaultOpen={isRevolve || profileResult.ok} active={isRevolve}>
          <NumericField label="Angle" context="Revolve" unit="°" disabled={isLocked || (!isRevolve && !profileResult.ok)} step="15" value={revolveAngle} onChange={setRevolveAngle} onCommit={() => isRevolve && void commitRevolve()} />
          {!isRevolve && <div className="property-row"><span>Profile</span><strong>{profileResult.ok ? "Closed · Ready" : "Invalid"}</strong></div>}
          {!isRevolve && !profileResult.ok && <p className="property-hint">{profileResult.reason}</p>}
          {!isRevolve && <label className="property-row"><span>Axis</span><select value={revolveAxis} disabled={isLocked || !profileResult.ok} onChange={(event) => setRevolveAxis(event.currentTarget.value as "x" | "y")}><option value="x">Work-plane X</option><option value="y">Work-plane Y</option></select></label>}
          {isRevolve && <div className="property-row"><span>Axis</span><strong>Work-plane {String(feature.params.axis).toUpperCase()}</strong></div>}
          {isRevolve && <div className="property-row"><span>Sources</span><strong>{feature.inputs.length}</strong></div>}
          <div className="property-actions"><button type="button" disabled={isLocked || (!isRevolve && !profileResult.ok)} onClick={() => void commitRevolve()}>{isRevolve ? "Update revolution" : "Create solid"}</button></div>
          {!isRevolve && <p className="property-hint">Revolves the closed profile around the work-plane axis through the plane origin.</p>}
        </PropertySection>
      )}

      {(sweepMatch || loftMatch || ((isSweep || isLoft) && selectedObjects.length === 1)) && (
        <PropertySection title="Sweep / Loft" meta={sweepMatch ? "Sweep ready" : loftMatch ? `${loftMatch.length} sections` : "Feature"} defaultOpen={Boolean(sweepMatch || loftMatch)}>
          {(isSweep || isLoft) && selectedObjects.length === 1 && <>
            <div className="property-row"><span>Sources</span><strong>{feature.inputs.length}</strong></div>
            {isLoft && <div className="property-row"><span>Ruled</span><strong>{feature.params.ruled === true ? "Yes" : "No"}</strong></div>}
          </>}
          {sweepMatch && <>
            <div className="property-row"><span>Profile</span><strong>{cadDocument.objects[sweepMatch.profile]?.name ?? sweepMatch.profile}</strong></div>
            <div className="property-row"><span>Path</span><strong>{cadDocument.objects[sweepMatch.path]?.name ?? sweepMatch.path}</strong></div>
            <div className="property-actions"><button type="button" disabled={isLocked} onClick={() => void commitSweep()}>Create sweep</button></div>
          </>}
          {loftMatch && <>
            <div className="property-row"><span>Sections</span><strong>{loftMatch.length} closed profiles in order</strong></div>
            <label className="property-row"><span>Ruled</span><input type="checkbox" disabled={isLocked} checked={loftRuled} onChange={(event) => setLoftRuled(event.target.checked)} /></label>
            <div className="property-actions"><button type="button" disabled={isLocked} onClick={() => void commitLoft()}>Create loft</button></div>
          </>}
          {profileSolidError && <p className="boolean-error" role="status">{profileSolidError}</p>}
          <p className="property-hint">Select one closed profile plus one open path for sweep, or two or more closed profiles for loft.</p>
        </PropertySection>
      )}

      {isDrawing && selectedObjects.length === 1 && ["line", "polyline", "rectangle", "circle", "arc"].includes(String(feature.params.kind)) && (
        <PropertySection title="Offset" meta={offsetActive ? "Preview active" : "Drawing"} defaultOpen={false} active={offsetActive}>
          <NumericField label="Distance" context="Offset" unit="mm" disabled={isLocked || hasEmbeddedArcs || selectedObjects.length !== 1} step="0.1" value={offsetDistance} onChange={setOffsetDistance} />
          <label className="property-row"><span>Side</span><select value={offsetSide} disabled={isLocked || hasEmbeddedArcs || selectedObjects.length !== 1} onChange={(event) => onOffsetSideChange?.(event.currentTarget.value as "left" | "right")}><option value="left">{feature.params.kind === "circle" || feature.params.kind === "arc" ? "Outside" : "Left of path"}</option><option value="right">{feature.params.kind === "circle" || feature.params.kind === "arc" ? "Inside" : "Right of path"}</option></select></label>
          <div className="property-actions"><button type="button" disabled={isLocked || hasEmbeddedArcs || selectedObjects.length !== 1} onClick={() => offsetActive ? onOffsetCancel?.() : onOffsetStart?.()}>{offsetActive ? "Cancel offset" : "Preview offset"}</button><button type="button" disabled={isLocked || hasEmbeddedArcs || selectedObjects.length !== 1 || !offsetActive} onClick={() => void commitOffset()}>Commit</button></div>
          <p className="property-hint">{hasEmbeddedArcs ? "Offset of profiles containing fillet arcs is not yet supported." : "Move the pointer across the profile to choose side, then Commit."}</p>
        </PropertySection>
      )}


      {isSolid && selectedObjects.length === 1 && (
        <PropertySection title="Boolean" meta="Combine solids" defaultOpen={false}>
          <label className="property-row"><span>Tool</span><select disabled={isLocked} value={booleanToolId} onChange={(event) => setBooleanToolId(event.target.value)}><option value="">Choose solid…</option>{cadDocument.rootObjects.filter((id) => id !== object.id).map((id) => {
            const candidate = cadDocument.objects[id]; const candidateFeature = candidate && Object.values(cadDocument.features).find((entry) => entry.output === id); const candidateLayer = candidate && cadDocument.layers[candidate.layerId];
            return candidate && (candidateFeature?.type === "primitive" || candidateFeature?.type === "extrude" || candidateFeature?.type === "boolean" || candidateFeature?.type === "fillet" || candidateFeature?.type === "chamfer" || candidateFeature?.type === "revolve" || candidateFeature?.type === "sweep" || candidateFeature?.type === "loft") && !candidateLayer?.locked ? <option key={id} value={id}>{candidate.name}</option> : null;
          })}</select></label>
          <div className="property-actions property-boolean-actions"><button type="button" disabled={isLocked || !booleanToolId} onClick={() => void runBoolean("union")}>Union</button><button type="button" disabled={isLocked || !booleanToolId} onClick={() => void runBoolean("cut")}>Cut</button><button type="button" disabled={isLocked || !booleanToolId} onClick={() => void runBoolean("intersect")}>Intersect</button></div>
          {booleanError && <p className="boolean-error" role="status">{booleanError}</p>}
          <p className="property-hint">Replaces the selected object and tool with the result.</p>
        </PropertySection>
      )}

      {isFilletable && selectedObjects.length === 1 && (
        <PropertySection title="Fillet" meta={filletEdgeKeys.length ? `${filletEdgeKeys.length} edges` : "Select edges"} defaultOpen={false} active={filletEdgeKeys.length > 0} onOpenChange={(open) => { if (!open) setSolidFilletHover(false); }}>
          <div className="property-row"><span>Edges</span><strong>{filletEdgeKeys.length ? `${filletEdgeKeys.length} selected` : "Direct-select edges"}</strong></div>
          <NumericField label="Radius" context="Fillet" unit="mm" disabled={isLocked || !filletEdgeKeys.length} min="0.001" step="0.1" value={filletRadius} onChange={setFilletRadius} />
          <div className="property-actions">
            <button
              type="button"
              disabled={isLocked || !filletEdgeKeys.length}
              onClick={() => void commitSolidFillet()}
              onMouseEnter={() => setSolidFilletHover(true)}
              onMouseLeave={() => setSolidFilletHover(false)}
              onFocus={() => setSolidFilletHover(true)}
              onBlur={() => setSolidFilletHover(false)}
            >Fillet</button>
          </div>
          {filletError && <p className="boolean-error" role="status">{filletError}</p>}
          <p className="property-hint">{filletEdgeKeys.length ? "Hover Fillet to preview the selected edges." : "Use Direct select to pick solid edges, then set a radius."}</p>
        </PropertySection>
      )}

      {isChamferable && selectedObjects.length === 1 && (
        <PropertySection title="Chamfer" meta={filletEdgeKeys.length ? `${filletEdgeKeys.length} edges` : "Select edges"} defaultOpen={false} active={filletEdgeKeys.length > 0} onOpenChange={(open) => { if (!open) setSolidChamferHover(false); }}>
          <div className="property-row"><span>Edges</span><strong>{filletEdgeKeys.length ? `${filletEdgeKeys.length} selected` : "Direct-select edges"}</strong></div>
          <NumericField label="Distance" context="Chamfer" unit="mm" disabled={isLocked || !filletEdgeKeys.length} min="0.001" step="0.1" value={chamferDistance} onChange={setChamferDistance} />
          <div className="property-actions">
            <button
              type="button"
              disabled={isLocked || !filletEdgeKeys.length}
              onClick={() => void commitSolidChamfer()}
              onMouseEnter={() => setSolidChamferHover(true)}
              onMouseLeave={() => setSolidChamferHover(false)}
              onFocus={() => setSolidChamferHover(true)}
              onBlur={() => setSolidChamferHover(false)}
            >Chamfer</button>
          </div>
          {chamferError && <p className="boolean-error" role="status">{chamferError}</p>}
          <p className="property-hint">{filletEdgeKeys.length ? "Hover Chamfer to preview the selected edges." : "Use Direct select to pick solid edges, then set a distance."}</p>
        </PropertySection>
      )}
      <div className="inspector-object-actions">
        <div className="property-actions">
          <button type="button" disabled={!feature || bulkEditDisabled} onClick={onDuplicate}>Duplicate</button>
          <button type="button" disabled={generalEditDisabled} className="danger-button" onClick={onDelete}>Delete</button>
        </div>
        <div className="property-actions property-visibility-actions">
          <button type="button" onClick={onHide}>Hide</button>
          <button type="button" onClick={onIsolate}>{isolationActive ? "Exit Isolation" : "Isolate"}</button>
          <button type="button" onClick={onShowAll}>Show all</button>
        </div>
      </div>
    </div>
  );
}
