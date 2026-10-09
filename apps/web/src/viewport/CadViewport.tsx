import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CadImageCrop, CadImageMask, Sketch, SketchPoint } from "@agent-webcad/cad-document";
import type { CommandDiagnostic } from "@agent-webcad/cad-commands";
import { SketchOverlay } from "./SketchOverlay";
import { DirectEditReview, type DirectEditVisual } from "./DirectEditReview";
import type { CanvasEditReview } from "./CanvasDimensionEditor";
import { DirectEditHandles } from "./DirectEditHandles";
import { DirectTargetChooser,type DirectTargetChoice } from "./DirectTargetChooser";
import { DirectTargetInspector } from "./DirectTargetInspector";
import { describeDirectTarget } from "./directTargetDescription";
import type { DirectEditSession } from "../state/directEditIntent";
import { documentVersion, sameDocumentVersion, subscribeDocumentChanges, type DocumentVersion } from "../state/documentSession";
import { PointTransformTool, type PointTransformSession, type PointTransformResult } from "./PointTransformTool";
import {PatternTool,type PatternSession} from "./PatternTool";
import { interactionTools, interactionToolReason, type InteractionToolId } from "../commands/interactionTools";
import { ContourTool } from "../features/drawing-editing/ui/ContourTool";
import { CurveWorkbench } from "../features/drawing-editing/ui/CurveWorkbench";
import type { ContourSession, CurveSession, CurveNextAction } from "../features/drawing-editing/contracts";
import { ConstructionTool, type ConstructionSession } from "./ConstructionTool";
import { AngularDimensionTool, type AngularDimensionSession } from "./AngularDimensionTool";
import { RegionOverlay } from "./RegionOverlay";
import type { SketchLoop } from "../precision/sketchProfiles";
import { applyPolarLocks, emptyPolarLocks, parsePointEntry } from "../precision/pointInput";
import { sketchSnapBinding, type SketchSnapBinding } from "../precision/automaticSketchConstraints";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

import { cadDocument } from "../state/cadDocument";
import { artboardWorldCorners, artboardsForCanvas } from "./artboardCanvas";
import { getObjectTransform } from "../precision/objectTransform";
import { getObjectWorldBounds, getSelectionWorldBounds } from "../precision/worldBounds";
import { parseAngle, parseLength } from "../precision/units";
import { querySnap, type SnapEntity, type SnapResult } from "../precision/snapEngine";
import { DEFAULT_SNAP_PREFERENCES, snapCaption, type SnapPreferences } from "../precision/snapPreferences";
import { measurePoints } from "../precision/measurements";
import { intersectRayWithWorkPlane, planeToWorld, WORK_PLANES, worldToPlane, type Vec3, type WorkPlaneId } from "../precision/workPlane";
import { easeWorkspaceTransition, workspaceTransitionDuration, type WorkspaceMode } from "./workspaceTransition";
import { buildBooleanMesh, buildChamferMesh, buildDemoPartMesh, buildExtrudeMesh, buildFilletMesh, buildLoftMesh, buildPrimitiveMesh, buildRevolveMesh, buildSweepMesh, enumerateSolidTopology, subscribeKernelStatus, type KernelStatus } from "../cad/kernelGeometryService";
import { isKernelCancelled } from "../cad/kernelGeometryService";
import type { CopilotGhost } from "../copilot/copilotPlan";
import { drawingTransformAfterEdit, getWorldDrawingGeometry } from "../precision/worldGeometry";
import type { TopologySelectionRef } from "../state/selection";
import { offsetDrawingForObject } from "../features/drawing-editing/geometry/drawingOperations";
import { resolveLineEdit } from "../features/drawing-editing/geometry/lineEditing";
import { createDrawingRenderObject, createDrawingSceneObject, drawingRenderOrigin, drawingRenderPoints, clipLinearToCamera } from "./drawingRenderer";
import { createImageSceneObject, updateImageSceneCrop } from "./imageRenderer";
import { ImageCropHandles } from "./ImageCropHandles";
import { createDimensionRenderObject } from "./dimensionRenderer";
import { createDraftingRenderObject } from "./draftingRenderer";
import { layerStyle } from "../precision/layerStyle";
import { resolveCornerPreview, type CornerPreviewRequest } from "./cornerPreview";
import { CornerTool } from "../features/drawing-editing/ui/CornerTool";
import {
  buildDirectSelectionCandidates,
  directSelectionHits,sameDirectTarget,type DirectTargetRef,
  nearestDirectSelectionCandidate,
  type DirectSelectionCandidate,
} from "./directSelection";
import { matchesSelectionWindow, type ScreenPoint } from "./selectionWindow";
import { brepFaceKeyAtOrdinal, nearestBrepEdgeHit } from "./brepPicking";
import { isCadKeyboardBlocked, middleMouseNavigation } from "../input/shortcutRouter";
import {
  cycleSelectionCandidate,
  hasSelectionToggleModifier,
  pointerBucketKey,
  selectionDisplayTone,
  selectionPointerOwner,
  uniqueSelectionCandidates,
} from "./selectionRouting";

type CadViewportProps = {
  activeLayerId?: string;
  curveSession?: CurveSession | null;
  angularSession?: AngularDimensionSession | null;
  onAngularClose?: () => void;
  onAngularApplied?: (id: string) => void;
  onAngularEditSketch?: (id: string) => void;
  onAngularInspectSource?: (id: string) => void;
  curveNextActions?: CurveNextAction[];
  onCurveClose?: () => void;
  onCurveApplied?: (ids: string[]) => void;
  constructionSession?: ConstructionSession | null;
  constructionVisible?: boolean;
  onConstructionClose?: () => void;
  onConstructionApplied?: (ids: string[]) => void;
  patternSession?:PatternSession|null;
  contourSession?: ContourSession | null;
  onContourClose?: () => void;
  onContourApplied?: (ids: string[]) => void;
  onPatternClose?:()=>void;
  onPatternApplied?:(ids:string[])=>void;
  extrusionPreview?: Record<string,unknown> | null;
  onExtrusionStatus?: (status:string)=>void;
  extrusionRegions?: SketchLoop[];
  chosenRegions?: string[];
  onToggleRegion?: (id:string)=>void;
  pointTransform?: PointTransformSession | null;
  onPointTransformCommit?: (base: Vec3, target: Vec3, angle: number) => Promise<PointTransformResult>;
  onPointTransformCancel?: () => void;
  activeSketch?: Sketch;
  constraintReview?: CanvasEditReview;
  automaticConstraints?: boolean;
  selectedSketchConstraintId?: string | null;
  sketchDiagnostic?: CommandDiagnostic;
  onSelectSketchConstraint?: (id: string | null) => void;
  onSketchDocumentChange?: () => void;
  onOpenSketch?: (id:string) => void;
  documentRevision: number;
  activeArtboardId?: string | null;
  imageCropPreview?: { objectId: string; crop: CadImageCrop; mask: CadImageMask; opacity: number; adjustments: import("@agent-webcad/cad-document").CadImageAdjustments; revealSource: boolean; asset?: import("@agent-webcad/cad-document").CadRasterAsset } | null;
  imageCropEditingId?: string | null;
  onImageCropDraftChange?: (objectId: string, crop: CadImageCrop) => void;
  onSelectArtboard?: (id: string) => void;
  selectedObjectId: string | null;
  selectedObjectIds?: string[];
  isolatedObjectIds?: string[] | null;
  projectionMode: "perspective" | "orthographic";
  gridVisible: boolean;
  viewAction: ViewportAction | null;
  transformMode: TransformMode | null;
  drawingTool?: DrawingTool | null;
  measurementTool?: MeasurementTool | null;
  activeWorkPlane?: WorkPlaneId;
  snapEnabled?: boolean;
  snapPreferences?: SnapPreferences;
  orthoEnabled?: boolean;
  workspaceMode?: WorkspaceMode;
  directSelectMode?: boolean;
  onKernelStatus?: (status: KernelStatus) => void;
  onTransformCommit?: (objectId: string, mode: TransformMode, transform: ObjectTransformValue) => void;
  onSelectObject?: (objectId: string | null, additive?: boolean) => void;
  onSelectObjects?: (objectIds: string[], additive?: boolean) => void;
  onContextMenuAction?: (action: InteractionToolId | "fit-all" | "fit-selection" | "duplicate" | "hide" | "isolate" | "delete" | "top" | "front" | "right" | "isometric" | "toggle-grid" | "toggle-projection") => void;
  onDrawingCommit?: (drawing: DrawingTool, params: Record<string, unknown>) => void;
  onDrawingCancel?: () => void;
  onDistanceMeasure?: (measurement: PointMeasurement) => void;
  onDirectSelectSubObject?: (selection: TopologySelectionRef, additive?: boolean) => void;
  offsetPreview?: { objectId: string; distance: number; side: "left" | "right" } | null;
  offsetActive?: boolean;
  onOffsetSideChange?: (side: "left" | "right") => void;
  onOffsetCommit?: (side: "left" | "right") => void;
  onOffsetCancel?: () => void;
  cornerPreview?: CornerPreviewRequest | null;
  onCornerClose?: () => void;
  onCornerApplied?: (ids: string[]) => void;
  filletPreview?: Record<string, unknown> | null;
  chamferPreview?: Record<string, unknown> | null;
  copilotPreview?: CopilotGhost[] | null;
  onCopilotPreviewStatus?: (failed: number, total: number) => void;
  lineEditTool?: "trim" | "extend" | null;
  lineEditCutterId?: string | null;
  onLineEditCommit?: (mode: "trim" | "extend", targetId: string, pickPoint: Vec3) => void;
  onLineEditCancel?: () => void;
  shortcutReadout?: string;
};

export type ViewportActionType =
  | "reset-interaction"
  | "focus"
  | "fit-all"
  | "fit-selection"
  | "fit-active-artboard"
  | "fit-visible-artboards"
  | "top"
  | "front"
  | "right"
  | "isometric";

export type ViewportAction = { id: number; type: ViewportActionType; artboardId?: string };
export type TransformMode = "translate" | "rotate" | "scale";
export type DrawingTool = "line" | "polyline" | "rectangle" | "circle" | "arc";
export type MeasurementTool = "distance";
export type PointMeasurement = { distance: number; angle: number };
export type ObjectTransformValue = {
  translation: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

type ViewCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
type AdaptiveGrid = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type RenderObject = THREE.Mesh<THREE.BufferGeometry, THREE.Material> | THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial> | THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | THREE.Group;

const DEFAULT_COLOR = 0x93a7bb;
const EDGE_COLOR = 0x161b21;
const SELECTED_COLOR = 0xffc107;
const SECONDARY_SELECTED_COLOR = 0x58a6ff;
const HOVER_OBJECT_COLOR = 0x8fc3ff;

function createAdaptiveGrid(): AdaptiveGrid {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      minorStep: { value: 1 },
      majorStep: { value: 10 },
      fadeDistance: { value: 100 },
      gridOrigin: { value: new THREE.Vector3() },
      planeXAxis: { value: new THREE.Vector3(1, 0, 0) },
      planeYAxis: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: `
      varying vec3 worldPosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        worldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 worldPosition;
      uniform float minorStep;
      uniform float majorStep;
      uniform float fadeDistance;
      uniform vec3 gridOrigin;
      uniform vec3 planeXAxis;
      uniform vec3 planeYAxis;

      float gridLine(float stepSize) {
        vec3 fromOrigin = worldPosition - gridOrigin;
        vec2 coordinate = vec2(dot(fromOrigin, planeXAxis), dot(fromOrigin, planeYAxis)) / stepSize;
        vec2 width = max(fwidth(coordinate), vec2(0.0001));
        vec2 grid = abs(fract(coordinate - 0.5) - 0.5) / width;
        return 1.0 - min(min(grid.x, grid.y), 1.0);
      }

      void main() {
        vec3 fromOrigin = worldPosition - gridOrigin;
        vec2 gridPosition = vec2(dot(fromOrigin, planeXAxis), dot(fromOrigin, planeYAxis));
        vec3 cameraFromOrigin = cameraPosition - gridOrigin;
        vec2 cameraGridPosition = vec2(dot(cameraFromOrigin, planeXAxis), dot(cameraFromOrigin, planeYAxis));
        float minor = gridLine(minorStep);
        float major = gridLine(majorStep);
        float distanceFromCamera = length(gridPosition - cameraGridPosition);
        float fade = 1.0 - smoothstep(fadeDistance * 0.35, fadeDistance, distanceFromCamera);

        vec3 color = mix(vec3(0.16, 0.18, 0.22), vec3(0.28, 0.32, 0.38), major);
        float axisWidth = max(fwidth(gridPosition.x), fwidth(gridPosition.y));
        float xAxis = 1.0 - smoothstep(0.0, axisWidth * 1.5, abs(gridPosition.y));
        float yAxis = 1.0 - smoothstep(0.0, axisWidth * 1.5, abs(gridPosition.x));
        color = mix(color, vec3(0.72, 0.24, 0.27), xAxis * 0.7);
        color = mix(color, vec3(0.24, 0.58, 0.33), yAxis * 0.7);

        float alpha = max(minor * 0.28, major * 0.62) * fade;
        alpha = max(alpha, max(xAxis, yAxis) * 0.8 * fade);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const grid = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  grid.name = "Adaptive CAD Grid";
  grid.position.z = -0.002;
  grid.renderOrder = -1;
  grid.frustumCulled = false;
  return grid;
}

export function CadViewport({
  activeLayerId="layer-default",
  constructionSession = null, constructionVisible = true, onConstructionClose, onConstructionApplied,
  patternSession=null,onPatternClose,onPatternApplied,
  contourSession=null,onContourClose,onContourApplied,
  curveSession=null,onCurveClose,onCurveApplied,curveNextActions,
  angularSession=null,onAngularClose,onAngularApplied,onAngularEditSketch,onAngularInspectSource,
  extrusionPreview = null, onExtrusionStatus, extrusionRegions, chosenRegions = [], onToggleRegion,
  pointTransform = null,
  onPointTransformCommit,
  onPointTransformCancel,
  activeSketch,
  constraintReview,
  automaticConstraints = true,
  selectedSketchConstraintId = null,
  sketchDiagnostic,
  onSelectSketchConstraint,
  onSketchDocumentChange,
  onOpenSketch,
  documentRevision,
  activeArtboardId = null,
  imageCropPreview = null,
  imageCropEditingId = null,
  onImageCropDraftChange,
  onSelectArtboard,
  selectedObjectId,
  selectedObjectIds = selectedObjectId ? [selectedObjectId] : [],
  isolatedObjectIds = null,
  projectionMode,
  gridVisible,
  viewAction,
  transformMode,
  drawingTool = null,
  measurementTool = null,
  activeWorkPlane = "XY",
  snapEnabled = true,
  snapPreferences = DEFAULT_SNAP_PREFERENCES,
  orthoEnabled = false,
  workspaceMode = "3d",
  directSelectMode = false,
  onKernelStatus,
  onTransformCommit,
  onSelectObject,
  onSelectObjects,
  onContextMenuAction,
  onDrawingCommit,
  onDrawingCancel,
  onDistanceMeasure,
  onDirectSelectSubObject,
  offsetPreview = null,
  offsetActive = false,
  onOffsetSideChange,
  onOffsetCommit,
  onOffsetCancel,
  cornerPreview = null,
  onCornerClose, onCornerApplied,
  filletPreview = null,
  chamferPreview = null,
  copilotPreview = null,
  onCopilotPreviewStatus,
  lineEditTool = null,
  lineEditCutterId = null,
  onLineEditCommit,
  onLineEditCancel,
  shortcutReadout = "",
}: CadViewportProps) {
  const [toolReadout, setToolReadout] = useState("");
  const [sceneReady, setSceneReady] = useState(false);
  const [directSession,setDirectSession]=useState<DirectEditSession|null>(null);
  const directSessionRef=useRef(directSession);directSessionRef.current=directSession;
  const [inspectedTarget,setInspectedTarget]=useState<DirectTargetRef|null>(null);
  const [targetChoice,setTargetChoice]=useState<DirectTargetChoice|null>(null);
  const targetChoiceRef=useRef(targetChoice);targetChoiceRef.current=targetChoice;
  const [targetHint,setTargetHint]=useState<{targets:DirectTargetRef[];x:number;y:number}|null>(null);
  const [focusTarget,setFocusTarget]=useState<{target:DirectTargetRef;nonce:number}>();
  const returnGripRef=useRef<DirectTargetRef|undefined>(undefined);
  const beginKeyboardGripRef=useRef<(target:DirectTargetRef)=>void>(()=>{});
  const chooseTargetRef=useRef<(target:DirectTargetRef)=>void>(()=>{});
  const [directVisual,setDirectVisual]=useState<DirectEditVisual>();
  const [directInspectedConstraint,setDirectInspectedConstraint]=useState<string|null>(null);
  const [openDimension,setOpenDimension]=useState<{id:string;nonce:number}>();
  const cancelDirectPointerRef=useRef<()=>void>(()=>{});
  const closeDirectEdit=useCallback(()=>{cancelDirectPointerRef.current();setDirectSession(null);setDirectVisual(undefined);setInspectedTarget(null);setTargetHint(null);returnGripRef.current=undefined;},[]);
  const finishDirectEdit=useCallback(()=>{const target=returnGripRef.current;closeDirectEdit();rendererRef.current?.domElement.focus();if(target)setFocusTarget({target,nonce:performance.now()});},[closeDirectEdit]);
  const closeTargetChoice=useCallback(()=>{setTargetChoice(null);setInspectedTarget(null);rendererRef.current?.domElement.focus();},[]);
  const openTargetChoice=useCallback((targets:DirectTargetRef[],x:number,y:number)=>{closeDirectEdit();setTargetHint(null);setTargetChoice({id:crypto.randomUUID(),baseVersion:documentVersion(),targets,x,y});},[closeDirectEdit]);
  useEffect(()=>{if(directSession&&!selectedObjectIds.includes(directSession.request.objectId))closeDirectEdit();},[directSession?.request.objectId,selectedObjectIds.join("\0"),closeDirectEdit]);
  useEffect(()=>{closeDirectEdit();setTargetChoice(null);setFocusTarget(undefined);},[directSelectMode,activeSketch?.id,activeWorkPlane,drawingTool,pointTransform,closeDirectEdit]);
  useEffect(()=>subscribeDocumentChanges(()=>{cancelDirectPointerRef.current();if(targetChoiceRef.current)rendererRef.current?.domElement.focus();setTargetChoice(null);setInspectedTarget(null);setTargetHint(null);}),[]);
  useEffect(()=>{if(!targetChoice)return;const dismiss=(event:PointerEvent)=>{if(!(event.target instanceof Element&&event.target.closest('.direct-target-chooser'))) {setTargetChoice(null);setInspectedTarget(null);}};const wheel=()=>{setTargetChoice(null);setInspectedTarget(null);setTargetHint(null);};window.addEventListener("pointerdown",dismiss,true);window.addEventListener("wheel",wheel,true);return()=>{window.removeEventListener("pointerdown",dismiss,true);window.removeEventListener("wheel",wheel,true);};},[targetChoice?.id]);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number; crossing: boolean } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; kind: "object" | "view" } | null>(null);
  const cursorTagRef = useRef<HTMLDivElement | null>(null);

  // Cursor-following readout for pointer tools. Imperative DOM updates (no
  // React state) so pointermove never re-renders the viewport.
  function showCursorTag(clientX: number, clientY: number, text: string) {
    const host = hostRef.current, tag = cursorTagRef.current;
    if (!host || !tag || !text) return;
    const rect = host.getBoundingClientRect();
    tag.style.display = "block";
    tag.style.left = `${clientX - rect.left}px`;
    tag.style.top = `${clientY - rect.top}px`;
    if (tag.textContent !== text) tag.textContent = text;
  }

  function hideCursorTag() {
    const tag = cursorTagRef.current;
    if (tag) tag.style.display = "none";
  }
  const hostRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const sceneRef =
    useRef<THREE.Scene | null>(
      null
    );

  const cameraRef = useRef<ViewCamera | null>(null);
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const projectSketchPoint = useCallback((point: SketchPoint): [number, number] | null => {
    const camera = cameraRef.current, host = hostRef.current;
    if (!camera || !host || !activeSketch) return null;
    const projected = new THREE.Vector3(...planeToWorld(point, WORK_PLANES[activeSketch.workPlane])).project(camera);
    if (projected.z < -1 || projected.z > 1 || !Number.isFinite(projected.x + projected.y)) return null;
    return [Math.round((projected.x + 1) * host.clientWidth * 5) / 10, Math.round((1 - projected.y) * host.clientHeight * 5) / 10];
  }, [activeSketch?.workPlane, Boolean(activeSketch)]);
  const gridRef = useRef<AdaptiveGrid | null>(null);
  const artboardMeshesRef = useRef(new Map<string, THREE.Mesh>());
  const onSelectArtboardRef = useRef(onSelectArtboard);
  onSelectArtboardRef.current = onSelectArtboard;

  const rendererRef =
    useRef<THREE.WebGLRenderer | null>(
      null
    );

  const controlsRef =
    useRef<OrbitControls | null>(
      null
    );
  const transformControlsRef = useRef<TransformControls | null>(null);
  const groupProxyRef = useRef<THREE.Object3D | null>(null);
  const selectionBoundsHelperRef = useRef<THREE.Box3Helper | null>(null);
  const directMarkerRef = useRef<THREE.Mesh | null>(null);
  const selectedDirectHandlesRef = useRef<THREE.Points | null>(null);
  const directCandidatesRef = useRef<DirectSelectionCandidate[]>([]);
  const getDirectCandidates=useCallback(()=>directCandidatesRef.current,[]);
  const directSnapEntitiesRef = useRef<SnapEntity[]>([]);
  const firstGeometryReadyRef = useRef(false);
  const activeWorkPlaneRef = useRef(WORK_PLANES[activeWorkPlane]);
  const cameraWorkspaceRef = useRef({ mode: workspaceMode, plane: activeWorkPlane });
  const cancelCameraTransitionRef = useRef<(() => void) | null>(null);
  const saved3dViewRef = useRef<{ direction: THREE.Vector3; distance: number } | null>(null);

  const meshesRef =
    useRef<Map<string, RenderObject>>(
      new Map()
    );


  const onSelectObjectRef =
    useRef(onSelectObject);
  const onSelectObjectsRef = useRef(onSelectObjects);
  const onContextMenuActionRef = useRef(onContextMenuAction);
  const onTransformCommitRef = useRef(onTransformCommit);
  const onDirectSelectSubObjectRef = useRef(onDirectSelectSubObject);
  const onLineEditCommitRef = useRef(onLineEditCommit);
  const onLineEditCancelRef = useRef(onLineEditCancel);
  const onCopilotPreviewStatusRef = useRef(onCopilotPreviewStatus);
  const directSelectModeRef = useRef(directSelectMode);
  const snapEnabledRef = useRef(snapEnabled);
  const snapPreferencesRef = useRef(snapPreferences);snapPreferencesRef.current=snapPreferences;
  const orthoEnabledRef = useRef(orthoEnabled);
  const drawingToolRef = useRef(drawingTool);
  const drawingCallbacksRef = useRef({onDrawingCommit,onDrawingCancel});
  drawingCallbacksRef.current = {onDrawingCommit,onDrawingCancel};
  const pointTransformRef = useRef(pointTransform);
  const patternSessionRef=useRef(patternSession);patternSessionRef.current=patternSession;
  const contourSessionRef = useRef(contourSession); contourSessionRef.current = contourSession;
  const curveSessionRef = useRef(curveSession); curveSessionRef.current = curveSession;
  const cornerReviewRef = useRef(false); cornerReviewRef.current = Boolean(cornerPreview?.review);
  const angularSessionRef = useRef(angularSession); angularSessionRef.current = angularSession;
  const constructionSessionRef = useRef(constructionSession); constructionSessionRef.current = constructionSession;
  const constructionVisibleRef = useRef(constructionVisible); constructionVisibleRef.current = constructionVisible;
  const sketchInputRef = useRef({ sketch: activeSketch, automaticConstraints });
  useEffect(() => { sketchInputRef.current = { sketch: activeSketch, automaticConstraints }; }, [activeSketch, automaticConstraints]);
  useEffect(() => { pointTransformRef.current = pointTransform; }, [pointTransform]);

  useEffect(() => {
    onSelectObjectRef.current =
      onSelectObject;
  }, [onSelectObject]);
  useEffect(() => { onSelectObjectsRef.current = onSelectObjects; }, [onSelectObjects]);
  useEffect(() => { onContextMenuActionRef.current = onContextMenuAction; }, [onContextMenuAction]);
  useEffect(() => { onCopilotPreviewStatusRef.current = onCopilotPreviewStatus; }, [onCopilotPreviewStatus]);

  useEffect(() => {
    if (!contextMenu) return;
    const dismissOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (event.button === 0 && target instanceof Element && target.closest(".cad-context-menu")) return;
      setContextMenu(null);
    };
    const dismissOnWheel = () => setContextMenu(null);
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (isCadKeyboardBlocked(event.target)) return;
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", dismissOnPointerDown, true);
    window.addEventListener("wheel", dismissOnWheel, true);
    window.addEventListener("keydown", dismissOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", dismissOnPointerDown, true);
      window.removeEventListener("wheel", dismissOnWheel, true);
      window.removeEventListener("keydown", dismissOnEscape, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    onTransformCommitRef.current = onTransformCommit;
  }, [onTransformCommit]);
  useEffect(() => { onDirectSelectSubObjectRef.current = onDirectSelectSubObject; }, [onDirectSelectSubObject]);
  useEffect(() => { onLineEditCommitRef.current = onLineEditCommit; }, [onLineEditCommit]);
  useEffect(() => { onLineEditCancelRef.current = onLineEditCancel; }, [onLineEditCancel]);
  useEffect(() => {
    directSelectModeRef.current = directSelectMode;
    if (directSelectMode) {
      directCandidatesRef.current = buildDirectSelectionCandidates(cadDocument, meshesRef.current);
      directSnapEntitiesRef.current = buildDirectSnapEntities();
    } else {
      directCandidatesRef.current = [];
      directSnapEntitiesRef.current = [];
    }
    updateSelectedDirectHandles();
  }, [directSelectMode]);
  useEffect(() => { snapEnabledRef.current = snapEnabled; }, [snapEnabled]);
  useEffect(() => { orthoEnabledRef.current = orthoEnabled; }, [orthoEnabled]);

  // Async edge-reference cache for solid direct picking. Faces resolve
  // synchronously from mesh attribution; edges need kernel enumeration, so
  // picking reads this cache live and degrades to faces-only when empty.
  // Keyed by document revision: any geometry change invalidates entries.
  const brepEdgeCacheRef = useRef(new Map<string, { revision: number; edges: { key: string; points: [number, number, number][] }[] }>());
  useEffect(() => {
    if (!directSelectMode) {
      brepEdgeCacheRef.current.clear();
      return;
    }
    let cancelled = false;
    const revision = cadDocument.revision;
    void (async () => {
      for (const id of Object.keys(cadDocument.objects)) {
        if (cancelled) return;
        const cached = brepEdgeCacheRef.current.get(id);
        if (cached && cached.revision === revision) continue;
        const object = cadDocument.objects[id];
        const feature = object ? Object.values(cadDocument.features).find((entry) => entry.output === id) : undefined;
        const layer = object ? cadDocument.layers[object.layerId] : undefined;
        if (!object?.visible || !feature || (feature.type !== "primitive" && feature.type !== "extrude" && feature.type !== "boolean" && feature.type !== "fillet" && feature.type !== "chamfer" && feature.type !== "revolve" && feature.type !== "sweep" && feature.type !== "loft") || layer?.visible === false || layer?.locked) {
          brepEdgeCacheRef.current.delete(id);
          continue;
        }
        try {
          const topology = await enumerateSolidTopology(feature.params as Record<string, unknown>);
          if (cancelled) return;
          brepEdgeCacheRef.current.set(id, { revision, edges: topology.edges });
        } catch {
          brepEdgeCacheRef.current.delete(id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [directSelectMode, documentRevision]);

  // Object hover preselection for Select mode only. Every active tool owns
  // its own pointer feedback, so this listener exists solely when no drawing,
  // direct, measurement, line-edit, offset, or gizmo mode is engaged. Render
  // state only: a ref plus direct material updates, never React state and
  // never document history.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (drawingTool || directSelectMode || measurementTool || lineEditTool || offsetActive || transformMode || constructionSession) {
      clearObjectHover();
      return;
    }
    const domElement = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function pickHover(event: PointerEvent) {
      const camera = cameraRef.current;
      if (!camera || event.buttons !== 0) {
        clearObjectHover();
        return;
      }
      const rect = domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const selectableMeshes = Array.from(meshesRef.current.entries())
        .filter(([objectId, mesh]) => {
          const object = cadDocument.objects[objectId];
          const layer = object ? cadDocument.layers[object.layerId] : undefined;
          return mesh.visible && Boolean(object) && !(layer?.locked ?? false);
        })
        .map(([, mesh]) => mesh);
      // Dimension groups resolve through their children (linework and label
      // both carry the feature output id); childless meshes behave identically.
      const id = pickRenderObjects(raycaster, selectableMeshes)[0]?.object.userData.cadObjectId as string | undefined;
      if (id === hoveredObjectIdRef.current) return;
      hoveredObjectIdRef.current = id ?? null;
      domElement.style.cursor = id ? "pointer" : "";
      applySelectionColor();
    }
    function leaveHover() {
      clearObjectHover();
    }
    domElement.addEventListener("pointermove", pickHover);
    domElement.addEventListener("pointerleave", leaveHover);
    return () => {
      domElement.removeEventListener("pointermove", pickHover);
      domElement.removeEventListener("pointerleave", leaveHover);
      clearObjectHover();
    };
  }, [drawingTool, directSelectMode, measurementTool, lineEditTool, offsetActive, transformMode, constructionSession, sceneReady]);

  useEffect(() => { drawingToolRef.current = drawingTool; }, [drawingTool]);

  useEffect(() => { activeWorkPlaneRef.current = WORK_PLANES[activeWorkPlane]; }, [activeWorkPlane]);

  useEffect(() => subscribeKernelStatus((status) => onKernelStatus?.(status)), [onKernelStatus]);

  /* React SelectionState is authoritative; the viewport only renders it. */
  const selectedObjectIdRef = useRef<string | null>(selectedObjectId);
  useEffect(() => { selectedObjectIdRef.current = selectedObjectId; applySelectionColor(); updateSelectedDirectHandles(); }, [selectedObjectId]);
  const selectedObjectIdsRef = useRef<string[]>(selectedObjectIds);
  useEffect(() => { selectedObjectIdsRef.current = selectedObjectIds; applySelectionColor(); }, [selectedObjectIds]);
  const isolatedObjectIdsRef = useRef<Set<string> | null>(isolatedObjectIds ? new Set(isolatedObjectIds) : null);
  useEffect(() => { isolatedObjectIdsRef.current = isolatedObjectIds ? new Set(isolatedObjectIds) : null; }, [isolatedObjectIds]);

  function disposeMesh(
    mesh: RenderObject
  ) {
    // traverse visits self as well, so one pass covers single-geometry
    // meshes and dimension groups (linework plus text sprite) alike.
    mesh.traverse((child) => {
      const geometry = (child as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      geometry?.dispose?.();
      const material = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else {
        (material as THREE.MeshStandardMaterial | undefined)?.map?.dispose?.();
        material?.dispose?.();
      }
    });
  }

  // Hover preselection is viewport-only render state (a ref, never React state):
  // it must always lose to real selection and never reach the document.
  const hoveredObjectIdRef = useRef<string | null>(null);

  function clearObjectHover() {
    if (hoveredObjectIdRef.current === null) return;
    hoveredObjectIdRef.current = null;
    const domElement = rendererRef.current?.domElement;
    if (domElement) domElement.style.cursor = "";
    applySelectionColor();
  }

  function applySelectionColor() {
    for (
      const [
        objectId,
        mesh,
      ]
      of meshesRef.current
    ) {
      const tone = selectionDisplayTone({
        objectId,
        primaryId: selectedObjectIdRef.current,
        selectedIds: selectedObjectIdsRef.current,
        hoveredId: hoveredObjectIdRef.current,
      });
      const tint = tone === "primary"
        ? SELECTED_COLOR
        : tone === "secondary"
          ? SECONDARY_SELECTED_COLOR
          : tone === "hover"
            ? HOVER_OBJECT_COLOR
            : DEFAULT_COLOR;
      // Dimension labels keep their text color; only solid/drawing/linework
      // materials follow the selection tone.
      mesh.traverse((child) => {
        const material = (child as THREE.Mesh).material as THREE.Material | undefined;
        if (!material || (material as THREE.SpriteMaterial).isSpriteMaterial) return;
        (material as THREE.Material & { color?: THREE.Color }).color?.set(tone === "default" ? material.userData.baseColor ?? (cadDocument.objects[objectId] ? layerStyle(cadDocument.layers[cadDocument.objects[objectId].layerId]).color : DEFAULT_COLOR) : tint);
      });
    }
    updateSelectionBoundsHelper();
  }

  function updateSelectedDirectHandles() {
    const handles = selectedDirectHandlesRef.current;
    if (!handles) return;
    const objectId = selectedObjectIdRef.current;
    const controls = directSelectModeRef.current && objectId
      ? directCandidatesRef.current.filter((candidate) => candidate.objectId === objectId && candidate.kind === "control")
      : [];
    handles.geometry.setAttribute("position", new THREE.Float32BufferAttribute(
      controls.flatMap((candidate) => candidate.worldPoint.toArray()), 3,
    ));
    handles.geometry.computeBoundingSphere();
    handles.visible = controls.length > 0;
  }

  function buildDirectSnapEntities(): SnapEntity[] {
    const result: SnapEntity[] = [];
    for (const feature of Object.values(cadDocument.features)) {
      if (feature.type !== "drawing") continue;
      const object = cadDocument.objects[feature.output];
      const layer = object ? cadDocument.layers[object.layerId] : undefined;
      const mesh = meshesRef.current.get(feature.output);
      const kind = feature.params.kind;
      if (!object?.visible || layer?.visible === false || !mesh?.visible || !(["line", "polyline", "rectangle", "circle", "arc", "point", "infinite-line", "ray"] as unknown[]).includes(kind)) continue;
      const world = getWorldDrawingGeometry(object, feature);
      if (!world) continue;
      result.push({
        objectId: object.id,
        kind: kind as SnapEntity["kind"],
        points: world.points,
        center: world.center,
        radius: world.radius,
        startAngle: world.startAngle,
        endAngle: world.endAngle,
        profileSegments: world.profileSegments,
      });
    }
    return result;
  }

  function pickRenderObjects(caster: THREE.Raycaster, objects: THREE.Object3D[]) {
    const camera = cameraRef.current, canvas = rendererRef.current?.domElement;
    const hits = caster.intersectObjects(objects.filter(object => !(object instanceof THREE.Points)), true);
    if (!camera || !canvas) return hits;
    const cursor = caster.ray.origin.clone().addScaledVector(caster.ray.direction, 1).project(camera);
    for (const object of objects) {
      if (!(object instanceof THREE.Points)) continue;
      const position = object.geometry.getAttribute("position"); if (!position?.count) continue;
      const point = new THREE.Vector3().fromBufferAttribute(position, 0).applyMatrix4(object.matrixWorld), screen = point.clone().project(camera);
      if (screen.z < -1 || screen.z > 1 || Math.hypot((screen.x - cursor.x) * canvas.clientWidth / 2, (screen.y - cursor.y) * canvas.clientHeight / 2) > 8) continue;
      hits.push({ object, point, distance: caster.ray.origin.distanceTo(point), index: 0 });
    }
    return hits.sort((a, b) => a.distance - b.distance);
  }

  function updateSelectionBoundsHelper(sceneBounds?: THREE.Box3) {
    const helper = selectionBoundsHelperRef.current;
    if (!helper) return;
    if (selectedObjectIdsRef.current.length < 2) {
      helper.visible = false;
      return;
    }
    if (sceneBounds && !sceneBounds.isEmpty()) {
      helper.box.copy(sceneBounds);
      helper.visible = true;
      helper.updateMatrixWorld(true);
      return;
    }
    const bounds = getSelectionWorldBounds(cadDocument, selectedObjectIdsRef.current);
    if (!bounds) {
      helper.visible = false;
      return;
    }
    helper.box.min.fromArray(bounds.min);
    helper.box.max.fromArray(bounds.max);
    helper.visible = true;
    helper.updateMatrixWorld(true);
  }

  function updateSelection(objectId: string | null, additive = false) {
    // React SelectionState is authoritative; highlight re-renders from props.
    // Drop hover first so a click never leaves a stale preselection behind.
    clearObjectHover();
    onSelectObjectRef.current?.(objectId, additive);
  }

  function createThreeMesh(
    objectId: string,
    meshData: {
      positions: ArrayLike<number>;
      normals: ArrayLike<number>;
      indices: Uint32Array;
      faces?: { key: string; start: number; count: number }[];
    }
  ) {
    const geometry =
      new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        meshData.positions,
        3
      )
    );

    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(
        meshData.normals,
        3
      )
    );

    geometry.setIndex(
      new THREE.BufferAttribute(meshData.indices, 1)
    );

    geometry.computeBoundingSphere();

    const material =
      new THREE.MeshStandardMaterial({
        color: DEFAULT_COLOR,
        metalness: 0.35,
        roughness: 0.42,
        side: THREE.DoubleSide,
      });

    const mesh =
      new THREE.Mesh(
        geometry,
        material
      );

    mesh.userData.cadObjectId =
      objectId;
    mesh.userData.topologyFaces =
      meshData.faces ?? [];

    // CAD wireframe-on-shaded look: sharp kernel edges ride on the mesh so
    // solids read as machined bodies instead of toy plastic. The child
    // carries the same output id, so recursive picking is unaffected, and
    // the viewport traverse disposes it with the parent.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 25),
      new THREE.LineBasicMaterial({ color: EDGE_COLOR }),
    );
    edges.userData.cadObjectId = objectId;
    mesh.add(edges);

    return mesh;
  }

  function fitMeshes(objectIds?: Set<string>) {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const bounds = new THREE.Box3();
    let found = false;
    for (const [objectId, mesh] of meshesRef.current) {
      if (!mesh.visible || (objectIds && !objectIds.has(objectId))) continue;
      mesh.updateWorldMatrix(false, false);
      const feature = Object.values(cadDocument.features).find(f => f.output === objectId);
      if (feature && ["infinite-line", "ray"].includes(String(feature.params.kind))) {
        const authored = getObjectWorldBounds(cadDocument, objectId);
        if (authored) { bounds.expandByPoint(new THREE.Vector3(...authored.min)); bounds.expandByPoint(new THREE.Vector3(...authored.max)); }
      } else bounds.expandByObject(mesh);
      found = true;
    }
    if (!found || bounds.isEmpty()) return;

    fitBounds(bounds);
  }

  function fitArtboard(boardId?: string) {
    const boards = Object.values(cadDocument.artboards ?? {}).filter(board => board.visible);
    const targets = boardId
      ? boards.filter(board => board.id === boardId)
      : artboardsForCanvas(boards, workspaceMode, activeWorkPlane);
    const bounds = new THREE.Box3();
    for (const board of targets) for (const point of artboardWorldCorners(board)) bounds.expandByPoint(new THREE.Vector3(...point));
    if (!bounds.isEmpty()) fitBounds(bounds);
  }

  function fitBounds(bounds:THREE.Box3){
    const camera=cameraRef.current,controls=controlsRef.current;
    if(!camera||!controls||bounds.isEmpty())return;

    // Fit replaces the transition's target and distance. Stop its pending
    // frames so they cannot overwrite this view with an obsolete target.
    cancelCameraTransitionRef.current?.();

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.05);
    const workspace = cameraWorkspaceRef.current, plane = WORK_PLANES[workspace.plane];
    const direction = workspace.mode === "2d" ? new THREE.Vector3(...plane.normal) : camera.position.clone().sub(controls.target);
    if (workspace.mode === "2d") camera.up.set(...plane.yAxis);
    if (direction.lengthSq() < 0.0001) direction.set(1, -1, 1);
    direction.normalize();
    const aspect = Math.max(0.1, hostRef.current?.clientWidth ?? 1) /
      Math.max(1, hostRef.current?.clientHeight ?? 1);

    if (camera instanceof THREE.PerspectiveCamera) {
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
      const limitingHalfFov = Math.max(THREE.MathUtils.degToRad(5), Math.min(verticalFov, horizontalFov) / 2);
      const distance = radius / Math.sin(limitingHalfFov) * 1.25;
      camera.position.copy(center).addScaledVector(direction, distance);
      camera.near = Math.max(distance / 1000, 0.01);
      camera.far = Math.max(distance * 100, 1000);
    } else {
      const halfHeight = radius * 1.25;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      const distance = Math.max(radius * 3, 20);
      camera.position.copy(center).addScaledVector(direction, distance);
      camera.near = 0.01;
      camera.far = Math.max(distance * 100, 1000);
      camera.zoom = 1;
    }
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    camera.lookAt(center);
    controls.update();
  }

  function setStandardView(type: "top" | "front" | "right" | "isometric") {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    cancelCameraTransitionRef.current?.();
    const distance = Math.max(camera.position.distanceTo(controls.target), 1);
    const plane = WORK_PLANES[activeWorkPlane];
    // Standard view commands are global 3D views. In the 2D workspace the
    // active work plane is authoritative, so keep the camera normal to that
    // plane regardless of which view command was invoked.
    const direction = workspaceMode === "2d"
      ? new THREE.Vector3(...plane.normal)
      : {
        top: new THREE.Vector3(0, 0, 1),
        front: new THREE.Vector3(0, -1, 0),
        right: new THREE.Vector3(1, 0, 0),
        isometric: new THREE.Vector3(1, -1, 1).normalize(),
      }[type];
    camera.up.copy(workspaceMode === "2d" ? new THREE.Vector3(...plane.yAxis) : new THREE.Vector3(0, 0, 1));
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
  }

  function syncTransformControl() {
    const controls = transformControlsRef.current;
    const object = selectedObjectId ? cadDocument.objects[selectedObjectId] : undefined;
    const layer = object ? cadDocument.layers[object.layerId] : undefined;
    const mesh = selectedObjectId ? meshesRef.current.get(selectedObjectId) : undefined;

    if (!controls || !transformMode || !mesh || !object || layer?.locked || !mesh.visible) {
      controls?.detach();
      if (controls) controls.getHelper().visible = false;
      return;
    }

    controls.setMode(transformMode);
    controls.setSpace(workspaceMode === "2d" || transformMode === "translate" ? "world" : "local");
    const plane = WORK_PLANES[activeWorkPlane], normalAxis = plane.normal.findIndex((value) => value !== 0);
    const axisVisible = (axis: number) => workspaceMode !== "2d" || (transformMode === "scale" ? true : transformMode === "rotate" ? axis === normalAxis : axis !== normalAxis);
    controls.showX = axisVisible(0); controls.showY = axisVisible(1); controls.showZ = axisVisible(2);
    if (selectedObjectIdsRef.current.length > 1) {
      // Group transforms are atomic: do not expose a gizmo when any member
      // is hidden or belongs to a locked/hidden layer.
      const groupEditable = selectedObjectIdsRef.current.every((id) => {
        const candidateObject = cadDocument.objects[id];
        const candidateLayer = candidateObject ? cadDocument.layers[candidateObject.layerId] : undefined;
        const candidateMesh = meshesRef.current.get(id);
        return Boolean(candidateObject?.visible && candidateLayer?.visible && !candidateLayer.locked && candidateMesh?.visible);
      });
      if (!groupEditable) {
        controls.detach();
        controls.getHelper().visible = false;
        return;
      }
      const proxy = groupProxyRef.current ?? new THREE.Object3D();
      // Keep the group pivot in document/world space.  Using the shared
      // bounds helper keeps primitive and transformed drawing extents
      // consistent with Fit Selection and Arrange operations.
      const documentBounds = getSelectionWorldBounds(cadDocument, selectedObjectIdsRef.current);
      if (documentBounds) {
        proxy.position.set(
          (documentBounds.min[0] + documentBounds.max[0]) / 2,
          (documentBounds.min[1] + documentBounds.max[1]) / 2,
          (documentBounds.min[2] + documentBounds.max[2]) / 2,
        );
      } else {
        const bounds = new THREE.Box3();
        selectedObjectIdsRef.current.forEach((id) => { const candidate = meshesRef.current.get(id); if (candidate?.visible) bounds.expandByObject(candidate); });
        if (!bounds.isEmpty()) proxy.position.copy(bounds.getCenter(new THREE.Vector3()));
      }
      proxy.rotation.set(0, 0, 0); proxy.scale.set(1, 1, 1);
      proxy.userData.cadObjectId = selectedObjectId;
      groupProxyRef.current = proxy;
      sceneRef.current?.add(proxy);
      controls.attach(proxy);
    } else controls.attach(mesh);
    controls.getHelper().visible = true;
  }

  /*
   * Three.js viewport setup.
   * Runs only once.
   */
  useEffect(() => {
    const host =
      hostRef.current;

    if (!host) {
      return;
    }

    const scene =
      new THREE.Scene();

    scene.background =
      new THREE.Color(
        0x111318
      );

    const camera =
      new THREE.PerspectiveCamera(
        45,
        host.clientWidth /
          host.clientHeight,
        0.1,
        1000
      );

    camera.up.set(0, 0, 1);
    camera.position.set(
      24,
      24,
      24
    );

    camera.lookAt(
      0,
      0,
      0
    );

    const orthographicCamera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 1000);
    orthographicCamera.up.copy(camera.up);
    orthographicCamera.position.copy(camera.position);
    orthographicCamera.lookAt(0, 0, 0);

    const renderer =
      new THREE.WebGLRenderer({
        antialias: true,
      });
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "CAD canvas · Direct mode: Tab to edit grips");

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        2
      )
    );

    renderer.setSize(
      host.clientWidth,
      host.clientHeight
    );

    host.appendChild(
      renderer.domElement
    );

    const controls =
      new OrbitControls(
        camera,
        renderer.domElement
      );

    // Left mouse is reserved for selection and direct manipulation. Middle
    // mouse pans; holding Shift orbits in 3D. Right click opens context menus.
    controls.mouseButtons.LEFT = -1 as THREE.MOUSE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    controls.mouseButtons.RIGHT = -1 as THREE.MOUSE;

    // OrbitControls reads its mapping during pointerdown. Capture the event
    // so the modifier-aware MMB mapping is in place before it handles it.
    const handleNavigationPointerDown = (event: PointerEvent) => {
      if (event.button === 1) controls.mouseButtons.MIDDLE = middleMouseNavigation(cameraWorkspaceRef.current.mode, event.shiftKey) === "orbit" ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    };
    const handleNavigationPointerUp = (event: PointerEvent) => {
      if (event.button === 1) controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    };
    const handleNavigationPointerCancel = (event: PointerEvent) => {
      if (event.button === 1 || event.buttons === 0) controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    };
    renderer.domElement.addEventListener("pointerdown", handleNavigationPointerDown, true);
    renderer.domElement.addEventListener("pointerup", handleNavigationPointerUp, true);
    renderer.domElement.addEventListener("pointercancel", handleNavigationPointerCancel, true);

    controls.enableDamping =
      true;

    controls.dampingFactor =
      0.08;

    controls.zoomToCursor =
      true;

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setTranslationSnap(0.1);
    transformControls.setRotationSnap(THREE.MathUtils.degToRad(1));
    transformControls.setScaleSnap(0.01);
    const transformHelper = transformControls.getHelper();
    transformHelper.visible = false;
    scene.add(transformHelper);
    const selectionBoundsHelper = new THREE.Box3Helper(new THREE.Box3(), SECONDARY_SELECTED_COLOR);
    selectionBoundsHelper.visible = false;
    const selectionBoundsMaterial = selectionBoundsHelper.material as THREE.LineBasicMaterial;
    selectionBoundsMaterial.transparent = true;
    selectionBoundsMaterial.opacity = 0.72;
    selectionBoundsMaterial.depthTest = false;
    selectionBoundsHelper.renderOrder = 8;
    scene.add(selectionBoundsHelper);
    selectionBoundsHelperRef.current = selectionBoundsHelper;
    type GroupPreview = {
      proxyStartWorld: THREE.Matrix4;
      members: Array<{
        mesh: RenderObject;
        worldStart: THREE.Matrix4;
        position: THREE.Vector3;
        quaternion: THREE.Quaternion;
        scale: THREE.Vector3;
      }>;
    };
    let groupPreview: GroupPreview | null = null;
    let singlePreview: { mesh: RenderObject; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 } | null = null;
    let transformDragActive = false;
    transformControls.addEventListener("mouseDown", () => {
      transformDragActive = true;
      const renderObject = transformControls.object as RenderObject | undefined;
      singlePreview = renderObject ? { mesh: renderObject, position: renderObject.position.clone(), quaternion: renderObject.quaternion.clone(), scale: renderObject.scale.clone() } : null;
      const proxy = groupProxyRef.current;
      if (selectedObjectIdsRef.current.length > 1 && proxy && transformControls.object === proxy) {
        proxy.updateWorldMatrix(true, false);
        groupPreview = {
          proxyStartWorld: proxy.matrixWorld.clone(),
          members: selectedObjectIdsRef.current.flatMap((id) => {
            const mesh = meshesRef.current.get(id);
            if (!mesh) return [];
            mesh.updateWorldMatrix(true, false);
            return [{
              mesh,
              worldStart: mesh.matrixWorld.clone(),
              position: mesh.position.clone(),
              quaternion: mesh.quaternion.clone(),
              scale: mesh.scale.clone(),
            }];
          }),
        };
      }
    });
    transformControls.addEventListener("objectChange", () => {
      if (!transformDragActive || !groupPreview || !transformControls.object) return;
      transformControls.object.updateWorldMatrix(true, false);
      const delta = transformControls.object.matrixWorld.clone().multiply(groupPreview.proxyStartWorld.clone().invert());
      const liveBounds = new THREE.Box3();
      for (const member of groupPreview.members) {
        const world = delta.clone().multiply(member.worldStart);
        const local = member.mesh.parent
          ? member.mesh.parent.matrixWorld.clone().invert().multiply(world)
          : world;
        local.decompose(member.mesh.position, member.mesh.quaternion, member.mesh.scale);
        member.mesh.updateMatrixWorld(true);
        liveBounds.expandByObject(member.mesh);
      }
      updateSelectionBoundsHelper(liveBounds);
    });
    transformControls.addEventListener("dragging-changed", (event) => {
      controls.enabled = !event.value;
    });
    transformControls.addEventListener("mouseUp", () => {
      if (!transformDragActive) return;
      transformDragActive = false;
      const renderObject = transformControls.object as RenderObject | undefined;
      const objectId = renderObject?.userData.cadObjectId as string | undefined;
      if (!renderObject || !objectId) return;
      const drawingPivot = Array.isArray(renderObject.userData.drawingOrigin)
        ? new THREE.Vector3(...renderObject.userData.drawingOrigin as Vec3)
        : new THREE.Vector3();
      const committedTransform: ObjectTransformValue = {
        translation: renderObject.position.clone().sub(drawingPivot).toArray() as [number, number, number],
        rotation: [
          THREE.MathUtils.radToDeg(renderObject.rotation.x),
          THREE.MathUtils.radToDeg(renderObject.rotation.y),
          THREE.MathUtils.radToDeg(renderObject.rotation.z),
        ],
        scale: renderObject.scale.toArray() as [number, number, number],
      };
      if (groupPreview) {
        for (const member of groupPreview.members) {
          member.mesh.position.copy(member.position);
          member.mesh.quaternion.copy(member.quaternion);
          member.mesh.scale.copy(member.scale);
          member.mesh.updateMatrixWorld(true);
        }
        groupPreview = null;
        updateSelectionBoundsHelper();
      }
      if (singlePreview) {
        // Dragging is a preview. Only the committed document may leave a
        // transform on the scene, including when dependent regeneration fails.
        singlePreview.mesh.position.copy(singlePreview.position);
        singlePreview.mesh.quaternion.copy(singlePreview.quaternion);
        singlePreview.mesh.scale.copy(singlePreview.scale);
        singlePreview.mesh.updateMatrixWorld(true);
        singlePreview = null;
        updateSelectionBoundsHelper();
      }
      onTransformCommitRef.current?.(objectId, transformControls.getMode() as TransformMode, committedTransform);
    });

    const ambientLight =
      new THREE.AmbientLight(
        0xffffff,
        0.85
      );

    scene.add(
      ambientLight
    );

    const directionalLight =
      new THREE.DirectionalLight(
        0xffffff,
        1.7
      );

    directionalLight.position.set(
      20,
      30,
      40
    );

    scene.add(
      directionalLight
    );

    const grid = createAdaptiveGrid();
    grid.visible = gridVisible;
    scene.add(
      grid
    );

    sceneRef.current =
      scene;
    setSceneReady(true);

    cameraRef.current =
      projectionMode === "perspective" ? camera : orthographicCamera;

    perspectiveCameraRef.current = camera;
    orthographicCameraRef.current = orthographicCamera;
    gridRef.current = grid;

    if (projectionMode === "orthographic") {
      controls.object = orthographicCamera;
    }

    rendererRef.current =
      renderer;

    controlsRef.current =
      controls;
    transformControlsRef.current = transformControls;

    const raycaster =
      new THREE.Raycaster();

    raycaster.params.Line.threshold = 0.35;

    const pointer =
      new THREE.Vector2();
    let overlapKey = "";
    let overlapIndex = 0;
    let directOverlapKey = "";
    let directOverlapSelection: Pick<DirectSelectionCandidate, "objectId" | "topologyId"> | null = null;
    let directDrag: { id:string;version:DocumentVersion;planeId:WorkPlaneId;candidate: DirectSelectionCandidate; startWorld: THREE.Vector3; startClient: [number, number]; pointerId: number; committed: boolean; lastWorld: THREE.Vector3; numericBuffer: string } | null = null;
    let directReadout = "";
    let directSnapLabel = "Free";
    function updateDirectReadout(text: string) {
      // Pointermove fires faster than React needs; only publish on change.
      if (text === directReadout) return;
      directReadout = text;
      setToolReadout(text);
    }
    function buildDirectReadout() {
      if (!directDrag) return "";
      const plane = worldToPlane(directDrag.lastWorld.toArray() as Vec3, directDragPlane());
      return `DIRECT · ${orthoEnabledRef.current ? "Ortho · " : ""}${directSnapLabel}${directDrag.numericBuffer ? ` · ${directDrag.numericBuffer}` : ""} · ${plane.map((value) => value.toFixed(2)).join(", ")} mm`;
    }
    const directMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x76ead1, depthTest: false }),
    );
    directMarker.renderOrder = 30;
    directMarker.visible = false;
    scene.add(directMarker);
    directMarkerRef.current = directMarker;
    cancelDirectPointerRef.current=()=>{
      const pointerId=directDrag?.pointerId;directDrag=null;
      if(pointerId!==undefined)try{renderer.domElement.releasePointerCapture(pointerId);}catch{/* Pointer may already be released. */}
      directMarker.visible=false;updateDirectReadout("");
      controls.enabled=true;if(transformControlsRef.current)transformControlsRef.current.enabled=true;
    };
    const selectedDirectHandles = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: 0x76ead1, size: 7, sizeAttenuation: false, depthTest: false }),
    );
    selectedDirectHandles.renderOrder = 28;
    selectedDirectHandles.visible = false;
    scene.add(selectedDirectHandles);
    selectedDirectHandlesRef.current = selectedDirectHandles;
    function pointerPixels(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(event.clientX - rect.left, event.clientY - rect.top);
    }

    function projectPixels(point: THREE.Vector3) {
      const projected = point.clone().project(cameraRef.current!);
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2((projected.x + 1) * rect.width / 2, (1 - projected.y) * rect.height / 2);
    }

    function nearestDirectCandidate(
      event: PointerEvent,
      exclude?: Pick<DirectSelectionCandidate, "objectId" | "topologyId">,
    ) {
      const cursor = pointerPixels(event);
      return nearestDirectSelectionCandidate(
        directCandidatesRef.current,
        cursor,
        projectPixels,
        exclude,
      );
    }

    type BrepPick = { ref: TopologySelectionRef; worldPoint: THREE.Vector3; markerColor: number };

    /**
     * Solid sub-object pick for Direct Select mode: edges by projected
     * proximity (precise topology targets win), otherwise faces by raycast
     * triangle attribution. 2D drawing candidates keep priority; callers
     * only reach here when those miss. Selection only ??no drag editing;
     * future fillet/chamfer will consume these references via commands.
     * Marker language extends the existing direct palette: amber edges
     * (like segments), violet faces (like curves).
     */
    function pickBrepSubObject(event: PointerEvent): BrepPick | null {
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!camera || !renderer) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const project = (point: Vec3): { x: number; y: number } => {
        const projected = new THREE.Vector3(...point).project(camera);
        return { x: (projected.x + 1) * rect.width / 2, y: (1 - projected.y) * rect.height / 2 };
      };
      const edgeInputs: { objectId: string; key: string; points: Vec3[] }[] = [];
      for (const [objectId, mesh] of meshesRef.current) {
        if (!mesh.visible) continue;
        const cached = brepEdgeCacheRef.current.get(objectId);
        if (!cached) continue;
        mesh.updateWorldMatrix(true, false);
        for (const edge of cached.edges) {
          edgeInputs.push({
            objectId,
            key: edge.key,
            points: edge.points.map((point) => new THREE.Vector3(...point).applyMatrix4(mesh.matrixWorld).toArray() as Vec3),
          });
        }
      }
      const edgeHit = nearestBrepEdgeHit(edgeInputs, project, cursor, 12);
      if (edgeHit) {
        return {
          ref: { objectId: edgeHit.objectId, kind: "brep-edge", topologyId: edgeHit.key },
          worldPoint: new THREE.Vector3(...edgeHit.worldPoint),
          markerColor: 0xffc107,
        };
      }
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const solidMeshes = Array.from(meshesRef.current.entries()).filter(([objectId, mesh]) => {
        const object = cadDocument.objects[objectId];
        const feature = object ? Object.values(cadDocument.features).find((entry) => entry.output === objectId) : undefined;
        const layer = object ? cadDocument.layers[object.layerId] : undefined;
        return mesh.visible && Boolean(object) && (feature?.type === "primitive" || feature?.type === "extrude" || feature?.type === "boolean" || feature?.type === "fillet" || feature?.type === "chamfer" || feature?.type === "revolve" || feature?.type === "sweep" || feature?.type === "loft") && layer?.visible !== false && !layer?.locked;
      }).map(([, mesh]) => mesh);
      const hit = raycaster.intersectObjects(solidMeshes, false)[0];
      if (!hit || hit.faceIndex === null || hit.faceIndex === undefined) return null;
      const objectId = hit.object.userData.cadObjectId as string | undefined;
      const ranges = (hit.object.userData.topologyFaces ?? []) as { key: string; start: number; count: number }[];
      const key = brepFaceKeyAtOrdinal(ranges, hit.faceIndex);
      if (!objectId || !key) return null;
      return { ref: { objectId, kind: "brep-face", topologyId: key }, worldPoint: hit.point.clone(), markerColor: 0xb78cff };
    }

    function directWorldPoint(event: PointerEvent) {
      const currentCamera = cameraRef.current; if (!currentCamera) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, currentCamera);
      return intersectRayWithWorkPlane(raycaster.ray.origin.toArray() as Vec3, raycaster.ray.direction.toArray() as Vec3, directDragPlane());
    }

    function selectedGripAt(event:PointerEvent){
      const cursor=pointerPixels(event);
      return directCandidatesRef.current.filter(c=>selectedObjectIdsRef.current.includes(c.objectId)&&c.kind!=="curve").map(c=>{
        const point=c.segment?c.segment[0].clone().add(c.segment[1]).multiplyScalar(.5):c.worldPoint;
        return {candidate:{...c,worldPoint:point},distance:projectPixels(point).distanceTo(cursor)};
      }).filter(hit=>hit.distance<=7).sort((a,b)=>a.distance-b.distance)[0]?.candidate;
    }

    function directDragPlane(){
      if(!directDrag)return activeWorkPlaneRef.current;
      const plane=WORK_PLANES[directDrag.planeId],distance=directDrag.startWorld.dot(new THREE.Vector3(...plane.normal));
      return {...plane,origin:plane.normal.map(v=>v*distance) as Vec3};
    }

    function publishDirectGesture(phase:"dragging"|"review"){
      if(!directDrag)return;
      const drag=directDrag,mesh=meshesRef.current.get(drag.candidate.objectId);if(!mesh)return;
      const origin=Array.isArray(mesh.userData.drawingOrigin)?new THREE.Vector3(...mesh.userData.drawingOrigin as Vec3):new THREE.Vector3();
      const target=drag.candidate.kind==="segment"
        ? {kind:"segment" as const,id:drag.candidate.topologyId,delta:mesh.worldToLocal(drag.lastWorld.clone()).sub(mesh.worldToLocal(drag.startWorld.clone())).toArray() as Vec3}
        : {kind:"control" as const,id:drag.candidate.controlId!,point:mesh.worldToLocal(drag.lastWorld.clone()).add(origin).toArray() as Vec3};
      setDirectSession({id:drag.id,baseVersion:drag.version,phase,snap:directSnapLabel,request:{objectId:drag.candidate.objectId,target,startWorld:drag.startWorld.toArray() as Vec3,targetWorld:drag.lastWorld.toArray() as Vec3}});
    }

    beginKeyboardGripRef.current=target=>{
      const candidate=directCandidatesRef.current.find(c=>sameDirectTarget(c,target));
      if(!directSelectModeRef.current||drawingToolRef.current||!candidate||candidate.kind==="curve"||!selectedObjectIdsRef.current.includes(candidate.objectId)||!describeDirectTarget(cadDocument,candidate))return;
      closeDirectEdit();setTargetChoice(null);returnGripRef.current=target;
      const start=candidate.segment?candidate.segment[0].clone().add(candidate.segment[1]).multiplyScalar(.5):candidate.worldPoint.clone();
      const requestTarget=candidate.kind==="segment"?{kind:"segment" as const,id:candidate.topologyId,delta:[0,0,0] as Vec3}:{kind:"control" as const,id:candidate.topologyId,point:[...candidate.modelPoint!] as Vec3};
      onDirectSelectSubObjectRef.current?.({objectId:candidate.objectId,kind:candidate.kind==="segment"?"drawing-segment":"drawing-control",topologyId:candidate.topologyId});
      setDirectSession({id:crypto.randomUUID(),baseVersion:documentVersion(),phase:"review",input:"keyboard",snap:"Keyboard",request:{objectId:candidate.objectId,target:requestTarget,startWorld:start.toArray() as Vec3,targetWorld:start.toArray() as Vec3}});
    };
    chooseTargetRef.current=target=>{
      const candidate=directCandidatesRef.current.find(c=>sameDirectTarget(c,target));
      if(!candidate||!directSelectModeRef.current||!describeDirectTarget(cadDocument,candidate)){closeTargetChoice();return;}
      closeDirectEdit();setTargetChoice(null);updateSelection(candidate.objectId);
      onDirectSelectSubObjectRef.current?.({objectId:candidate.objectId,kind:candidate.kind==="control"?"drawing-control":candidate.kind==="segment"?"drawing-segment":"drawing-curve",topologyId:candidate.topologyId});
      if(candidate.kind!=="curve")setFocusTarget({target,nonce:performance.now()});else renderer.domElement.focus();
    };

    function startDirectDrag(candidate:DirectSelectionCandidate,event:PointerEvent){
      closeDirectEdit();
      const feature=Object.values(cadDocument.features).find(f=>f.output===candidate.objectId);
      const planeId=feature?.params.workPlane==="XZ"||feature?.params.workPlane==="YZ"?feature.params.workPlane:"XY";
      directDrag={id:crypto.randomUUID(),version:documentVersion(),planeId,candidate,startWorld:candidate.worldPoint.clone(),startClient:[event.clientX,event.clientY],pointerId:event.pointerId,committed:false,lastWorld:candidate.worldPoint.clone(),numericBuffer:""};
      directSnapLabel="Free";publishDirectGesture("dragging");renderer.domElement.focus();
      controls.enabled=false;if(transformControlsRef.current)transformControlsRef.current.enabled=false;
      try{renderer.domElement.setPointerCapture(event.pointerId);}catch{/* Synthetic tests have no captured pointer. */}
    }

    function handleDirectMove(event: PointerEvent) {
      if (!directSelectModeRef.current) { directMarker.visible = false; return; }
      if (!directDrag) {
        if(!directSessionRef.current&&!targetChoiceRef.current){
          const hits=directSelectionHits(directCandidatesRef.current,pointerPixels(event),projectPixels),cursor=pointerPixels(event);
          if(hits.length>1){const targets=hits.map(h=>({objectId:h.candidate.objectId,kind:h.candidate.kind,topologyId:h.candidate.topologyId}));setTargetHint(previous=>previous&&JSON.stringify(previous.targets)===JSON.stringify(targets)&&Math.hypot(previous.x-cursor.x,previous.y-cursor.y)<16?previous:{targets,x:cursor.x,y:cursor.y});}
          else setTargetHint(null);
        }
        const hover = nearestDirectCandidate(event);
        const brepHover = !hover ? pickBrepSubObject(event) : null;
        directMarker.visible = Boolean(hover ?? brepHover);
        if (hover) {
          directMarker.position.copy(hover.worldPoint);
          (directMarker.material as THREE.MeshBasicMaterial).color.setHex(hover.kind === "control" ? 0x76ead1 : hover.kind === "segment" ? 0xffc107 : 0xb78cff);
          directMarker.scale.setScalar(hover.kind === "control" ? 1 : 0.8);
        } else if (brepHover) {
          directMarker.position.copy(brepHover.worldPoint);
          (directMarker.material as THREE.MeshBasicMaterial).color.setHex(brepHover.markerColor);
          directMarker.scale.setScalar(1);
        }
        return;
      }
      if(!sameDocumentVersion(directDrag.version)){cancelDirectPointerRef.current();return;}
      const raw = directWorldPoint(event); if (!raw) return;
      let world = new THREE.Vector3(...raw);
      if (orthoEnabledRef.current) {
        const a = worldToPlane(directDrag.startWorld.toArray() as Vec3, directDragPlane());
        const b = worldToPlane(world.toArray() as Vec3, directDragPlane());
        if (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])) b[1] = a[1]; else b[0] = a[0];
        world = new THREE.Vector3(...planeToWorld(b, directDragPlane()));
      }
      let snapLabel = "Free";
      if (snapEnabledRef.current && !event.altKey) {
        const snapped = querySnap({
          point: world.toArray() as Vec3,
          referencePoint: directDrag.startWorld.toArray() as Vec3,
          entities: directSnapEntitiesRef.current.filter(entity=>entity.objectId!==directDrag!.candidate.objectId),
          plane: directDragPlane(),
          ...snapPreferencesRef.current,
          project: (point) => projectPixels(new THREE.Vector3(...point)).toArray() as [number, number],
        });
        if (Number.isFinite(snapped.screenDistance)) {
          world.set(...snapped.point);
          snapLabel = snapCaption(snapped,cadDocument.objects[snapped.objectId??""]?.name);
        }
      }
      directSnapLabel = snapLabel;
      directDrag.lastWorld.copy(world);
      updateDirectReadout(buildDirectReadout());
      directMarker.position.copy(world);
      // Sketch drags show separate requested and constrained targets in the canvas guide.
      directMarker.visible = !Object.values(cadDocument.features).some(f=>f.output===directDrag!.candidate.objectId&&typeof f.params.sketchId==="string");
      publishDirectGesture("dragging");
    }

    function handleDirectUp(event: PointerEvent) {
      if (!directDrag) return;
      if (event.pointerId !== directDrag.pointerId || directDrag.committed) return;
      directDrag.committed = true;
      const moved = Math.hypot(event.clientX - directDrag.startClient[0], event.clientY - directDrag.startClient[1]) >= 3;
      if (moved) {
        handleDirectMove(event);
        publishDirectGesture("review");
      }else setDirectSession(null);
      try { renderer.domElement.releasePointerCapture(event.pointerId); } catch { /* capture may already be released */ }
      updateDirectReadout("");
      directDrag = null;
      controls.enabled = true;
      if (transformControlsRef.current) transformControlsRef.current.enabled = true;
    }

    function handleDirectKeyDown(event: KeyboardEvent) {
      if(event.key==="Tab"&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&event.target===renderer.domElement&&directSelectModeRef.current&&!directDrag&&!directSessionRef.current&&!targetChoiceRef.current){const first=host?.parentElement?.querySelector<SVGRectElement>('.direct-edit-handles [data-direct-handle][tabindex="0"]');if(first){event.preventDefault();event.stopImmediatePropagation();first.focus();return;}}
      if (isCadKeyboardBlocked(event.target)) return;
      if (!directDrag) return;
      if(event.ctrlKey||event.metaKey||event.altKey)return;
      if (event.key !== "Escape" && event.key !== "Enter" && !/^[0-9.,+\-a-z]$/i.test(event.key) && event.key !== "Backspace") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        try { renderer.domElement.releasePointerCapture(directDrag.pointerId); } catch { /* capture may already be released */ }
        updateDirectReadout("");
        directDrag = null;
        setDirectSession(null);setDirectVisual(undefined);
        directMarker.visible = false;
        controls.enabled = true;
        if (transformControlsRef.current) transformControlsRef.current.enabled = true;
        return;
      }
      if (event.key === "Enter") {
        if (directDrag.numericBuffer) {
          const length = parseLength(directDrag.numericBuffer);
          if(length===null||!Number.isFinite(length)||length<0){updateDirectReadout("Enter a valid displacement with units (for example 20mm) · Esc cancels");return;}
          if (length !== null && Number.isFinite(length) && length >= 0) {
            const start = worldToPlane(directDrag.startWorld.toArray() as Vec3, directDragPlane());
            const current = worldToPlane(directDrag.lastWorld.toArray() as Vec3, directDragPlane());
            const dx = current[0] - start[0], dy = current[1] - start[1];
            const magnitude = Math.hypot(dx, dy);
            if(magnitude<=1e-9){updateDirectReadout("Move the pointer to choose a direction before entering displacement");return;}
            if (magnitude > 1e-9) {
              const point = planeToWorld([start[0] + dx / magnitude * length, start[1] + dy / magnitude * length], directDragPlane());
              directDrag.lastWorld.set(...point);
              directMarker.position.copy(directDrag.lastWorld);
            }
          }
        }
        publishDirectGesture("review");
        directDrag.committed = true;
        try { renderer.domElement.releasePointerCapture(directDrag.pointerId); } catch { /* capture may already be released */ }
        updateDirectReadout("");
        directDrag = null;
        controls.enabled = true;
        if (transformControlsRef.current) transformControlsRef.current.enabled = true;
        return;
      }
      if (event.key === "Backspace") directDrag.numericBuffer = directDrag.numericBuffer.slice(0, -1);
      else directDrag.numericBuffer += event.key === "," ? "." : event.key;
      updateDirectReadout(buildDirectReadout());
      return;
    }

    let selectionStart: { x: number; y: number; additive: boolean; pointerId: number } | null = null;
    let selectionDragging = false;
    const projectBounds = (mesh: RenderObject) => {
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!camera || !renderer) return null;
      const box = new THREE.Box3().setFromObject(mesh);
      if (box.isEmpty()) return null;
      const points: THREE.Vector3[] = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        points.push(new THREE.Vector3(x, y, z).project(camera));
      }
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect) return null;
      const screen = points.map((p) => ({ x: (p.x + 1) * rect.width / 2, y: (1 - p.y) * rect.height / 2 }));
      return { minX: Math.min(...screen.map((p) => p.x)), maxX: Math.max(...screen.map((p) => p.x)), minY: Math.min(...screen.map((p) => p.y)), maxY: Math.max(...screen.map((p) => p.y)) };
    };

    const projectDrawingPoints = (objectId: string): { points: ScreenPoint[]; closed: boolean } | null => {
      const object = cadDocument.objects[objectId];
      const feature = object ? Object.values(cadDocument.features).find((entry) => entry.output === objectId) : undefined;
      if (!object || feature?.type !== "drawing") return null;
      const world = getWorldDrawingGeometry(object, feature);
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!world?.points?.length || !camera || !renderer) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const displayed = ["infinite-line", "ray"].includes(world.kind) ? clipLinearToCamera(world.points.map(p => new THREE.Vector3(...p)), new THREE.Matrix4(), camera, world.kind === "ray").map(p => p.toArray() as Vec3) : world.points;
      const points = displayed.map((point) => {
        const projected = new THREE.Vector3(...point).project(camera);
        return { x: (projected.x + 1) * rect.width / 2, y: (1 - projected.y) * rect.height / 2 };
      });
      return { points, closed: world.kind === "rectangle" || world.kind === "circle" };
    };

    function handlePointerDown(
      event: PointerEvent
    ) {
      const owner = selectionPointerOwner({
        button: event.button,
        drawingActive: Boolean(cornerReviewRef.current || drawingToolRef.current || pointTransformRef.current || patternSessionRef.current || contourSessionRef.current || curveSessionRef.current || angularSessionRef.current || constructionSessionRef.current),
        directSelectActive: directSelectModeRef.current,
        transformHandleActive: Boolean(transformControlsRef.current?.axis),
      });
      if (owner === "navigation" || owner === "drawing") return;
      if (owner === "direct-select") {
        const additive = hasSelectionToggleModifier(event);
        const key = pointerBucketKey(event.clientX, event.clientY);
        const grip=selectedGripAt(event);
        const hits=directSelectionHits(directCandidatesRef.current,pointerPixels(event),projectPixels),nearestDistance=Math.min(...hits.map(h=>h.distance));
        const overlapping=hits.filter(h=>h.distance<=nearestDistance+1);
        if(!additive&&hits.length>1&&(event.altKey||!grip&&new Set(overlapping.map(h=>h.candidate.objectId)).size>1)){
          event.preventDefault();event.stopImmediatePropagation();const cursor=pointerPixels(event);openTargetChoice(hits.map(h=>({objectId:h.candidate.objectId,topologyId:h.candidate.topologyId,kind:h.candidate.kind})),cursor.x,cursor.y);return;
        }
        let candidate = grip??nearestDirectCandidate(event);
        if (!grip&&!additive && key === directOverlapKey && directOverlapSelection) {
          candidate = nearestDirectCandidate(event, directOverlapSelection) ?? candidate;
        }
        directOverlapKey = key;
        directOverlapSelection = candidate
          ? { objectId: candidate.objectId, topologyId: candidate.topologyId }
          : null;
        if (!candidate) {
          const brep = pickBrepSubObject(event);
          if (!brep) { updateSelection(null); directMarker.visible = false; return; }
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!additive || !selectedObjectIdsRef.current.includes(brep.ref.objectId)) updateSelection(brep.ref.objectId, additive);
          onDirectSelectSubObjectRef.current?.(brep.ref, additive);
          directMarker.position.copy(brep.worldPoint);
          directMarker.visible = true;
          (directMarker.material as THREE.MeshBasicMaterial).color.setHex(brep.markerColor);
          directMarker.scale.setScalar(1);
          return;
        }
        if (candidate.kind !== "control") {
          event.preventDefault();
          event.stopImmediatePropagation();
          if(!additive||!selectedObjectIdsRef.current.includes(candidate.objectId))updateSelection(candidate.objectId,additive);
          onDirectSelectSubObjectRef.current?.({ objectId: candidate.objectId, kind: candidate.kind === "segment" ? "drawing-segment" : "drawing-curve", topologyId: candidate.topologyId }, additive);
          directMarker.position.copy(candidate.worldPoint);
          directMarker.visible = true;
          (directMarker.material as THREE.MeshBasicMaterial).color.setHex(candidate.kind === "segment" ? 0xffc107 : 0xb78cff);
        const movableSegment = candidate.kind === "segment";
        if (movableSegment) {
            startDirectDrag(candidate,event);
          }
          return;
        }
        // Consume topology handles before TransformControls, object selection,
        // or OrbitControls can process the same pointer-down.
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!additive || !selectedObjectIdsRef.current.includes(candidate.objectId)) updateSelection(candidate.objectId, additive);
        onDirectSelectSubObjectRef.current?.({ objectId: candidate.objectId, kind: "drawing-control", topologyId: candidate.topologyId }, additive);
        startDirectDrag(candidate,event);
        directMarker.position.copy(candidate.worldPoint);
        directMarker.visible = true;
        controls.enabled = false;
        if (transformControlsRef.current) transformControlsRef.current.enabled = false;
        return;
      }

      // TransformControls owns pointer interaction while an axis/plane handle
      // is hot, but only after direct topology hit-testing has had priority.
      if (owner === "transform") return;

      const currentCamera =
        cameraRef.current;

      const currentRenderer =
        rendererRef.current;

      if (
        !currentCamera ||
        !currentRenderer
      ) {
        return;
      }

      const rect =
        currentRenderer
          .domElement
          .getBoundingClientRect();

      pointer.x =
        (
          (
            event.clientX -
            rect.left
          ) /
          rect.width
        ) *
          2 -
        1;

      pointer.y =
        -(
          (
            event.clientY -
            rect.top
          ) /
          rect.height
        ) *
          2 +
        1;

      raycaster.setFromCamera(
        pointer,
        currentCamera
      );

      /*
       * Ignore invisible and
       * locked-layer objects.
       */
      const selectableMeshes =
        Array.from(
          meshesRef.current.entries()
        )
          .filter(
            ([
              objectId,
              mesh,
            ]) => {
              if (
                !mesh.visible
              ) {
                return false;
              }

              const cadObject =
                cadDocument.objects[
                  objectId
                ];

              if (
                !cadObject
              ) {
                return false;
              }

              const layer =
                cadDocument.layers[
                  cadObject.layerId
                ];

              return !(
                layer?.locked ??
                false
              );
            }
          )
          .map(
            ([, mesh]) =>
              mesh
          );

      const hits = pickRenderObjects(raycaster, selectableMeshes);

      // Begin CAD window/crossing selection from empty viewport space. The
      // direction is determined on pointer-up: left-to-right is a strict
      // window, right-to-left is an intersecting/crossing selection.
      if (hits.length === 0) {
        const frameHits = raycaster.intersectObjects(Array.from(artboardMeshesRef.current.values()), false);
        const frameHit = frameHits.find(hit => hit.object.userData.artboardId === activeArtboardId) ?? frameHits[0];
        const artboardId = frameHit?.object.userData.artboardId as string | undefined;
        if (artboardId) {
          event.preventDefault();
          event.stopImmediatePropagation();
          onSelectArtboardRef.current?.(artboardId);
          return;
        }
        selectionStart = { x: event.clientX - rect.left, y: event.clientY - rect.top, additive: hasSelectionToggleModifier(event), pointerId: event.pointerId };
        selectionDragging = false;
        currentRenderer.domElement.setPointerCapture(event.pointerId);
        return;
      }

      const candidates = uniqueSelectionCandidates(hits.map((hit) => hit.object.userData.cadObjectId as string | undefined));
      const cycled = cycleSelectionCandidate({
        candidates,
        pointerKey: pointerBucketKey(event.clientX, event.clientY),
        previousKey: overlapKey,
        previousIndex: overlapIndex,
        toggleModifier: hasSelectionToggleModifier(event),
      });
      overlapKey = cycled.nextKey;
      overlapIndex = cycled.nextIndex;
      const objectId = cycled.objectId ??
        hits[0].object
          .userData
          .cadObjectId as
          | string
          | undefined;

      if (!objectId) {
        updateSelection(
          null
        );

        return;
      }

        updateSelection(objectId, hasSelectionToggleModifier(event));
    }

    function handleSelectionMove(event: PointerEvent) {
      if (!selectionStart || event.pointerId !== selectionStart.pointerId) return;
      const renderer = rendererRef.current;
      const rect = renderer?.domElement.getBoundingClientRect(); if (!rect) return;
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const dx = x - selectionStart.x, dy = y - selectionStart.y;
      if (!selectionDragging && Math.hypot(dx, dy) < 4) return;
      selectionDragging = true;
      const left = Math.min(selectionStart.x, x), top = Math.min(selectionStart.y, y);
      setSelectionBox({ x: left, y: top, width: Math.abs(dx), height: Math.abs(dy), crossing: dx < 0 });
    }

    function handleSelectionUp(event: PointerEvent) {
      if (!selectionStart || event.pointerId !== selectionStart.pointerId) return;
      const start = selectionStart; selectionStart = null;
      const wasDragging = selectionDragging;
      selectionDragging = false;
      const renderer = rendererRef.current;
      try { renderer?.domElement.releasePointerCapture(event.pointerId); } catch { /* capture may already be released */ }
      const rect = renderer?.domElement.getBoundingClientRect();
      if (!rect) { setSelectionBox(null); return; }
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      if (!wasDragging) { setSelectionBox(null); updateSelection(null, false); return; }
      const left = Math.min(start.x, x), right = Math.max(start.x, x), top = Math.min(start.y, y), bottom = Math.max(start.y, y);
      const crossing = x < start.x;
      const selectionRect = { left, right, top, bottom };
      const featureByOutput = new Map(Object.values(cadDocument.features).map((feature) => [feature.output, feature]));
      const ids: string[] = [];
      for (const [id, mesh] of meshesRef.current) {
        if (!mesh.visible) continue;
        const object = cadDocument.objects[id]; const layer = object ? cadDocument.layers[object.layerId] : undefined;
        if (!object || layer?.locked || layer?.visible === false) continue;
        const feature = featureByOutput.get(id);
        if (feature?.type === "drawing") {
          if (!crossing && ["infinite-line", "ray"].includes(String(feature.params.kind))) continue;
          const projectedDrawing = projectDrawingPoints(id);
          if (projectedDrawing && matchesSelectionWindow(projectedDrawing.points, selectionRect, crossing ? "crossing" : "window", projectedDrawing.closed)) ids.push(id);
          continue;
        }
        const bounds = projectBounds(mesh); if (!bounds) continue;
        const contained = bounds.minX >= left && bounds.maxX <= right && bounds.minY >= top && bounds.maxY <= bottom;
        const intersects = bounds.maxX >= left && bounds.minX <= right && bounds.maxY >= top && bounds.minY <= bottom;
        if (crossing ? intersects : contained) ids.push(id);
      }
      setSelectionBox(null);
      onSelectObjectsRef.current?.(ids, start.additive);
    }

    function handleContextMenu(event: MouseEvent) {
      event.preventDefault();
      const rect = renderer.domElement.getBoundingClientRect();
      const currentCamera = cameraRef.current;
      let targetId: string | undefined;
      if (currentCamera) {
        pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, currentCamera);
        const selectableMeshes = Array.from(meshesRef.current.entries())
          .filter(([objectId, mesh]) => {
            const object = cadDocument.objects[objectId];
            const layer = object ? cadDocument.layers[object.layerId] : undefined;
            return mesh.visible && Boolean(object) && layer?.visible !== false && !layer?.locked;
          })
          .map(([, mesh]) => mesh);
        targetId = raycaster.intersectObjects(selectableMeshes, true)[0]?.object.userData.cadObjectId as string | undefined;
      }
      // Right-clicking an unselected object makes it the context target. This
      // keeps destructive/contextual commands from accidentally acting on a
      // previously selected object while preserving multi-selection menus.
      if (targetId && !selectedObjectIdsRef.current.includes(targetId)) onSelectObjectRef.current?.(targetId, false);
      setContextMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, kind: targetId || selectedObjectIdsRef.current.length ? "object" : "view" });
    }

    renderer.domElement
      .addEventListener(
        "pointerdown",
        handlePointerDown
      );
    renderer.domElement.addEventListener("contextmenu", handleContextMenu);
    renderer.domElement.addEventListener("pointermove", handleDirectMove);
    renderer.domElement.addEventListener("pointermove", handleSelectionMove);
    renderer.domElement.addEventListener("pointerup", handleDirectUp);
    const cancelDirectGesture=()=>{if(directDrag)closeDirectEdit();};
    const lostDirectCapture=()=>{if(directDrag&&!directDrag.committed)closeDirectEdit();};
    renderer.domElement.addEventListener("pointercancel",cancelDirectGesture);
    renderer.domElement.addEventListener("lostpointercapture",lostDirectCapture);
    renderer.domElement.addEventListener("pointerup", handleSelectionUp);
    window.addEventListener("keydown", handleDirectKeyDown, true);

    function resize() {
      const currentHost =
        hostRef.current;

      if (!currentHost) {
        return;
      }

      const width =
        currentHost.clientWidth;

      const height =
        currentHost.clientHeight;

      if (
        width <= 0 ||
        height <= 0
      ) {
        return;
      }

      const aspect = width / height;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const orthoHeight = orthographicCamera.top - orthographicCamera.bottom;
      orthographicCamera.left = -orthoHeight * aspect / 2;
      orthographicCamera.right = orthoHeight * aspect / 2;
      orthographicCamera.updateProjectionMatrix();

      renderer.setSize(
        width,
        height
      );
    }

    window.addEventListener(
      "resize",
      resize
    );

    /*
     * Also react when panels
     * change viewport size.
     */
    const resizeObserver =
      new ResizeObserver(
        resize
      );

    resizeObserver.observe(
      host
    );

    let disposed =
      false;

    let frameId = 0;

    function render() {
      if (disposed) {
        return;
      }

      controls.update();

      const activeCamera = cameraRef.current ?? camera;
      const viewScale = activeCamera instanceof THREE.OrthographicCamera
        ? (activeCamera.top - activeCamera.bottom) / activeCamera.zoom
        : activeCamera.position.distanceTo(controls.target);
      const minorStep = Math.max(0.01, 10 ** Math.floor(Math.log10(Math.max(viewScale, 0.01) / 10)));
      const fadeDistance = Math.max(viewScale * 4, minorStep * 40);
      const workPlane = activeWorkPlaneRef.current;
      const targetInPlane = worldToPlane(controls.target.toArray() as Vec3, workPlane);
      const gridCenter = planeToWorld([
        Math.round(targetInPlane[0] / minorStep) * minorStep,
        Math.round(targetInPlane[1] / minorStep) * minorStep,
      ], workPlane);
      grid.position.fromArray(gridCenter).addScaledVector(new THREE.Vector3(...workPlane.normal), -0.002);
      grid.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...workPlane.xAxis),
        new THREE.Vector3(...workPlane.yAxis),
        new THREE.Vector3(...workPlane.normal),
      ));
      grid.scale.setScalar(fadeDistance);
      grid.material.uniforms.minorStep.value = minorStep;
      grid.material.uniforms.majorStep.value = minorStep * 10;
      grid.material.uniforms.fadeDistance.value = fadeDistance;
      grid.material.uniforms.gridOrigin.value.fromArray(workPlane.origin);
      grid.material.uniforms.planeXAxis.value.fromArray(workPlane.xAxis);
      grid.material.uniforms.planeYAxis.value.fromArray(workPlane.yAxis);

      renderer.render(
        scene,
        activeCamera
      );

      frameId =
        requestAnimationFrame(
          render
        );
    }

    render();

    return () => {
      disposed =
        true;

      cancelAnimationFrame(
        frameId
      );

      resizeObserver.disconnect();

      window.removeEventListener(
        "resize",
        resize
      );

      renderer.domElement
        .removeEventListener(
          "pointerdown",
          handlePointerDown
        );
      renderer.domElement.removeEventListener("contextmenu", handleContextMenu);
      renderer.domElement.removeEventListener("pointerdown", handleNavigationPointerDown, true);
      renderer.domElement.removeEventListener("pointerup", handleNavigationPointerUp, true);
      renderer.domElement.removeEventListener("pointercancel", handleNavigationPointerCancel, true);
      renderer.domElement.removeEventListener("pointermove", handleDirectMove);
      renderer.domElement.removeEventListener("pointermove", handleSelectionMove);
      renderer.domElement.removeEventListener("pointerup", handleDirectUp);
      renderer.domElement.removeEventListener("pointercancel",cancelDirectGesture);
      renderer.domElement.removeEventListener("lostpointercapture",lostDirectCapture);
      renderer.domElement.removeEventListener("pointerup", handleSelectionUp);
      window.removeEventListener("keydown", handleDirectKeyDown, true);
      scene.remove(directMarker);
      scene.remove(selectedDirectHandles);
      cancelDirectPointerRef.current=()=>{};
      beginKeyboardGripRef.current=()=>{};chooseTargetRef.current=()=>{};
      if (directMarkerRef.current === directMarker) directMarkerRef.current = null;
      if (selectedDirectHandlesRef.current === selectedDirectHandles) selectedDirectHandlesRef.current = null;
      directMarker.geometry.dispose();
      (directMarker.material as THREE.Material).dispose();
      selectedDirectHandles.geometry.dispose();
      (selectedDirectHandles.material as THREE.Material).dispose();

      controls.dispose();
      transformControls.detach();
      transformControls.dispose();
      scene.remove(transformHelper);
      scene.remove(selectionBoundsHelper);
      selectionBoundsHelper.geometry.dispose();
      (selectionBoundsHelper.material as THREE.Material).dispose();
      if (selectionBoundsHelperRef.current === selectionBoundsHelper) selectionBoundsHelperRef.current = null;

      for (
        const mesh
        of meshesRef.current.values()
      ) {
        scene.remove(
          mesh
        );

        disposeMesh(
          mesh
        );
      }

      meshesRef.current.clear();

      grid.geometry.dispose();
      grid.material.dispose();

      renderer.dispose();

      renderer.domElement.remove();

      sceneRef.current =
        null;
      setSceneReady(false);

      cameraRef.current =
        null;

      perspectiveCameraRef.current = null;
      orthographicCameraRef.current = null;
      gridRef.current = null;

      rendererRef.current =
        null;

      controlsRef.current =
        null;
      transformControlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const grid = gridRef.current;
    if (grid) grid.visible = gridVisible;
  }, [gridVisible]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!sceneReady || !scene) return;
    const group = new THREE.Group();
    group.name = "CAD Artboards";
    const meshes = new Map<string, THREE.Mesh>();
    for (const board of artboardsForCanvas(Object.values(cadDocument.artboards ?? {}), workspaceMode, activeWorkPlane)) {
      const corners = artboardWorldCorners(board).map(point => new THREE.Vector3(...point));
      const faceGeometry = new THREE.BufferGeometry();
      faceGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
        ...corners[0].toArray(), ...corners[1].toArray(), ...corners[2].toArray(),
        ...corners[0].toArray(), ...corners[2].toArray(), ...corners[3].toArray(),
      ], 3));
      faceGeometry.computeVertexNormals();
      const faceMaterial = new THREE.MeshBasicMaterial({ color: board.background, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false });
      const face = new THREE.Mesh(faceGeometry, faceMaterial);
      face.name = `Artboard canvas · ${board.name}`;
      face.userData.artboardId = board.id;
      face.renderOrder = -2;
      group.add(face);
      meshes.set(board.id, face);

      const outlineGeometry = new THREE.BufferGeometry().setFromPoints([...corners, corners[0]]);
      const outlineMaterial = new THREE.LineBasicMaterial({ color: board.id === activeArtboardId ? 0x28a3ff : board.locked ? 0x798292 : 0x56677d, depthTest: false, depthWrite: false, transparent: true, opacity: board.id === activeArtboardId ? 1 : 0.8 });
      const outline = new THREE.Line(outlineGeometry, outlineMaterial);
      outline.name = `Artboard frame · ${board.name}`;
      outline.renderOrder = 2;
      group.add(outline);
    }
    scene.add(group);
    artboardMeshesRef.current = meshes;
    return () => {
      scene.remove(group);
      group.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
      });
      if (artboardMeshesRef.current === meshes) artboardMeshesRef.current = new Map();
    };
  }, [sceneReady, documentRevision, activeArtboardId, workspaceMode, activeWorkPlane]);

  useEffect(() => {
    const current = cameraRef.current;
    const perspective = perspectiveCameraRef.current;
    const orthographic = orthographicCameraRef.current;
    const controls = controlsRef.current;
    const host = hostRef.current;
    if (!current || !perspective || !orthographic || !controls || !host) return;

    // 2D is always orthographic. Keeping this invariant at the viewport
    // boundary also covers a transient render where the parent projection
    // state and workspace state update in different React commits.
    const effectiveProjection = workspaceMode === "2d" ? "orthographic" : projectionMode;
    const next: ViewCamera = effectiveProjection === "perspective" ? perspective : orthographic;
    if (current === next) return;

    const aspect = Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1);
    const direction = current.position.clone().sub(controls.target).normalize();
    if (next === orthographic && current === perspective) {
      const distance = perspective.position.distanceTo(controls.target);
      const halfHeight = Math.max(distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2), 0.1);
      orthographic.left = -halfHeight * aspect;
      orthographic.right = halfHeight * aspect;
      orthographic.top = halfHeight;
      orthographic.bottom = -halfHeight;
      orthographic.zoom = 1;
      orthographic.position.copy(perspective.position);
    } else if (next === perspective && current === orthographic) {
      const visibleHeight = (orthographic.top - orthographic.bottom) / orthographic.zoom;
      const distance = visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2));
      perspective.position.copy(controls.target).addScaledVector(direction, distance);
      perspective.aspect = aspect;
    }
    next.up.copy(current.up);
    next.quaternion.copy(current.quaternion);
    next.near = current.near;
    next.far = current.far;
    next.updateProjectionMatrix();
    controls.object = next;
    if (transformControlsRef.current) transformControlsRef.current.camera = next;
    cameraRef.current = next;
    controls.update();
  }, [projectionMode, workspaceMode]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const previous = cameraWorkspaceRef.current;
    const workspaceChanged = previous.mode !== workspaceMode;
    const planeChanged = previous.plane !== activeWorkPlane;
    cameraWorkspaceRef.current = { mode: workspaceMode, plane: activeWorkPlane };
    controls.enableRotate = workspaceMode === "3d";
    if (!workspaceChanged && !(workspaceMode === "2d" && planeChanged)) return;

    const currentDirection = camera.position.clone().sub(controls.target);
    const currentDistance = Math.max(currentDirection.length(), 1);
    currentDirection.normalize();
    if (workspaceMode === "2d" && workspaceChanged) {
      saved3dViewRef.current = { direction: currentDirection.clone(), distance: currentDistance };
    }

    const plane = WORK_PLANES[activeWorkPlane];
    const direction = workspaceMode === "2d"
      ? new THREE.Vector3(...plane.normal)
      : saved3dViewRef.current?.direction.clone() ?? new THREE.Vector3(1, -1, 1).normalize();
    const distance = workspaceMode === "3d" ? saved3dViewRef.current?.distance ?? currentDistance : currentDistance;
    const targetPosition = controls.target.clone().addScaledVector(direction, distance);
    const targetUp = workspaceMode === "2d" ? new THREE.Vector3(...plane.yAxis) : new THREE.Vector3(0, 0, 1);
    const startPosition = camera.position.clone();
    const startUp = camera.up.clone();
    const duration = workspaceTransitionDuration();
    const dampingWasEnabled = controls.enableDamping;
    const controlsWasEnabled = controls.enabled;
    controls.enableDamping = false;
    // Orbit/pan input must not race the transition animation. Restore the
    // exact prior enabled state on completion or cancellation.
    controls.enabled = false;
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      controls.enableDamping = dampingWasEnabled;
      controls.enabled = controlsWasEnabled;
      if (cancelCameraTransitionRef.current === stop) cancelCameraTransitionRef.current = null;
    };
    cancelCameraTransitionRef.current = stop;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
      const eased = easeWorkspaceTransition(progress);
      camera.position.lerpVectors(startPosition, targetPosition, eased);
      camera.up.lerpVectors(startUp, targetUp, eased).normalize();
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.update();
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        camera.position.copy(targetPosition);
        camera.up.copy(targetUp);
        camera.lookAt(controls.target);
        stop();
        controls.enableRotate = workspaceMode === "3d";
        controls.update();
      }
    };
    frame = requestAnimationFrame(animate);
    return stop;
  }, [workspaceMode, activeWorkPlane]);

  useEffect(() => {
    if (!viewAction) return;
    switch (viewAction.type) {
      case "focus":
        rendererRef.current?.domElement.focus();
        break;
      case "reset-interaction":
        // Retain reviewed handle/dimension input for explicit stale recovery.
        // Document version invalidation blocks Apply and removes its ghosts.
        cancelDirectPointerRef.current(); setDirectVisual(undefined);
        setTargetChoice(null); setFocusTarget(undefined);
        setContextMenu(null);
        rendererRef.current?.domElement.focus();
        break;
      case "fit-all":
        fitMeshes();
        break;
      case "fit-selection":
        if (selectedObjectIdsRef.current.length) fitMeshes(new Set(selectedObjectIdsRef.current));
        break;
      case "fit-active-artboard":
        fitArtboard(viewAction.artboardId ?? activeArtboardId ?? undefined);
        break;
      case "fit-visible-artboards":
        fitArtboard();
        break;
      case "top":
      case "front":
      case "right":
      case "isometric":
        setStandardView(viewAction.type);
        break;
    }
  }, [viewAction]);

  useEffect(() => {
    syncTransformControl();
  }, [selectedObjectId, selectedObjectIds, transformMode, documentRevision, workspaceMode, activeWorkPlane]);

  /*
   * Synchronize CadDocument
   * into Three.js meshes.
   */
  useEffect(() => {
    let cancelled =
      false;

    // Direct-edit markers are transient viewport feedback. A document change
    // can hide, lock, delete, undo, or replace their source topology, so never
    // carry the old marker across a document synchronization boundary.
    if (directMarkerRef.current) directMarkerRef.current.visible = false;

    async function syncDocument() {
      const syncStartedAt = performance.now();
      let remeshedCount = 0;
      let removedCount = 0;
      let transformUpdateCount = 0;
      let visibilityUpdateCount = 0;
      const scene =
        sceneRef.current;

      const camera =
        cameraRef.current;

      const controls =
        controlsRef.current;

      if (
        !scene ||
        !camera ||
        !controls
      ) {
        return;
      }

      // Retained sources belong to the feature tree. Explicitly showing one
      // makes it editable in the scene without promoting it to a final body.
      const objectIds = new Set([
        ...cadDocument.rootObjects,
        ...Object.values(cadDocument.objects).filter(object => object.visible).map(object => object.id),
      ]);

      const featuresByOutput = new Map(
        Object.values(cadDocument.features).map(
          (feature) => [feature.output, feature]
        )
      );

      /*
       * Remove meshes that are no longer
       * represented by the document.
       */
      for (
        const [
          objectId,
          mesh,
        ]
        of Array.from(
          meshesRef.current.entries()
        )
      ) {
        const object = cadDocument.objects[objectId];
        const feature = featuresByOutput.get(objectId);
        const renderable =
          objectIds.has(objectId) &&
          Boolean(object) &&
          (
            objectId === "demo-part" ||
            feature?.type === "primitive" || feature?.type === "boolean" || feature?.type === "drawing" || feature?.type === "drafting" || feature?.type === "dimension" || feature?.type === "extrude" || feature?.type === "fillet" || feature?.type === "chamfer" || feature?.type === "revolve" || feature?.type === "sweep" || feature?.type === "loft" || feature?.type === "image"
          );

        if (renderable) {
          continue;
        }

        scene.remove(
          mesh
        );

        disposeMesh(
          mesh
        );

        meshesRef.current.delete(
          objectId
        );
        removedCount += 1;
      }

      /*
       * Build demo part only once.
       */
      if (
        cadDocument.objects["demo-part"] &&
        !meshesRef.current.has(
          "demo-part"
        )
      ) {
        const meshData = await buildDemoPartMesh();

        if (cancelled) {
          return;
        }

        const demoMesh =
          createThreeMesh(
            "demo-part",
            meshData
          );

        demoMesh.userData.featureSignature =
          "seeded-brep-v1";

        meshesRef.current.set(
          "demo-part",
          demoMesh
        );

        scene.add(
          demoMesh
        );
        remeshedCount += 1;

        if (!firstGeometryReadyRef.current) {
          firstGeometryReadyRef.current = true;
          performance.mark("agent-webcad:first-geometry-ready", {
            detail: { objectId: "demo-part" },
          });
        }

        fitMeshes();
      }

      /*
       * Build document-generated
       * primitive objects.
       */
      for (
        const objectId
        of objectIds
      ) {
        if (
          objectId ===
          "demo-part"
        ) {
          continue;
        }

        const cadObject =
          cadDocument.objects[
            objectId
          ];

        if (!cadObject) {
          continue;
        }

        const feature =
          featuresByOutput.get(
            objectId
          );

        if (
          !feature ||
          (feature.type !== "primitive" && feature.type !== "boolean" && feature.type !== "drawing" && feature.type !== "drafting" && feature.type !== "dimension" && feature.type !== "extrude" && feature.type !== "fillet" && feature.type !== "chamfer" && feature.type !== "revolve" && feature.type !== "sweep" && feature.type !== "loft" && feature.type !== "image")
        ) {
          continue;
        }

        const featureSignature =
          JSON.stringify(
            {params:feature.params,style:cadDocument.layers[cadObject.layerId]?.style,blocks:feature.type==="drafting"?cadDocument.blocks:undefined,raster:feature.type==="image"?cadDocument.rasterAssets?.[String(feature.params.assetId)]?.contentHash:undefined}
          );

        const existingMesh =
          meshesRef.current.get(
            objectId
          );

        const layer = cadDocument.layers[cadObject.layerId];
        const isolated = isolatedObjectIdsRef.current;
        const effectivelyVisible = cadObject.visible && (layer?.visible ?? true) && (!isolated || isolated.has(objectId)) && (constructionVisible || !feature.params.construction);

        // Hidden objects that have never been displayed do not need kernel or
        // GPU work yet. Showing them later naturally schedules their first mesh.
        if (!existingMesh && !effectivelyVisible) {
          continue;
        }

        if (
          existingMesh?.userData.featureSignature ===
          featureSignature
        ) {
          continue;
        }

        if (existingMesh) {
          scene.remove(existingMesh);
          disposeMesh(existingMesh);
          meshesRef.current.delete(objectId);
        }

        const mesh = feature.type === "image"
          ? createImageSceneObject(objectId, cadDocument)
          : feature.type === "drawing"
          ? createDrawingSceneObject(objectId, feature.params,undefined,layerStyle(layer))
          : feature.type === "drafting"
            ? createDraftingRenderObject(objectId,cadDocument)
          : feature.type === "dimension"
            ? createDimensionRenderObject(objectId, feature.params)
            : createThreeMesh(objectId, feature.type === "boolean"
              ? await buildBooleanMesh(feature.params)
              : feature.type === "extrude"
                ? await buildExtrudeMesh(feature.params)
                : feature.type === "fillet"
                  ? await buildFilletMesh(feature.params)
                  : feature.type === "chamfer"
                    ? await buildChamferMesh(feature.params)
                    : feature.type === "revolve"
                      ? await buildRevolveMesh(feature.params)
                      : feature.type === "sweep"
                        ? await buildSweepMesh(feature.params)
                        : feature.type === "loft"
                          ? await buildLoftMesh(feature.params)
                          : await buildPrimitiveMesh(feature.params));

        if (cancelled) return;

        // Invalid dimension params resolve to no render object; the document
        // keeps the feature and Apply/inspector paths report the reason.
        if (!mesh) {
          continue;
        }

        mesh.userData.featureSignature =
          featureSignature;

        meshesRef.current.set(
          objectId,
          mesh
        );

        scene.add(
          mesh
        );
        remeshedCount += 1;

        if (!firstGeometryReadyRef.current) {
          firstGeometryReadyRef.current = true;
          performance.mark("agent-webcad:first-geometry-ready", {
            detail: { objectId },
          });
        }
      }

      /* Document placement and visibility are authoritative. */
      for (
        const [
          objectId,
          mesh,
        ]
        of meshesRef.current
      ) {
        const cadObject =
          cadDocument.objects[
            objectId
          ];

        if (!cadObject) {
          continue;
        }

        const transform = getObjectTransform(cadObject, featuresByOutput.get(objectId));
        const transformSignature = JSON.stringify(transform);
        if (mesh.userData.transformSignature !== transformSignature) {
          const drawingPivot = Array.isArray(mesh.userData.drawingOrigin)
            ? new THREE.Vector3(...mesh.userData.drawingOrigin as Vec3)
            : new THREE.Vector3();
          mesh.position.fromArray(transform.translation).add(drawingPivot);
          mesh.rotation.set(
            THREE.MathUtils.degToRad(transform.rotation[0]),
            THREE.MathUtils.degToRad(transform.rotation[1]),
            THREE.MathUtils.degToRad(transform.rotation[2]),
            "XYZ",
          );
          mesh.scale.fromArray(transform.scale);
          mesh.updateMatrixWorld();
          mesh.userData.transformSignature = transformSignature;
          transformUpdateCount += 1;
        }

        const layer =
          cadDocument.layers[
            cadObject.layerId
          ];

        const isolated = isolatedObjectIdsRef.current;
        const visible =
          cadObject.visible &&
          (
            layer?.visible ??
            true
          ) && (!isolated || isolated.has(objectId)) && (constructionVisible || !featuresByOutput.get(objectId)?.params.construction);
        if (mesh.visible !== visible) {
          mesh.visible = visible;
          visibilityUpdateCount += 1;
        }
      }

      /*
       * Selection color LAST.
       */
      // Pointer movement reads these document/scene snapshots. Geometry and
      // visibility changes refresh them once, never on each hover or drag frame.
      if (directSelectModeRef.current) {
        directCandidatesRef.current = buildDirectSelectionCandidates(cadDocument, meshesRef.current);
        directSnapEntitiesRef.current = buildDirectSnapEntities();
      }
      applySelectionColor();
      updateSelectedDirectHandles();
      syncTransformControl();
      performance.measure("agent-webcad:viewport-sync", {
        start: syncStartedAt,
        end: performance.now(),
        detail: {
          documentRevision,
          documentObjects: cadDocument.rootObjects.length,
          sceneMeshes: meshesRef.current.size,
          remeshedCount,
          removedCount,
          transformUpdateCount,
          visibilityUpdateCount,
        },
      });
      if (import.meta.env.DEV && (remeshedCount > 0 || transformUpdateCount > 0 || visibilityUpdateCount > 0)) {
        console.info("[agent-webcad:perf]", JSON.stringify({
          viewportSyncMs: Number((performance.now() - syncStartedAt).toFixed(1)),
          documentObjects: cadDocument.rootObjects.length,
          sceneMeshes: meshesRef.current.size,
          remeshedCount,
          transformUpdateCount,
          visibilityUpdateCount,
        }));
      }
    }

    syncDocument().catch(
      console.error
    );

    return () => {
      cancelled =
        true;
    };
  }, [documentRevision, isolatedObjectIds, constructionVisible]);

  useEffect(() => {
    for (const [objectId, mesh] of meshesRef.current) {
      const feature = Object.values(cadDocument.features).find(entry => entry.output === objectId && entry.type === "image");
      if (!feature) continue;
      const saved = feature.params.crop as import("@agent-webcad/cad-document").CadImageCrop | undefined;
      const savedMask = (feature.params as { mask?: CadImageMask }).mask ?? "rect";
      const savedOpacity = (feature.params as { opacity?: number }).opacity ?? 1;
      const savedAdjustments = (feature.params as { adjustments?: import("@agent-webcad/cad-document").CadImageAdjustments }).adjustments ?? { brightness: 0, contrast: 0, saturation: 0 };
      const fallback = { x: 0, y: 0, width: 1, height: 1 };
      updateImageSceneCrop(mesh, imageCropPreview?.objectId === objectId ? imageCropPreview.crop : saved ?? fallback,
        imageCropPreview?.objectId === objectId ? imageCropPreview.mask : savedMask,
        imageCropPreview?.objectId === objectId ? imageCropPreview.opacity : savedOpacity,
        imageCropEditingId === objectId || imageCropPreview?.objectId === objectId && imageCropPreview.revealSource,
        imageCropPreview?.objectId === objectId ? imageCropPreview.adjustments : savedAdjustments,
        imageCropPreview?.objectId === objectId && imageCropPreview.asset ? imageCropPreview.asset : cadDocument.rasterAssets?.[String(feature.params.assetId)]);
    }
  }, [imageCropPreview, imageCropEditingId, documentRevision, sceneReady]);

  /*
   * CAD crosshair for pointer tools. Full-extent work-plane lines follow the
   * raw cursor (unsnapped, like AutoCAD); the OS cursor hides while active.
   */
  useEffect(() => {
    const scene = sceneRef.current, renderer = rendererRef.current, controls = controlsRef.current;
    if (!scene || !renderer || !controls || !sceneReady) return;
    if (!drawingTool && !measurementTool && !lineEditTool) return;
    const plane = WORK_PLANES[activeWorkPlane];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const SPAN = 5000;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    ]);
    const crosshair = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x9aa9b5, transparent: true, opacity: 0.35, depthTest: false }),
    );
    crosshair.renderOrder = 4;
    crosshair.frustumCulled = false;
    crosshair.visible = false;
    scene.add(crosshair);
    const domElement = renderer.domElement;
    const previousCursor = domElement.style.cursor;
    domElement.style.cursor = "none";
    function move(event: PointerEvent) {
      const camera = cameraRef.current;
      if (!camera) return;
      const rect = domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const point = intersectRayWithWorkPlane(raycaster.ray.origin.toArray() as Vec3, raycaster.ray.direction.toArray() as Vec3, plane);
      if (!point) {
        crosshair.visible = false;
        return;
      }
      const center = new THREE.Vector3(...point);
      const xAxis = new THREE.Vector3(...plane.xAxis);
      const yAxis = new THREE.Vector3(...plane.yAxis);
      geometry.setFromPoints([
        center.clone().addScaledVector(xAxis, -SPAN), center.clone().addScaledVector(xAxis, SPAN),
        center.clone().addScaledVector(yAxis, -SPAN), center.clone().addScaledVector(yAxis, SPAN),
      ]);
      crosshair.visible = true;
    }
    function leave() {
      crosshair.visible = false;
      hideCursorTag();
    }
    domElement.addEventListener("pointermove", move);
    domElement.addEventListener("pointerleave", leave);
    return () => {
      domElement.removeEventListener("pointermove", move);
      domElement.removeEventListener("pointerleave", leave);
      domElement.style.cursor = previousCursor;
      scene.remove(crosshair);
      geometry.dispose();
      (crosshair.material as THREE.Material).dispose();
      hideCursorTag();
    };
  }, [drawingTool, measurementTool, lineEditTool, activeWorkPlane, sceneReady]);

  useEffect(() => {
    const scene = sceneRef.current, renderer = rendererRef.current, controls = controlsRef.current;
    if (!scene || !renderer || !controls || !measurementTool) { if (!measurementTool) setToolReadout(""); return; }
    const plane = WORK_PLANES[activeWorkPlane], raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    let first: Vec3 | null = null, hover: Vec3 | null = null;
    controls.enabled = false;
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x62d4bf, depthTest: false }));
    line.renderOrder = 20; scene.add(line);
    const worldPoint = (event: PointerEvent): Vec3 | null => {
      const camera = cameraRef.current; if (!camera) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return intersectRayWithWorkPlane(raycaster.ray.origin.toArray() as Vec3, raycaster.ray.direction.toArray() as Vec3, plane);
    };
    const project = (point: Vec3): [number, number] => { const p = new THREE.Vector3(...point).project(cameraRef.current!); const r = renderer.domElement.getBoundingClientRect(); return [(p.x + 1) * r.width / 2, (1 - p.y) * r.height / 2]; };
    const entities: SnapEntity[] = Object.values(cadDocument.features).flatMap((f) => {
      if (f.type !== "drawing") return [];
      const object = cadDocument.objects[f.output];
      const world = object ? getWorldDrawingGeometry(object, f) : null;
      return world ? [{ objectId: world.objectId, kind: world.kind, points: world.points, center: world.center, radius: world.radius, startAngle: world.startAngle, endAngle: world.endAngle, profileSegments: world.profileSegments }] : [];
    });
    const snapPoint = (raw: Vec3) => snapEnabled ? querySnap({ point: raw, referencePoint: first ?? undefined, entities, plane, ...snapPreferencesRef.current, project })?.point ?? raw : raw;
    const update = (p: Vec3) => { hover = snapPoint(p); const points = first ? [first, hover] : [hover]; line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setFromPoints(points.map((v) => new THREE.Vector3(...v))); setToolReadout(first ? `DISTANCE · ${measurePoints(first, hover, activeWorkPlane).distance.toFixed(2)} mm` : "DISTANCE · pick first point"); };
    const onMove = (e: PointerEvent) => {
      const p = worldPoint(e); if (!p) return; update(p);
      const label = first ? `${measurePoints(first, hover!, activeWorkPlane).distance.toFixed(2)} mm` : "pick first point";
      showCursorTag(e.clientX, e.clientY, `DISTANCE · ${label}`);
    };
    const onDown = (e: PointerEvent) => { if (e.button !== 0) return; const p = worldPoint(e); if (!p) return; const exact = snapPoint(p); if (!first) { first = exact; update(exact); } else { onDistanceMeasure?.(measurePoints(first, exact, activeWorkPlane)); first = null; hover = null; setToolReadout("DISTANCE · measured"); } };
    const onKey = (e: KeyboardEvent) => { if (isCadKeyboardBlocked(e.target)) return; if (e.key === "Escape") { e.preventDefault(); first = null; setToolReadout("DISTANCE · cancelled"); } };
    renderer.domElement.addEventListener("pointermove", onMove); renderer.domElement.addEventListener("pointerdown", onDown); window.addEventListener("keydown", onKey, true);
    return () => { renderer.domElement.removeEventListener("pointermove", onMove); renderer.domElement.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey, true); scene.remove(line); line.geometry.dispose(); (line.material as THREE.Material).dispose(); controls.enabled = true; hideCursorTag(); };
  }, [measurementTool, activeWorkPlane, snapEnabled, onDistanceMeasure]);

  /*
   * Precision drawing is transient until commit. The preview and snap glyph
   * live in Three.js, while the completed entity enters CadDocument through a
   * single create-drawing command supplied by App.
   */
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    const controls = controlsRef.current;
    if (!scene || !renderer || !controls) return;
    if (!drawingTool) { setToolReadout(""); return; }
    const activeRenderer = renderer;
    const activeTool = drawingTool;

    const plane = WORK_PLANES[activeWorkPlane];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const acquired: Vec3[] = [];
    let hoverPoint: Vec3 | null = null;
    let numericBuffer = "";
    let polarLocks = emptyPolarLocks();
    let inputField: "length" | "angle" = "length";
    const sketchBindings: SketchSnapBinding[] = [];
    let suppressAutomaticConstraints = false;
    controls.enabled = false;

    const previewMaterial = new THREE.LineDashedMaterial({ color: 0x62d4bf, dashSize: 0.65, gapSize: 0.35, depthTest: false });
    const preview = new THREE.Line(new THREE.BufferGeometry(), previewMaterial);
    preview.renderOrder = 20;
    scene.add(preview);
    const markerMaterial = new THREE.LineBasicMaterial({ color: 0x76ead1, depthTest: false });
    const marker = new THREE.LineSegments(new THREE.BufferGeometry(), markerMaterial);
    marker.renderOrder = 21;
    marker.visible = false;
    scene.add(marker);

    function setPointer(event: PointerEvent) {
      const rect = activeRenderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    }

    function project(point: Vec3): [number, number] {
      const camera = cameraRef.current;
      if (!camera) return [0, 0];
      const projected = new THREE.Vector3(...point).project(camera);
      const rect = activeRenderer.domElement.getBoundingClientRect();
      return [(projected.x + 1) * rect.width / 2, (1 - projected.y) * rect.height / 2];
    }

    function worldPoint(event: PointerEvent): Vec3 | null {
      const camera = cameraRef.current;
      if (!camera) return null;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      return intersectRayWithWorkPlane(
        raycaster.ray.origin.toArray() as Vec3,
        raycaster.ray.direction.toArray() as Vec3,
        plane,
      );
    }

    function entityTransform(objectId: string) {
      const object = cadDocument.objects[objectId];
      const feature = Object.values(cadDocument.features).find((entry) => entry.output === objectId);
      const transform = object ? getObjectTransform(object, feature) : null;
      if (!transform) return new THREE.Matrix4();
      const planeId = feature?.params.workPlane === "XZ" || feature?.params.workPlane === "YZ" ? feature.params.workPlane : "XY";
      const pivot = feature?.type === "drawing" ? new THREE.Vector3(...drawingRenderOrigin(feature.params, planeId)) : new THREE.Vector3();
      return new THREE.Matrix4().compose(
        pivot.clone().add(new THREE.Vector3(...transform.translation)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number])),
        new THREE.Vector3(...transform.scale),
      ).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    }

    let snapEntityRevision = -1;
    let cachedConstructionVisible = constructionVisibleRef.current;
    let cachedSnapEntities: SnapEntity[] = [];
    function snapEntities(): SnapEntity[] {
      if (snapEntityRevision === cadDocument.revision && cachedConstructionVisible === constructionVisibleRef.current) return cachedSnapEntities;
      const result: SnapEntity[] = [];
      for (const feature of Object.values(cadDocument.features)) {
        if (feature.type !== "drawing") continue;
        const object = cadDocument.objects[feature.output];
        const layer = object ? cadDocument.layers[object.layerId] : undefined;
        if (!object || !object.visible || layer?.visible === false || !constructionVisibleRef.current && feature.params.construction) continue;
        const kind = feature.params.kind;
        if (!(["line", "polyline", "rectangle", "circle", "arc", "point", "infinite-line", "ray"] as unknown[]).includes(kind)) continue;
        const world = getWorldDrawingGeometry(object, feature);
        if (!world) continue;
        // A 2D sketch cannot acquire a point from geometry outside its work
        // plane. Screen-space overlap is not geometric coincidence.
        const onPlane = (point: Vec3) => Math.abs((point[0] - plane.origin[0]) * plane.normal[0] + (point[1] - plane.origin[1]) * plane.normal[1] + (point[2] - plane.origin[2]) * plane.normal[2]) <= 1e-6;
        if (world.points?.some((point) => !onPlane(point)) || world.center && !onPlane(world.center)) continue;
        result.push({
          objectId: object.id,
          kind: kind as SnapEntity["kind"],
          points: world.points,
          center: world.center,
          radius: world.radius,
          startAngle: world.startAngle,
          endAngle: world.endAngle,
          profileSegments: world.profileSegments,
        });
      }
      snapEntityRevision = cadDocument.revision;
      cachedConstructionVisible = constructionVisibleRef.current;
      cachedSnapEntities = result;
      return cachedSnapEntities;
    }

    function constrain(point: Vec3, allowAutoAxes = true) {
      if (acquired.length === 0) return point;
      const start = worldToPlane(acquired[acquired.length - 1], plane);
      const next = worldToPlane(point, plane);
      const autoAxes = allowAutoAxes && !suppressAutomaticConstraints && sketchInputRef.current.sketch && sketchInputRef.current.automaticConstraints && (activeTool === "line" || activeTool === "polyline");
      const a = project(acquired.at(-1)!), b = project(point);
      const inferHorizontal = autoAxes && Math.abs(b[1] - a[1]) <= 6 && Math.abs(b[0] - a[0]) > 12;
      const inferVertical = autoAxes && Math.abs(b[0] - a[0]) <= 6 && Math.abs(b[1] - a[1]) > 12;
      const orthogonal = orthoEnabled ? Math.abs(next[0] - start[0]) >= Math.abs(next[1] - start[1]) ? [next[0], start[1]] as [number, number] : [start[0], next[1]] as [number, number]
        : inferHorizontal ? [next[0], start[1]] as [number, number] : inferVertical ? [start[0], next[1]] as [number, number] : next;
      return planeToWorld(applyPolarLocks(start, orthogonal, polarLocks), plane);
    }

    function markerShape(result: SnapResult, point: Vec3) {
      const camera = cameraRef.current;
      const host = hostRef.current;
      const viewSize = camera instanceof THREE.OrthographicCamera
        ? (camera.top - camera.bottom) / camera.zoom
        : camera ? camera.position.distanceTo(new THREE.Vector3(...point)) : 20;
      const size = viewSize / Math.max(host?.clientHeight ?? 600, 1) * 9;
      const x = new THREE.Vector3(...plane.xAxis).multiplyScalar(size);
      const y = new THREE.Vector3(...plane.yAxis).multiplyScalar(size);
      const p = new THREE.Vector3(...point);
      const vertices: THREE.Vector3[] = [];
      const segment = (a: THREE.Vector3, b: THREE.Vector3) => vertices.push(p.clone().add(a), p.clone().add(b));
      if (result.type === "endpoint" || result.type === "grid") {
        segment(x.clone().add(y), x.clone().sub(y)); segment(x.clone().sub(y), x.clone().negate().sub(y));
        segment(x.clone().negate().sub(y), x.clone().negate().add(y)); segment(x.clone().negate().add(y), x.clone().add(y));
      } else if (result.type === "midpoint") {
        segment(y, x.clone().negate().sub(y)); segment(x.clone().negate().sub(y), x.clone().sub(y)); segment(x.clone().sub(y), y);
      } else if (result.type === "quadrant") {
        segment(x,y);segment(y,x.clone().negate());segment(x.clone().negate(),y.clone().negate());segment(y.clone().negate(),x);
      } else if (result.type === "perpendicular") {
        segment(x.clone().negate(),new THREE.Vector3());segment(new THREE.Vector3(),y);segment(x.clone().negate().multiplyScalar(.5),x.clone().negate().multiplyScalar(.5).add(y.clone().multiplyScalar(.5)));segment(x.clone().negate().multiplyScalar(.5).add(y.clone().multiplyScalar(.5)),y.clone().multiplyScalar(.5));
      } else if (result.type === "center" || result.type === "tangent") {
        for (let index = 0; index < 12; index += 1) {
          const a = index / 12 * Math.PI * 2, b = (index + 1) / 12 * Math.PI * 2;
          segment(x.clone().multiplyScalar(Math.cos(a)).add(y.clone().multiplyScalar(Math.sin(a))), x.clone().multiplyScalar(Math.cos(b)).add(y.clone().multiplyScalar(Math.sin(b))));
        }
      } else {
        segment(x.clone().add(y), x.clone().negate().sub(y)); segment(x.clone().sub(y), x.clone().negate().add(y));
      }
      if(result.type==="tangent")segment(x.clone().negate().add(y),x.clone().add(y));
      if(result.type==="extension"&&Array.isArray(result.metadata?.extensionFrom))vertices.push(new THREE.Vector3(...result.metadata.extensionFrom as Vec3),p.clone());
      marker.geometry.dispose();
      marker.geometry = new THREE.BufferGeometry().setFromPoints(vertices);
      marker.visible = true;
    }

    function previewPoints(point: Vec3) {
      if (activeTool === "line" || activeTool === "polyline") return [...acquired, point];
      if (activeTool === "rectangle" && acquired[0]) {
        const a = worldToPlane(acquired[0], plane), b = worldToPlane(point, plane);
        return [acquired[0], planeToWorld([b[0], a[1]], plane), point, planeToWorld([a[0], b[1]], plane), acquired[0]];
      }
      if (activeTool === "circle" && acquired[0]) {
        const a = worldToPlane(acquired[0], plane), b = worldToPlane(point, plane);
        return drawingRenderPoints({ kind: "circle", center: acquired[0], radius: Math.hypot(b[0] - a[0], b[1] - a[1]) }, activeWorkPlane);
      }
      if (activeTool === "arc" && acquired[0]) {
        const c = worldToPlane(acquired[0], plane);
        const startPoint = acquired[1] ?? point;
        const s = worldToPlane(startPoint, plane), e = worldToPlane(point, plane);
        return drawingRenderPoints({ kind: "arc", center: acquired[0], radius: Math.hypot(s[0] - c[0], s[1] - c[1]), startAngle: Math.atan2(s[1] - c[1], s[0] - c[0]), endAngle: Math.atan2(e[1] - c[1], e[0] - c[0]) }, activeWorkPlane);
      }
      return [];
    }

    function updatePreview(point: Vec3) {
      const points = previewPoints(point);
      preview.geometry.dispose();
      preview.geometry = new THREE.BufferGeometry().setFromPoints(points.map((entry) => new THREE.Vector3(...entry)));
      preview.computeLineDistances();
    }

    function acquirePoint(raw: Vec3, suppressSnap = false) {
      const startedAt = performance.now();
      const snapped = snapEnabled && !suppressSnap ? querySnap({ point: raw, referencePoint: acquired.at(-1), entities: snapEntities(), plane, ...snapPreferencesRef.current, project }) : null;
      performance.measure("agent-webcad:snap-query", { start: startedAt, end: performance.now(), detail: { entityCount: cadDocument.rootObjects.length, result: snapped?.type ?? "disabled" } });
      if (performance.getEntriesByName("agent-webcad:snap-query").length > 200) performance.clearMeasures("agent-webcad:snap-query");
      const onPlane = snapped && Math.abs((snapped.point[0] - plane.origin[0]) * plane.normal[0] + (snapped.point[1] - plane.origin[1]) * plane.normal[1] + (snapped.point[2] - plane.origin[2]) * plane.normal[2]) <= 1e-6;
      const validSnap = snapped && onPlane && Number.isFinite(snapped.screenDistance) ? snapped : null;
      const point = constrain(validSnap ? validSnap.point : raw, !validSnap || !["endpoint", "center"].includes(validSnap.type));
      const retainedSnap = validSnap && Math.hypot(...point.map((value, index) => value - validSnap.point[index])) <= 1e-6 ? validSnap : null;
      if (retainedSnap) markerShape(retainedSnap, point); else marker.visible = false;
      return { point, snap: retainedSnap };
    }

    function commit(params: Record<string, unknown>) {
      const committed = structuredClone({ ...params, workPlane: activeWorkPlane, ...(sketchInputRef.current.sketch ? { sketchSnapBindings: sketchBindings, suppressAutomaticConstraints } : {}) });
      acquired.length = 0; numericBuffer = ""; hoverPoint = null;
      polarLocks = emptyPolarLocks(); inputField = "length";
      sketchBindings.length = 0; suppressAutomaticConstraints = false;
      preview.geometry.dispose(); preview.geometry = new THREE.BufferGeometry(); marker.visible = false;
      setToolReadout(`${activeTool.toUpperCase()} · first point (x,y) · Esc to finish`);
      drawingCallbacksRef.current.onDrawingCommit?.(activeTool, committed);
    }

    function handlePointerMove(event: PointerEvent) {
      suppressAutomaticConstraints = event.altKey;
      const raw = worldPoint(event);
      if (!raw) return;
      const acquiredPoint = acquirePoint(raw,event.altKey);
      hoverPoint = acquiredPoint.point;
      updatePreview(hoverPoint);
      const snapLabel = acquiredPoint.snap ? snapCaption(acquiredPoint.snap,cadDocument.objects[acquiredPoint.snap.objectId??""]?.name) : (orthoEnabled ? "Ortho" : "Free");
      const previous = acquired.at(-1);
      let inference = "";
      if (previous) {
        const a = worldToPlane(previous, plane), b = worldToPlane(hoverPoint, plane);
        const dx = b[0] - a[0], dy = b[1] - a[1];
        if (Math.abs(dy) < 1e-5) inference = " · Horizontal";
        else if (Math.abs(dx) < 1e-5) inference = " · Vertical";
        else inference = ` · ${Math.hypot(dx, dy).toFixed(2)} mm · ${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)}°`;
      }
      const autoHint = sketchInputRef.current.sketch && sketchInputRef.current.automaticConstraints ? suppressAutomaticConstraints ? " · Auto suppressed" : `${inference.includes("Horizontal") || inference.includes("Vertical") ? " · Auto axis" : ""}${sketchSnapBinding(sketchInputRef.current.sketch, acquiredPoint.snap) ? " · Auto Coincident" : ""}` : "";
      setToolReadout(`${activeTool.toUpperCase()} · ${snapLabel}${inference}${autoHint} · ${numericBuffer || worldToPlane(hoverPoint, plane).map((value) => value.toFixed(2)).join(", ")} mm`);
      const tagMeasure = previous ? inference.replace(/^ · /, "") : `${worldToPlane(hoverPoint, plane).map((value) => value.toFixed(2)).join(", ")} mm`;
      showCursorTag(event.clientX, event.clientY, `${snapLabel} · ${tagMeasure}${autoHint}${numericBuffer ? ` · ${numericBuffer}` : ""}`);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      event.preventDefault();
      suppressAutomaticConstraints = event.altKey;
      const raw = worldPoint(event);
      if (!raw) return;
      const acquiredPoint = acquirePoint(raw,event.altKey), point = acquiredPoint.point;
      const binding = sketchInputRef.current.sketch && !event.altKey ? sketchSnapBinding(sketchInputRef.current.sketch, acquiredPoint.snap) : null;
      if (binding && Math.hypot(...point.map((value, index) => value - acquiredPoint.snap!.point[index])) < 1e-6) sketchBindings.push(binding);
      hoverPoint = point;
      if (activeTool === "line") {
        if (!acquired.length) acquired.push(point); else commit({ points: [acquired[0], point] });
      } else if (activeTool === "rectangle") {
        if (!acquired.length) acquired.push(point); else {
          const a = worldToPlane(acquired[0], plane), b = worldToPlane(point, plane);
          commit({ points: [acquired[0], planeToWorld([b[0], a[1]], plane), point, planeToWorld([a[0], b[1]], plane)] });
        }
      } else if (activeTool === "circle") {
        if (!acquired.length) acquired.push(point); else {
          const a = worldToPlane(acquired[0], plane), b = worldToPlane(point, plane);
          commit({ center: acquired[0], radius: Math.hypot(b[0] - a[0], b[1] - a[1]) });
        }
      } else if (activeTool === "arc") {
        acquired.push(point);
        if (acquired.length === 3) {
          const c = worldToPlane(acquired[0], plane), s = worldToPlane(acquired[1], plane), e = worldToPlane(acquired[2], plane);
          commit({ center: acquired[0], radius: Math.hypot(s[0] - c[0], s[1] - c[1]), startAngle: Math.atan2(s[1] - c[1], s[0] - c[0]), endAngle: Math.atan2(e[1] - c[1], e[0] - c[0]) });
        }
      } else {
        if (event.detail >= 2 && acquired.length >= 1) {
          // Double-clicking the first point closes a polyline. Do not persist
          // the closing point twice: profileSegments adds the closing edge
          // from the final point back to the first point for closed paths.
          const closesAtStart = activeTool === "polyline" && acquired[0].every((value, index) => Math.abs(value - point[index]) < 1e-7);
          const points = closesAtStart ? [...acquired] : [...acquired, point];
          commit({ points, closed: closesAtStart });
        } else acquired.push(point);
      }
      numericBuffer = "";
      updatePreview(point);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isCadKeyboardBlocked(event.target)) return;
      if (event.ctrlKey || event.metaKey) return;
      if (event.key === "Alt") { suppressAutomaticConstraints = true; setToolReadout("Auto constraints suppressed · release Alt to restore"); return; }
      if (event.key === "Escape") {
        event.preventDefault();
        if (acquired.length || numericBuffer) {
          acquired.length = 0; numericBuffer = ""; hoverPoint = null; polarLocks = emptyPolarLocks(); inputField = "length"; sketchBindings.length = 0;
          preview.geometry.dispose(); preview.geometry = new THREE.BufferGeometry(); marker.visible = false;
          setToolReadout(`${activeTool.toUpperCase()} · first point (x,y) · Esc to finish`);
        } else drawingCallbacksRef.current.onDrawingCancel?.();
        return;
      }
      if (event.key === "Backspace") { event.preventDefault(); numericBuffer = numericBuffer.slice(0, -1); return; }
      if (event.key === "Tab" && acquired.length) {
        event.preventDefault();
        if (event.shiftKey) polarLocks = emptyPolarLocks();
        else {
          const value = inputField === "length" ? parseLength(numericBuffer) : parseAngle(numericBuffer);
          if (value !== null && (inputField !== "length" || value >= 0)) polarLocks[inputField] = value;
          inputField = inputField === "length" ? "angle" : "length";
        }
        numericBuffer = "";
        if (hoverPoint) { hoverPoint = constrain(hoverPoint); updatePreview(hoverPoint); }
        setToolReadout(`${activeTool.toUpperCase()} · ${inputField} input · length ${polarLocks.length ?? "free"} · angle ${polarLocks.angle ?? "free"} · Shift+Tab unlocks`);
        return;
      }
      if (event.key === "Enter") {
        suppressAutomaticConstraints = event.altKey;
        event.preventDefault();
        if (activeTool === "polyline" && !numericBuffer && acquired.length >= 2 && polarLocks.length === null && polarLocks.angle === null) {
          const first = acquired[0], last = acquired[acquired.length - 1];
          const closed = first.every((value, index) => Math.abs(value - last[index]) < 1e-7);
          const points = closed ? acquired.slice(0, -1) : acquired;
          while (closed && points.length > 2 && first.every((value, index) => Math.abs(value - points[points.length - 1][index]) < 1e-7)) points.pop();
          commit({ points, closed });
          return;
        }
        if (!numericBuffer && polarLocks.length === null && polarLocks.angle === null) return;
        if (acquired.length === 0) {
          const values = parsePointEntry(numericBuffer);
          if (!values) { setToolReadout("Enter first point as x,y (for example 0,0 or 2m,1m)"); return; }
          const point = planeToWorld(values, plane);
          acquired.push(point); hoverPoint = point; numericBuffer = ""; updatePreview(point);
          setToolReadout(`${activeTool.toUpperCase()} · next point or size`); return;
        }
        const coordinateInput = numericBuffer.includes(",") && (activeTool !== "rectangle" || /^[@#]/.test(numericBuffer.trim()));
        const lockedInput = !numericBuffer.includes(",") && !numericBuffer.includes("<") && (polarLocks.length !== null || polarLocks.angle !== null);
        if (coordinateInput || lockedInput) {
          const base = worldToPlane(acquired.at(-1)!, plane), locks = { ...polarLocks };
          if (lockedInput && numericBuffer) {
            const value = inputField === "length" ? parseLength(numericBuffer) : parseAngle(numericBuffer);
            if (value === null) return; locks[inputField] = value;
          }
          const local = parsePointEntry(coordinateInput ? numericBuffer : "", base, hoverPoint ? worldToPlane(hoverPoint, plane) : undefined, locks);
          if (!local) return;
          const exact = planeToWorld(local, plane), first = acquired[0];
          if (activeTool === "line") commit({ points: [first, exact] });
          else if (activeTool === "polyline") { acquired.push(exact); numericBuffer = ""; polarLocks = emptyPolarLocks(); }
          else if (activeTool === "rectangle") { const a = worldToPlane(first, plane); commit({ points: [first, planeToWorld([local[0], a[1]], plane), exact, planeToWorld([a[0], local[1]], plane)] }); }
          else if (activeTool === "circle") { const a = worldToPlane(first, plane); commit({ center: first, radius: Math.hypot(local[0] - a[0], local[1] - a[1]) }); }
          else if (acquired.length === 1) { acquired.push(exact); numericBuffer = ""; polarLocks = emptyPolarLocks(); }
          else { const center = worldToPlane(first, plane), start = worldToPlane(acquired[1], plane); commit({ center: first, radius: Math.hypot(start[0] - center[0], start[1] - center[1]), startAngle: Math.atan2(start[1] - center[1], start[0] - center[0]), endAngle: Math.atan2(local[1] - center[1], local[0] - center[0]) }); }
          hoverPoint = exact; updatePreview(exact); return;
        }
        if (activeTool === "rectangle" && acquired.length === 1) {
          const start = worldToPlane(acquired[0], plane);
          const commaParts = numericBuffer.trim().split(/[,x]/i).map((part) => part.trim()).filter(Boolean);
          let opposite: [number, number];
          if (commaParts.length === 2) {
            const width = parseLength(commaParts[0]), height = parseLength(commaParts[1]);
            if (width === null || height === null || Math.abs(width) < 1e-9 || Math.abs(height) < 1e-9) return;
            opposite = [start[0] + width, start[1] + height];
          } else {
            const [distanceText, angleText] = numericBuffer.split("<");
            const distance = parseLength(distanceText);
            if (distance === null || distance <= 0) return;
            const angle = angleText ? parseAngle(angleText) : hoverPoint ? Math.atan2(worldToPlane(hoverPoint, plane)[1] - start[1], worldToPlane(hoverPoint, plane)[0] - start[0]) * 180 / Math.PI : null;
            if (angle === null) return;
            const diagonalAngle = THREE.MathUtils.degToRad(angle);
            opposite = [start[0] + Math.cos(diagonalAngle) * distance, start[1] + Math.sin(diagonalAngle) * distance];
          }
          if (Math.abs(opposite[0] - start[0]) < 1e-9 || Math.abs(opposite[1] - start[1]) < 1e-9) return;
          const exact = planeToWorld(opposite, plane);
          commit({ points: [acquired[0], planeToWorld([opposite[0], start[1]], plane), exact, planeToWorld([start[0], opposite[1]], plane)] });
          numericBuffer = "";
          updatePreview(exact);
          return;
        }
        if (activeTool === "arc") {
          if (acquired.length === 1) {
            const radiusText = numericBuffer.split("<")[0];
            const radius = parseLength(radiusText);
            if (radius === null || radius <= 0 || !hoverPoint) return;
            const center = worldToPlane(acquired[0], plane), hover = worldToPlane(hoverPoint, plane);
            const angle = Math.atan2(hover[1] - center[1], hover[0] - center[0]);
            const startPoint = planeToWorld([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius], plane);
            acquired.push(startPoint);
            hoverPoint = startPoint;
            numericBuffer = "";
            updatePreview(startPoint);
            return;
          }
          if (acquired.length === 2) {
            const parts = numericBuffer.split("<");
            const sweep = parseAngle(parts.length > 1 ? parts[1] : parts[0]);
            if (sweep === null || Math.abs(sweep) < 1e-9) return;
            const center = worldToPlane(acquired[0], plane), startPoint = worldToPlane(acquired[1], plane);
            const radius = parts.length > 1 ? parseLength(parts[0]) ?? Math.hypot(startPoint[0] - center[0], startPoint[1] - center[1]) : Math.hypot(startPoint[0] - center[0], startPoint[1] - center[1]);
            if (radius <= 0) return;
            const startAngle = Math.atan2(startPoint[1] - center[1], startPoint[0] - center[0]);
            const endAngle = startAngle + THREE.MathUtils.degToRad(sweep);
            const endPoint = planeToWorld([center[0] + Math.cos(endAngle) * radius, center[1] + Math.sin(endAngle) * radius], plane);
            commit({ center: acquired[0], radius, startAngle, endAngle });
            numericBuffer = "";
            updatePreview(endPoint);
            return;
          }
        }
        if (!hoverPoint && activeTool !== "circle" && !numericBuffer.includes("<")) return;
        const [distanceText, angleText] = numericBuffer.split("<");
        const distance = parseLength(distanceText);
        if (distance === null || distance <= 0) return;
        const start = acquired[acquired.length - 1];
        const start2 = worldToPlane(start, plane), hover2 = worldToPlane(hoverPoint ?? start, plane);
        const parsedAngle = angleText ? parseAngle(angleText) : null;
        const angle = angleText ? (parsedAngle === null ? undefined : THREE.MathUtils.degToRad(parsedAngle)) : Math.atan2(hover2[1] - start2[1], hover2[0] - start2[0]);
        if (angle === undefined) return;
        const exact = planeToWorld([start2[0] + Math.cos(angle) * distance, start2[1] + Math.sin(angle) * distance], plane);
        if (activeTool === "line") commit({ points: [start, exact] });
        else if (activeTool === "polyline") { acquired.push(exact); hoverPoint = exact; }
        else if (activeTool === "circle") commit({ center: acquired[0], radius: distance });
        numericBuffer = "";
        updatePreview(exact);
        return;
      }
      if (/^[0-9a-zA-Z.°<,@#+\- ]$/.test(event.key)) {
        event.preventDefault();
        numericBuffer += event.key;
        if (acquired.length) {
          const base = worldToPlane(acquired.at(-1)!, plane), locks = { ...polarLocks };
          if (inputField === "angle" && polarLocks.length !== null && !numericBuffer.includes("<")) { const angle = parseAngle(numericBuffer); if (angle !== null) locks.angle = angle; }
          const local = parsePointEntry(inputField === "angle" && polarLocks.length !== null ? "" : numericBuffer, base, hoverPoint ? worldToPlane(hoverPoint, plane) : undefined, locks);
          if (local) updatePreview(planeToWorld(local, plane));
        }
        setToolReadout(`${activeTool.toUpperCase()} · ${inputField} input ${numericBuffer} · Tab locks field`);
      }
    }

    activeRenderer.domElement.addEventListener("pointermove", handlePointerMove);
    activeRenderer.domElement.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);
    const releaseAlt = (event: KeyboardEvent) => { if (event.key === "Alt") suppressAutomaticConstraints = false; };
    window.addEventListener("keyup", releaseAlt);
    return () => {
      activeRenderer.domElement.removeEventListener("pointermove", handlePointerMove);
      activeRenderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", releaseAlt);
      scene.remove(preview, marker);
      preview.geometry.dispose(); previewMaterial.dispose();
      marker.geometry.dispose(); markerMaterial.dispose();
      controls.enabled = true;
      hideCursorTag();
      setToolReadout("");
    };
  }, [drawingTool, activeWorkPlane, snapEnabled, orthoEnabled]);

  const offsetPreviewRef = useRef<Exclude<RenderObject, THREE.Group> | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const previous = offsetPreviewRef.current;
    if (previous) {
      scene.remove(previous);
      previous.geometry.dispose();
      (previous.material as THREE.Material).dispose();
      offsetPreviewRef.current = null;
    }
    if (!offsetPreview || !Number.isFinite(offsetPreview.distance) || offsetPreview.distance <= 1e-9) return;
    const feature = Object.values(cadDocument.features).find((entry) => entry.output === offsetPreview.objectId && entry.type === "drawing");
    const object = cadDocument.objects[offsetPreview.objectId];
    if (!feature || !object) return;
    const params = offsetDrawingForObject(object, feature, offsetPreview.distance, offsetPreview.side);
    if (!params) return;
    const transform = drawingTransformAfterEdit(object, feature, params);
    const preview = createDrawingRenderObject("offset-preview", params);
    const origin = Array.isArray(preview.userData.drawingOrigin) ? preview.userData.drawingOrigin as Vec3 : [0, 0, 0] as Vec3;
    preview.position.set(origin[0] + transform.translation[0], origin[1] + transform.translation[1], origin[2] + transform.translation[2]);
    preview.rotation.set(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
    preview.scale.set(...transform.scale);
    const material = preview.material as THREE.LineBasicMaterial;
    material.color.setHex(0x36d9c5);
    material.transparent = true;
    material.opacity = 0.8;
    material.depthTest = false;
    preview.renderOrder = 20;
    scene.add(preview);
    offsetPreviewRef.current = preview;
    return () => {
      if (offsetPreviewRef.current === preview) {
        scene.remove(preview);
        preview.geometry.dispose();
        (preview.material as THREE.Material).dispose();
        offsetPreviewRef.current = null;
      }
    };
  }, [offsetPreview, documentRevision, sceneReady]);

  const cornerPreviewRef = useRef<Exclude<RenderObject, THREE.Group> | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const previous = cornerPreviewRef.current;
    if (previous) {
      scene.remove(previous);
      previous.geometry.dispose();
      (previous.material as THREE.Material).dispose();
      cornerPreviewRef.current = null;
    }
    if (!cornerPreview || cornerPreview.review) return;
    // Same pure function and inputs as the commit path, so the overlay can
    // never disagree with the committed result. Nothing here touches the
    // document; the overlay is transient scene state only.
    const params = resolveCornerPreview(cadDocument, cornerPreview);
    if (!params) return;
    const object = cadDocument.objects[cornerPreview.objectId];
    const feature = Object.values(cadDocument.features).find((entry) => entry.output === cornerPreview.objectId && entry.type === "drawing");
    if (!object || !feature) return;
    const transform = drawingTransformAfterEdit(object, feature, params);
    const preview = createDrawingRenderObject("corner-preview", params);
    const origin = Array.isArray(preview.userData.drawingOrigin) ? preview.userData.drawingOrigin as Vec3 : [0, 0, 0] as Vec3;
    preview.position.set(origin[0] + transform.translation[0], origin[1] + transform.translation[1], origin[2] + transform.translation[2]);
    preview.rotation.set(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
    preview.scale.set(...transform.scale);
    const material = preview.material as THREE.LineBasicMaterial;
    material.color.setHex(0x36d9c5);
    material.transparent = true;
    material.opacity = 0.8;
    material.depthTest = false;
    preview.renderOrder = 20;
    scene.add(preview);
    cornerPreviewRef.current = preview;
    return () => {
      if (cornerPreviewRef.current === preview) {
        scene.remove(preview);
        preview.geometry.dispose();
        (preview.material as THREE.Material).dispose();
        cornerPreviewRef.current = null;
      }
    };
  }, [cornerPreview, documentRevision, sceneReady]);

  const filletPreviewRef = useRef<Exclude<RenderObject, THREE.Group> | null>(null);

  useEffect(() => {
    const scene=sceneRef.current;
    if(!scene || !extrusionPreview)return;
    let cancelled=false, mesh:RenderObject|null=null;
    onExtrusionStatus?.("Preparing preview…");
    void buildExtrudeMesh(extrusionPreview,true).then(data=>{
      if(cancelled)return;
      mesh=createThreeMesh("extrusion-preview",data);
      const material=mesh.material as THREE.MeshStandardMaterial;
      material.color.setHex(0x36d9c5);material.transparent=true;material.opacity=0.6;mesh.renderOrder=20;
      scene.add(mesh);onExtrusionStatus?.("Preview ready");
    }).catch(error=>{if(!cancelled)onExtrusionStatus?.(`Preview failed: ${error instanceof Error?error.message:String(error)}`);});
    return()=>{cancelled=true;if(mesh){scene.remove(mesh);disposeMesh(mesh);}};
  },[extrusionPreview,sceneReady]);
  const projectRegionPoint=useCallback((point:Vec3):[number,number]=>{
    const camera=cameraRef.current, host=hostRef.current;
    if(!camera||!host)return [0,0];
    const p=new THREE.Vector3(...point).project(camera);
    return [(p.x+1)*host.clientWidth/2,(1-p.y)*host.clientHeight/2];
  },[]);
  const getImageCropCanvas=useCallback(()=>rendererRef.current?.domElement??null,[]);
  const getImageCropCamera=useCallback(()=>cameraRef.current,[]);
  const getImageCropMatrix=useCallback((objectId:string)=>{
    const root=meshesRef.current.get(objectId);if(!root)return null;
    root.updateMatrixWorld(true);let matrix:THREE.Matrix4|null=null;
    root.traverse(child=>{if((child as THREE.Mesh).isMesh)matrix=child.matrixWorld.clone();});
    return matrix;
  },[]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const previous = filletPreviewRef.current;
    if (previous) {
      scene.remove(previous);
      disposeMesh(previous);
      filletPreviewRef.current = null;
    }
    if (!filletPreview) return;
    let cancelled = false;
    void (async () => {
      let mesh: RenderObject | null = null;
      try {
        // Same cached builder as validation and commit, so the overlay can
        // never disagree with the committed result. Transient scene state
        // only; the document is untouched.
        mesh = createThreeMesh("fillet-preview", await buildFilletMesh(filletPreview));
      } catch {
        return;
      }
      if (cancelled) {
        disposeMesh(mesh);
        return;
      }
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.setHex(0x36d9c5);
      material.transparent = true;
      material.opacity = 0.55;
      material.depthTest = false;
      mesh.renderOrder = 20;
      scene.add(mesh);
      filletPreviewRef.current = mesh;
    })();
    return () => {
      cancelled = true;
      const current = filletPreviewRef.current;
      if (current) {
        scene.remove(current);
        disposeMesh(current);
        filletPreviewRef.current = null;
      }
    };
  }, [filletPreview, documentRevision, sceneReady]);

  const chamferPreviewRef = useRef<Exclude<RenderObject, THREE.Group> | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const previous = chamferPreviewRef.current;
    if (previous) {
      scene.remove(previous);
      disposeMesh(previous);
      chamferPreviewRef.current = null;
    }
    if (!chamferPreview) return;
    let cancelled = false;
    void (async () => {
      let mesh: RenderObject | null = null;
      try {
        // Same cached builder as validation and commit, so the overlay can
        // never disagree with the committed result. Transient scene state
        // only; the document is untouched.
        mesh = createThreeMesh("chamfer-preview", await buildChamferMesh(chamferPreview));
      } catch {
        return;
      }
      if (cancelled) {
        disposeMesh(mesh);
        return;
      }
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.setHex(0x36d9c5);
      material.transparent = true;
      material.opacity = 0.55;
      material.depthTest = false;
      mesh.renderOrder = 20;
      scene.add(mesh);
      chamferPreviewRef.current = mesh;
    })();
    return () => {
      cancelled = true;
      const current = chamferPreviewRef.current;
      if (current) {
        scene.remove(current);
        disposeMesh(current);
        chamferPreviewRef.current = null;
      }
    };
  }, [chamferPreview, documentRevision, sceneReady]);

  const copilotPreviewRef = useRef<Exclude<RenderObject, THREE.Group>[]>([]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const previous = copilotPreviewRef.current;
    copilotPreviewRef.current = [];
    for (const ghost of previous) {
      scene.remove(ghost);
      disposeMesh(ghost);
    }
    if (!copilotPreview?.length) return;
    // Generation token: a superseded plan (new keystrokes, Apply, panel
    // close) must never mount stale ghosts. Deliberately no
    // cancelKernelTasks() here: that would abort unrelated in-flight
    // validation/commits sharing the worker. Rapid typing is absorbed by
    // the panel-side debounce; cancellation only arrives via the explicit
    // status-bar Cancel button and resolves silently below.
    let cancelled = false;
    void (async () => {
      const settled = await Promise.allSettled(copilotPreview.map(async (ghost): Promise<Exclude<RenderObject, THREE.Group>> => {
        if (ghost.kind === "drawing" || ghost.kind === "path") {
          // Pure 2D outline, no kernel involved.
          const outline = createDrawingRenderObject(ghost.key, ghost.kind==="path"?{kind:ghost.points.length===1?"point":"polyline",points:ghost.points,closed:ghost.closed,workPlane:ghost.workPlane}:ghost.params, 0x36d9c5);
          if(ghost.kind==="path")outline.userData.copilotRole=ghost.role;
          outline.position.fromArray(outline.userData.drawingOrigin as Vec3);
          return outline;
        }
        if (ghost.kind === "extrude") {
          return createThreeMesh(
            ghost.key,
            await buildExtrudeMesh({ kind: "extrude", profile: ghost.profile, distance: ghost.distance }),
          );
        }
        const mesh = createThreeMesh(
          ghost.key,
          await buildPrimitiveMesh({ kind: ghost.primitive, ...ghost.params }),
        );
        mesh.position.set(ghost.position[0], ghost.position[1], ghost.position[2]);
        return mesh;
      }));
      if (cancelled) {
        for (const entry of settled) {
          if (entry.status !== "fulfilled") continue;
          disposeMesh(entry.value);
        }
        return;
      }
      const meshes: Exclude<RenderObject, THREE.Group>[] = [];
      let failed = 0;
      for (const entry of settled) {
        if (entry.status !== "fulfilled") {
          // A user-cancelled kernel task (status-bar Cancel) is intent, not
          // failure: stay silent. Genuinely rejected ghosts are counted so
          // the panel can note partial preview; Apply stays the source of
          // truth and reports the kernel reason.
          if (!isKernelCancelled(entry.reason)) failed++;
          continue;
        }
        const material = entry.value.material as THREE.MeshStandardMaterial;
        material.color.setHex(entry.value.userData.copilotRole==="source"?0xe5ab50:0x36d9c5);
        material.transparent = true;
        material.opacity = 0.55;
        material.depthTest = false;
        entry.value.renderOrder = 20;
        scene.add(entry.value);
        meshes.push(entry.value);
      }
      if (cancelled) {
        for (const mesh of meshes) {
          scene.remove(mesh);
          disposeMesh(mesh);
        }
        return;
      }
      copilotPreviewRef.current = meshes;
      onCopilotPreviewStatusRef.current?.(failed, copilotPreview.length);
    })();
    return () => {
      cancelled = true;
      const current = copilotPreviewRef.current;
      copilotPreviewRef.current = [];
      for (const mesh of current) {
        scene.remove(mesh);
        disposeMesh(mesh);
      }
    };
  }, [copilotPreview, documentRevision, sceneReady]);

  useEffect(() => {
    if (!offsetActive || !offsetPreview) return;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!renderer || !camera || !controls) return;
    const object = cadDocument.objects[offsetPreview.objectId];
    const feature = Object.values(cadDocument.features).find((entry) => entry.output === offsetPreview.objectId && entry.type === "drawing");
    if (!object || !feature) return;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = WORK_PLANES[(feature.params.workPlane === "XZ" || feature.params.workPlane === "YZ" ? feature.params.workPlane : "XY") as WorkPlaneId];
    const worldPoint = (event: PointerEvent): Vec3 | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return intersectRayWithWorkPlane(raycaster.ray.origin.toArray() as Vec3, raycaster.ray.direction.toArray() as Vec3, plane);
    };
    const sideAt = (point: Vec3): "left" | "right" => {
      const world = getWorldDrawingGeometry(object, feature);
      if (!world) return offsetPreview.side;
      const kind = String(feature.params.kind);
      if ((kind === "circle" || kind === "arc") && world.center && world.radius !== undefined) {
        const p = worldToPlane(point, plane), c = worldToPlane(world.center, plane);
        return Math.hypot(p[0] - c[0], p[1] - c[1]) >= world.radius ? "left" : "right";
      }
      const points = world.points ?? [];
      if (points.length < 2) return offsetPreview.side;
      let best = Number.POSITIVE_INFINITY;
      let result: "left" | "right" = offsetPreview.side;
      for (let index = 0; index < points.length - 1; index += 1) {
        const a = worldToPlane(points[index], plane), b = worldToPlane(points[index + 1], plane), p = worldToPlane(point, plane);
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-9) continue;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
        const qx = a[0] + dx * t, qy = a[1] + dy * t;
        const distance = (p[0] - qx) ** 2 + (p[1] - qy) ** 2;
        if (distance < best) {
          best = distance;
          result = dx * (p[1] - a[1]) - dy * (p[0] - a[0]) >= 0 ? "left" : "right";
        }
      }
      return result;
    };
    controls.enabled = false;
    const onMove = (event: PointerEvent) => {
      const point = worldPoint(event);
      if (point) onOffsetSideChange?.(sideAt(point));
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const point = worldPoint(event);
      if (!point) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const side = sideAt(point);
      onOffsetSideChange?.(side);
      onOffsetCommit?.(side);
    };
    const onKey = (event: KeyboardEvent) => {
      if (isCadKeyboardBlocked(event.target)) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onOffsetCancel?.();
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      controls.enabled = true;
    };
  }, [offsetActive, offsetPreview, onOffsetSideChange, onOffsetCommit, onOffsetCancel]);

  useEffect(() => {
    if (!lineEditTool || !lineEditCutterId) return;
    const scene = sceneRef.current, renderer = rendererRef.current, camera = cameraRef.current, controls = controlsRef.current;
    const cutter = cadDocument.objects[lineEditCutterId];
    const cutterFeature = Object.values(cadDocument.features).find((entry) => entry.output === lineEditCutterId);
    const cutterLayer = cutter ? cadDocument.layers[cutter.layerId] : undefined;
    if (!scene || !renderer || !camera || !controls || !cutter || cutterFeature?.type !== "drawing" || !cutter.visible || !cutterLayer?.visible || cutterLayer.locked) return;
    const cutterWorld = getWorldDrawingGeometry(cutter, cutterFeature);
    if (!cutterWorld) return;
    const candidates = Object.values(cadDocument.features).flatMap((feature) => {
      if (feature.type !== "drawing" || feature.output === lineEditCutterId) return [];
      const kind = String(feature.params.kind);
      // Rectangle edges and closed loops have no valid trim/extend
      // representation; the engine rejects them, so they are not pickable.
      if (kind !== "line" && kind !== "polyline" && kind !== "arc" && kind !== "circle") return [];
      if (feature.params.closed === true) return [];
      const object = cadDocument.objects[feature.output];
      const layer = object ? cadDocument.layers[object.layerId] : undefined;
      const mesh = meshesRef.current.get(feature.output);
      if (!object?.visible || !layer?.visible || layer.locked || !mesh?.visible) return [];
      const world = getWorldDrawingGeometry(object, feature);
      if (!world?.points || world.points.length < 2 || world.workPlane !== cutterWorld.workPlane) return [];
      if (kind === "polyline" && world.profileSegments?.some((entry) => entry.kind !== "line")) return [];
      return [{ object, feature, points: world.points }];
    });
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: lineEditTool === "trim" ? 0xff725f : 0x59e3c7, depthTest: false, transparent: true, opacity: 0.95 });
    const preview = new THREE.Line(geometry, material);
    preview.visible = false;
    preview.renderOrder = 30;
    scene.add(preview);
    controls.enabled = false;
    let hover: { targetId: string; pickPoint: Vec3 } | null = null;
    const update = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      let nearest: { object: typeof cutter; feature: typeof cutterFeature; pickPoint: Vec3; distance: number } | null = null;
      for (const candidate of candidates) {
        for (let index = 0; index < candidate.points.length - 1; index += 1) {
          const a = new THREE.Vector3(...candidate.points[index]).project(camera);
          const b = new THREE.Vector3(...candidate.points[index + 1]).project(camera);
          const ax = (a.x + 1) * rect.width / 2, ay = (1 - a.y) * rect.height / 2;
          const bx = (b.x + 1) * rect.width / 2, by = (1 - b.y) * rect.height / 2;
          const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
          if (length2 < 1e-9) continue;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2));
          const distance = Math.hypot(x - ax - dx * t, y - ay - dy * t);
          if (distance > 14 || (nearest && distance >= nearest.distance)) continue;
          const pickPoint: Vec3 = candidate.points[index].map((v, axis) => v + (candidate.points[index + 1][axis] - v) * t) as Vec3;
          nearest = { object: candidate.object, feature: candidate.feature, pickPoint, distance };
        }
      }
      const edit = nearest && resolveLineEdit(lineEditTool, nearest.object, nearest.feature, cutter, cutterFeature, nearest.pickPoint);
      preview.visible = Boolean(edit);
      hover = edit && nearest ? { targetId: nearest.object.id, pickPoint: nearest.pickPoint } : null;
      if (edit) {
        preview.geometry.dispose();
        preview.geometry = new THREE.BufferGeometry().setFromPoints(edit.previewPoints.map((point) => new THREE.Vector3(...point)));
      }
      setToolReadout(hover ? `${lineEditTool.toUpperCase()} · click highlighted segment` : `${lineEditTool.toUpperCase()} · hover a line, polyline end, arc, or circle; Esc to cancel`);
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      update(event);
      if (hover) onLineEditCommitRef.current?.(lineEditTool, hover.targetId, hover.pickPoint);
    };
    const onKey = (event: KeyboardEvent) => {
      if (isCadKeyboardBlocked(event.target)) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onLineEditCancelRef.current?.();
    };
    renderer.domElement.addEventListener("pointermove", update);
    renderer.domElement.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    setToolReadout(`${lineEditTool.toUpperCase()} · hover a line, polyline end, arc, or circle; Esc to cancel`);
    return () => {
      renderer.domElement.removeEventListener("pointermove", update);
      renderer.domElement.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      scene.remove(preview);
      geometry.dispose();
      material.dispose();
      controls.enabled = true;
      setToolReadout("");
    };
  }, [lineEditTool, lineEditCutterId, documentRevision, sceneReady]);

  return (
    <>
      <div ref={hostRef} className="cad-viewport" />
      {cornerPreview?.review && sceneReady && <CornerTool key={`${cornerPreview.objectId}:${cornerPreview.controlId}`} session={cornerPreview} project={projectRegionPoint}
        getCanvas={() => rendererRef.current?.domElement ?? null} getCamera={() => cameraRef.current}
        onClose={() => onCornerClose?.()} onApplied={ids => onCornerApplied?.(ids)} nextActions={curveNextActions}
        onFrame={points => {
          if (!points.length) return;
          fitBounds(new THREE.Box3().setFromPoints(points.map(p => new THREE.Vector3(...p))));
          const camera = cameraRef.current, controls = controlsRef.current;
          if (!(camera instanceof THREE.OrthographicCamera) || !controls) return;
          const width = hostRef.current?.clientWidth ?? 850, height = hostRef.current?.clientHeight ?? 700, reserved = Math.min(350,width*.45), plane = WORK_PLANES[activeWorkPlane];
          const ranges = new THREE.Box2().setFromPoints(points.map(p => new THREE.Vector2(...worldToPlane(p,plane)))).getSize(new THREE.Vector2());
          camera.zoom = Math.min((camera.right-camera.left)*(width-reserved-32)/width/Math.max(ranges.x,.01),(camera.top-camera.bottom)*(height-100)/height/Math.max(ranges.y,.01));
          camera.updateProjectionMatrix(); const offset = new THREE.Vector3(...plane.xAxis).multiplyScalar(-(camera.right-camera.left)/camera.zoom*reserved/2/width);
          camera.position.add(offset);controls.target.add(offset);controls.update();
        }}/>}
      {angularSession && sceneReady && <AngularDimensionTool key={angularSession.id} session={angularSession} project={projectRegionPoint} getCanvas={()=>rendererRef.current?.domElement??null}
        onClose={()=>onAngularClose?.()} onApplied={id=>onAngularApplied?.(id)} onEditSketch={id=>onAngularEditSketch?.(id)} onInspectSource={id=>onAngularInspectSource?.(id)}/>}
      {curveSession && sceneReady && <CurveWorkbench key={curveSession.id} session={curveSession} nextActions={curveNextActions} constructionVisible={constructionVisible} project={projectRegionPoint}
        getCanvas={() => rendererRef.current?.domElement ?? null} getCamera={() => cameraRef.current}
        onClose={() => onCurveClose?.()} onApplied={ids => onCurveApplied?.(ids)}
        onFrame={points => {
          if (!points.length) return;
          fitBounds(new THREE.Box3().setFromPoints(points.map(p => new THREE.Vector3(...p))));
          const camera = cameraRef.current, controls = controlsRef.current;
          if (!(camera instanceof THREE.OrthographicCamera) || !controls) return;
          const width = hostRef.current?.clientWidth ?? 850, height = hostRef.current?.clientHeight ?? 700, reserved = Math.min(350, width * .45), plane = WORK_PLANES[activeWorkPlane];
          const ranges = new THREE.Box2().setFromPoints(points.map(p => new THREE.Vector2(...worldToPlane(p, plane)))).getSize(new THREE.Vector2());
          camera.zoom = Math.min((camera.right - camera.left) * (width - reserved - 32) / width / Math.max(ranges.x, .01), (camera.top - camera.bottom) * (height - 100) / height / Math.max(ranges.y, .01));
          camera.updateProjectionMatrix();
          const offset = new THREE.Vector3(...plane.xAxis).multiplyScalar(-(camera.right - camera.left) / camera.zoom * reserved / 2 / width);
          camera.position.add(offset); controls.target.add(offset); controls.update();
        }} />}
      {constructionSession && sceneReady && <ConstructionTool key={constructionSession.id} session={constructionSession} constructionVisible={constructionVisible} snapEnabled={snapEnabled} snapPreferences={snapPreferences} project={projectRegionPoint}
        onFrame={points=>{if(points.length)fitBounds(new THREE.Box3().setFromPoints(points.map(p=>new THREE.Vector3(...p))));}}
        getCanvas={() => rendererRef.current?.domElement ?? null} getCamera={() => cameraRef.current}
        onClose={() => onConstructionClose?.()} onApplied={ids => onConstructionApplied?.(ids)} />}
      {contourSession && sceneReady && <ContourTool key={contourSession.id} session={contourSession} project={projectRegionPoint} snapEnabled={snapEnabled} snapPreferences={snapPreferences}
        getCanvas={() => rendererRef.current?.domElement ?? null} getCamera={() => cameraRef.current}
        onClose={() => onContourClose?.()} onApplied={ids => onContourApplied?.(ids)}
        onFrame={points => {
          if (!points.length) return;
          fitBounds(new THREE.Box3().setFromPoints(points.map(p => new THREE.Vector3(...p))));
          const camera = cameraRef.current, controls = controlsRef.current;
          if (!(camera instanceof THREE.OrthographicCamera) || !controls) return;
          const width = hostRef.current?.clientWidth ?? 850, height = hostRef.current?.clientHeight ?? 700, reserved = Math.min(350, width * .45), plane = WORK_PLANES[activeWorkPlane];
          const ranges = new THREE.Box2().setFromPoints(points.map(p => new THREE.Vector2(...worldToPlane(p, plane)))).getSize(new THREE.Vector2());
          camera.zoom = Math.min((camera.right - camera.left) * (width - reserved - 32) / width / Math.max(ranges.x, .01), (camera.top - camera.bottom) * (height - 100) / height / Math.max(ranges.y, .01));
          camera.updateProjectionMatrix();
          const offset = new THREE.Vector3(...plane.xAxis).multiplyScalar(-(camera.right - camera.left) / camera.zoom * reserved / 2 / width);
          camera.position.add(offset); controls.target.add(offset); controls.update();
        }} />}
      {extrusionRegions && sceneReady && <RegionOverlay loops={extrusionRegions} selected={chosenRegions} toggle={id=>onToggleRegion?.(id)} project={projectRegionPoint}/>}
      {imageCropEditingId && selectedObjectIds.includes(imageCropEditingId) && sceneReady && !drawingTool && !measurementTool && !pointTransform && (() => {
        const feature=Object.values(cadDocument.features).find(entry=>entry.output===imageCropEditingId&&entry.type==="image");
        if(!feature)return null;
        const params=feature.params as unknown as import("@agent-webcad/cad-document").CadImageNodeParams;
        const crop=imageCropPreview?.objectId===imageCropEditingId?imageCropPreview.crop:params.crop;
        return <ImageCropHandles key={imageCropEditingId} objectId={imageCropEditingId} crop={crop} getCanvas={getImageCropCanvas} getCamera={getImageCropCamera} getObjectMatrix={getImageCropMatrix} project={projectRegionPoint} onCropChange={next=>onImageCropDraftChange?.(imageCropEditingId,next)}/>;
      })()}
      {pointTransform && sceneReady && <PointTransformTool session={pointTransform} planeId={activeWorkPlane} snapEnabled={snapEnabled} snapPreferences={snapPreferences} orthoEnabled={orthoEnabled}
        constructionVisible={constructionVisible}
        getCanvas={() => rendererRef.current?.domElement ?? null} getCamera={() => cameraRef.current} getControls={() => controlsRef.current}
        onCommit={(base, target, angle) => onPointTransformCommit?.(base, target, angle) ?? Promise.resolve({ ok: false })} onCancel={() => onPointTransformCancel?.()} />}
      {patternSession&&sceneReady&&<PatternTool key={patternSession.id} session={patternSession} project={projectRegionPoint} onClose={()=>onPatternClose?.()} onApplied={ids=>onPatternApplied?.(ids)} onFrame={points=>{
        fitBounds(new THREE.Box3().setFromPoints(points.map(p=>new THREE.Vector3(...p))));
        const camera=cameraRef.current,controls=controlsRef.current;
        if(camera instanceof THREE.OrthographicCamera&&controls){const width=hostRef.current?.clientWidth??850,shift=(camera.right-camera.left)*Math.min(140,width/4)/width;const offset=new THREE.Vector3(...WORK_PLANES[patternSession.spec.workPlane].xAxis).multiplyScalar(-shift);camera.position.add(offset);controls.target.add(offset);controls.update();}
      }}/>}
      {activeSketch && sceneReady && <SketchOverlay key={activeSketch.id} sketch={activeSketch} project={projectSketchPoint}
        constructionVisible={constructionVisible}
        selectedConstraintId={selectedSketchConstraintId} diagnostic={sketchDiagnostic} selectedObjectIds={selectedObjectIds}
        externalReview={constraintReview??(directVisual?.requestedSketch?.id===activeSketch.id?directVisual.review:undefined)} requestedSketch={directVisual?.requestedSketch?.id===activeSketch.id?directVisual.requestedSketch:undefined} externalEditActive={Boolean(constraintReview||directSession)}
        externalInspectedConstraint={directInspectedConstraint} openDimension={openDimension} onStartDimensionEdit={closeDirectEdit}
        disabled={!cadDocument.layers[activeSketch.layerId]?.visible || cadDocument.layers[activeSketch.layerId]?.locked}
        onSelect={(id) => onSelectSketchConstraint?.(id)} onDocumentChange={() => onSketchDocumentChange?.()} />}
      {directSelectMode&&sceneReady&&!drawingTool&&!pointTransform&&!cornerPreview?.review&&<DirectEditHandles getCandidates={getDirectCandidates} selectedIds={selectedObjectIds} project={projectRegionPoint} disabled={Boolean(directSession||targetChoice)} focusTarget={focusTarget} onInspect={setInspectedTarget} onActivate={target=>beginKeyboardGripRef.current(target)} onExit={()=>rendererRef.current?.domElement.focus()}/>}
      {directSelectMode&&inspectedTarget&&!directSession&&<DirectTargetInspector target={inspectedTarget} getCandidates={getDirectCandidates} project={projectRegionPoint} compact={Boolean(targetChoice)}/>}
      {directSelectMode&&targetHint&&!targetChoice&&!directSession&&<button type="button" className="direct-target-hint" aria-label={`Choose among ${targetHint.targets.length} canvas targets`} style={{left:Math.max(8,Math.min(targetHint.x+16,(hostRef.current?.clientWidth??600)-175)),top:Math.max(8,Math.min(targetHint.y+18,(hostRef.current?.clientHeight??500)-34))}} onClick={()=>openTargetChoice(targetHint.targets,targetHint.x,targetHint.y)}>{targetHint.targets.length} targets · choose · Alt+click</button>}
      {directSelectMode&&targetChoice&&<DirectTargetChooser choice={targetChoice} width={hostRef.current?.clientWidth??600} height={hostRef.current?.clientHeight??500} onInspect={setInspectedTarget} onChoose={target=>chooseTargetRef.current(target)} onClose={closeTargetChoice}/>}
      {directSession&&sceneReady&&<DirectEditReview key={directSession.id} session={directSession} project={projectRegionPoint}
        getCamera={() => cameraRef.current} constructionVisible={constructionVisible}
        hasSketchOverlay={Boolean(activeSketch&&directVisual?.requestedSketch?.id===activeSketch.id)} inspectedConstraintId={directInspectedConstraint}
        style={{left:12,top:52,maxHeight:Math.max(130,(hostRef.current?.clientHeight??600)-64)}} onVisual={setDirectVisual} onClose={finishDirectEdit}
        onApplied={()=>onSketchDocumentChange?.()} onInspectConstraint={setDirectInspectedConstraint}
        onEditConstraint={id=>{const sketchId=directVisual?.requestedSketch?.id;closeDirectEdit();if(sketchId&&sketchId!==activeSketch?.id)onOpenSketch?.(sketchId);setOpenDimension({id,nonce:Date.now()});}}/>}
      <div ref={cursorTagRef} className="cad-cursor-tag" style={{ display: "none" }} aria-hidden="true" />
      {selectionBox && <div className={`cad-selection-box${selectionBox.crossing ? " cad-selection-box-crossing" : ""}`} style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} aria-hidden="true" />}
      {contextMenu && <div className="cad-context-menu" style={{ left: Math.max(0,Math.min(contextMenu.x,(hostRef.current?.clientWidth??600)-280)), top: Math.max(0,Math.min(contextMenu.y,(hostRef.current?.clientHeight??600)-480)), maxHeight:"calc(100% - 16px)",overflowY:"auto" }} role="menu" onMouseLeave={() => setContextMenu(null)} onWheel={e=>e.stopPropagation()}>
        {interactionTools.map(tool=>{const reason=interactionToolReason(tool.id,cadDocument,selectedObjectIds,activeSketch?.id,activeLayerId);return <button key={tool.id} type="button" role="menuitem" disabled={!!reason} title={reason??tool.hint} aria-description={reason} onClick={()=>{setContextMenu(null);onContextMenuActionRef.current?.(tool.id);}}>{tool.label}{reason&&<small style={{display:"block",maxWidth:240,whiteSpace:"normal"}}>{reason}</small>}</button>;})}
        {(contextMenu.kind === "object"
          ? ([['fit-selection', 'Fit Selection'], ['duplicate', 'Duplicate'], ['hide', 'Hide'], ['isolate', 'Isolate'], ['delete', 'Delete']] as const)
          : ([['fit-all', 'Fit All'], ['top', 'Top'], ['front', 'Front'], ['right', 'Right'], ['isometric', 'Isometric'], ['toggle-projection', 'Perspective / Orthographic'], ['toggle-grid', 'Toggle Grid']] as const)
        ).map(([action, label]) => <button key={action} type="button" role="menuitem" onClick={() => { setContextMenu(null); onContextMenuActionRef.current?.(action); }}>{label}</button>)}
      </div>}
      {(toolReadout || shortcutReadout) && <div className="cad-tool-readout" role="status">{toolReadout || shortcutReadout}</div>}
    </>
  );
}
