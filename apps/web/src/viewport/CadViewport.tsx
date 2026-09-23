import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

import { cadDocument } from "../state/cadDocument";
import { getObjectTransform } from "../state/objectTransform";
import { getSelectionWorldBounds } from "../precision/worldBounds";
import { parseAngle, parseLength } from "../precision/units";
import { querySnap, type SnapEntity, type SnapResult } from "../precision/snapEngine";
import { measurePoints } from "../precision/measurements";
import { intersectRayWithWorkPlane, planeToWorld, WORK_PLANES, worldToPlane, type Vec3, type WorkPlaneId } from "../precision/workPlane";
import { easeWorkspaceTransition, workspaceTransitionDuration, type WorkspaceMode } from "./workspaceTransition";
import { buildBooleanMesh, buildDemoPartMesh, buildExtrudeMesh, buildPrimitiveMesh, subscribeKernelStatus, type KernelStatus } from "./kernelGeometryService";
import { drawingPlaneScale, getWorldDrawingGeometry } from "../precision/worldGeometry";
import type { TopologySelectionRef } from "../state/selection";
import { offsetDrawingParams } from "../precision/drawingOperations";
import { resolveLineEdit } from "../precision/lineEditing";
import { createDrawingRenderObject, drawingRenderOrigin, drawingRenderPoints } from "./drawingRenderer";
import {
  buildDirectSelectionCandidates,
  nearestDirectSelectionCandidate,
  type DirectSelectionCandidate,
} from "./directSelection";
import { matchesSelectionWindow, type ScreenPoint } from "./selectionWindow";

type CadViewportProps = {
  documentRevision: number;
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
  orthoEnabled?: boolean;
  workspaceMode?: WorkspaceMode;
  directSelectMode?: boolean;
  onKernelStatus?: (status: KernelStatus) => void;
  onTransformCommit?: (objectId: string, mode: TransformMode, transform: ObjectTransformValue) => void;
  onSelectObject?: (objectId: string | null, additive?: boolean) => void;
  onSelectObjects?: (objectIds: string[], additive?: boolean) => void;
  onContextMenuAction?: (action: "fit-all" | "fit-selection" | "duplicate" | "hide" | "isolate" | "delete" | "top" | "front" | "right" | "isometric" | "toggle-grid" | "toggle-projection") => void;
  onDrawingCommit?: (drawing: DrawingTool, params: Record<string, unknown>) => void;
  onDrawingCancel?: () => void;
  onDistanceMeasure?: (measurement: PointMeasurement) => void;
  onDirectEditCommit?: (objectId: string, controlId: string, point: Vec3) => void;
  onDirectSegmentEditCommit?: (objectId: string, segmentId: string, delta: Vec3) => void;
  onDirectSelectSubObject?: (selection: TopologySelectionRef, additive?: boolean) => void;
  offsetPreview?: { objectId: string; distance: number; side: "left" | "right" } | null;
  offsetActive?: boolean;
  onOffsetSideChange?: (side: "left" | "right") => void;
  onOffsetCommit?: (side: "left" | "right") => void;
  onOffsetCancel?: () => void;
  lineEditTool?: "trim" | "extend" | null;
  lineEditCutterId?: string | null;
  onLineEditCommit?: (mode: "trim" | "extend", targetId: string, pickPoint: Vec3) => void;
  onLineEditCancel?: () => void;
};

export type ViewportActionType =
  | "fit-all"
  | "fit-selection"
  | "top"
  | "front"
  | "right"
  | "isometric";

export type ViewportAction = { id: number; type: ViewportActionType };
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
type RenderObject = THREE.Mesh<THREE.BufferGeometry, THREE.Material> | THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;

const DEFAULT_COLOR = 0x4f8cff;
const SELECTED_COLOR = 0xffc107;
const SECONDARY_SELECTED_COLOR = 0x58a6ff;

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
        color = mix(color, vec3(0.48, 0.18, 0.20), xAxis * 0.7);
        color = mix(color, vec3(0.18, 0.42, 0.25), yAxis * 0.7);

        float alpha = max(minor * 0.28, major * 0.62) * fade;
        alpha = max(alpha, max(xAxis, yAxis) * 0.65 * fade);
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
  documentRevision,
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
  onDirectEditCommit,
  onDirectSegmentEditCommit,
  onDirectSelectSubObject,
  offsetPreview = null,
  offsetActive = false,
  onOffsetSideChange,
  onOffsetCommit,
  onOffsetCancel,
  lineEditTool = null,
  lineEditCutterId = null,
  onLineEditCommit,
  onLineEditCancel,
}: CadViewportProps) {
  const [toolReadout, setToolReadout] = useState("");
  const [sceneReady, setSceneReady] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number; crossing: boolean } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; kind: "object" | "view" } | null>(null);
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
  const gridRef = useRef<AdaptiveGrid | null>(null);

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
  const firstGeometryReadyRef = useRef(false);
  const activeWorkPlaneRef = useRef(WORK_PLANES[activeWorkPlane]);
  const cameraWorkspaceRef = useRef({ mode: workspaceMode, plane: activeWorkPlane });
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
  const onDirectEditCommitRef = useRef(onDirectEditCommit);
  const onDirectSegmentEditCommitRef = useRef(onDirectSegmentEditCommit);
  const onDirectSelectSubObjectRef = useRef(onDirectSelectSubObject);
  const onLineEditCommitRef = useRef(onLineEditCommit);
  const onLineEditCancelRef = useRef(onLineEditCancel);
  const directSelectModeRef = useRef(directSelectMode);
  const snapEnabledRef = useRef(snapEnabled);
  const orthoEnabledRef = useRef(orthoEnabled);
  const drawingToolRef = useRef(drawingTool);

  useEffect(() => {
    onSelectObjectRef.current =
      onSelectObject;
  }, [onSelectObject]);
  useEffect(() => { onSelectObjectsRef.current = onSelectObjects; }, [onSelectObjects]);
  useEffect(() => { onContextMenuActionRef.current = onContextMenuAction; }, [onContextMenuAction]);

  useEffect(() => {
    onTransformCommitRef.current = onTransformCommit;
  }, [onTransformCommit]);
  useEffect(() => { onDirectEditCommitRef.current = onDirectEditCommit; }, [onDirectEditCommit]);
  useEffect(() => { onDirectSegmentEditCommitRef.current = onDirectSegmentEditCommit; }, [onDirectSegmentEditCommit]);
  useEffect(() => { onDirectSelectSubObjectRef.current = onDirectSelectSubObject; }, [onDirectSelectSubObject]);
  useEffect(() => { onLineEditCommitRef.current = onLineEditCommit; }, [onLineEditCommit]);
  useEffect(() => { onLineEditCancelRef.current = onLineEditCancel; }, [onLineEditCancel]);
  useEffect(() => { directSelectModeRef.current = directSelectMode; }, [directSelectMode]);
  useEffect(() => { snapEnabledRef.current = snapEnabled; }, [snapEnabled]);
  useEffect(() => { orthoEnabledRef.current = orthoEnabled; }, [orthoEnabled]);

  useEffect(() => { drawingToolRef.current = drawingTool; }, [drawingTool]);

  useEffect(() => { activeWorkPlaneRef.current = WORK_PLANES[activeWorkPlane]; }, [activeWorkPlane]);

  useEffect(() => subscribeKernelStatus((status) => onKernelStatus?.(status)), [onKernelStatus]);

  /* React SelectionState is authoritative; the viewport only renders it. */
  const selectedObjectIdRef = useRef<string | null>(selectedObjectId);
  useEffect(() => { selectedObjectIdRef.current = selectedObjectId; applySelectionColor(); }, [selectedObjectId]);
  const selectedObjectIdsRef = useRef<string[]>(selectedObjectIds);
  useEffect(() => { selectedObjectIdsRef.current = selectedObjectIds; applySelectionColor(); }, [selectedObjectIds]);
  const isolatedObjectIdsRef = useRef<Set<string> | null>(isolatedObjectIds ? new Set(isolatedObjectIds) : null);
  useEffect(() => { isolatedObjectIdsRef.current = isolatedObjectIds ? new Set(isolatedObjectIds) : null; }, [isolatedObjectIds]);

  function disposeMesh(
    mesh: RenderObject
  ) {
    mesh.geometry.dispose();

    const material =
      mesh.material;

    if (
      Array.isArray(
        material
      )
    ) {
      material.forEach(
        (entry) =>
          entry.dispose()
      );
    } else {
      material.dispose();
    }
  }

  function applySelectionColor() {
    for (
      const [
        objectId,
        mesh,
      ]
      of meshesRef.current
    ) {
      const material = mesh.material as THREE.Material & { color?: THREE.Color };

      material.color?.set(
        objectId === selectedObjectIdRef.current
          ? SELECTED_COLOR
          : selectedObjectIdsRef.current.includes(objectId)
            ? SECONDARY_SELECTED_COLOR
          : DEFAULT_COLOR
      );
    }
    updateSelectionBoundsHelper();
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
    applySelectionColor();

    onSelectObjectRef.current?.(objectId, additive);
  }

  function createThreeMesh(
    objectId: string,
    meshData: {
      positions: number[];
      normals: number[];
      indices: number[];
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
      meshData.indices
    );

    geometry.computeBoundingSphere();

    const material =
      new THREE.MeshStandardMaterial({
        color: DEFAULT_COLOR,
        metalness: 0.05,
        roughness: 0.55,
        side: THREE.DoubleSide,
      });

    const mesh =
      new THREE.Mesh(
        geometry,
        material
      );

    mesh.userData.cadObjectId =
      objectId;

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
      bounds.expandByObject(mesh);
      found = true;
    }
    if (!found || bounds.isEmpty()) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.05);
    const direction = camera.position.clone().sub(controls.target);
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
    controls.update();
  }

  function setStandardView(type: "top" | "front" | "right" | "isometric") {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const distance = Math.max(camera.position.distanceTo(controls.target), 1);
    const direction = {
      top: new THREE.Vector3(0, 0, 1),
      front: new THREE.Vector3(0, -1, 0),
      right: new THREE.Vector3(1, 0, 0),
      isometric: new THREE.Vector3(1, -1, 1).normalize(),
    }[type];
    camera.up.set(0, 0, 1);
    camera.position.copy(controls.target).addScaledVector(direction, distance);
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
    controls.setSpace(transformMode === "translate" ? "world" : "local");
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

    // CAD navigation convention: left mouse is reserved for selection and
    // direct manipulation. Orbiting is a middle-button gesture; right click is
    // reserved for context menus and Shift+MMB is the pan gesture.
    controls.mouseButtons.LEFT = -1 as THREE.MOUSE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = -1 as THREE.MOUSE;

    // OrbitControls reads its mapping during pointerdown. Capture the event
    // so the modifier-aware MMB mapping is in place before it handles it.
    const handleNavigationPointerDown = (event: PointerEvent) => {
      if (event.button === 1) controls.mouseButtons.MIDDLE = event.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    };
    const handleNavigationPointerUp = (event: PointerEvent) => {
      if (event.button === 1) controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    };
    const handleNavigationPointerCancel = (event: PointerEvent) => {
      if (event.button === 1 || event.buttons === 0) controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
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
    let transformDragActive = false;
    transformControls.addEventListener("mouseDown", () => {
      transformDragActive = true;
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
      onTransformCommitRef.current?.(objectId, transformControls.getMode() as TransformMode, committedTransform);
    });

    const ambientLight =
      new THREE.AmbientLight(
        0xffffff,
        1.5
      );

    scene.add(
      ambientLight
    );

    const directionalLight =
      new THREE.DirectionalLight(
        0xffffff,
        2.5
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
    let directDrag: { candidate: DirectSelectionCandidate; startWorld: THREE.Vector3; startClient: [number, number]; pointerId: number; committed: boolean; lastWorld: THREE.Vector3; numericBuffer: string } | null = null;
    const directMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x76ead1, depthTest: false }),
    );
    directMarker.renderOrder = 30;
    directMarker.visible = false;
    scene.add(directMarker);
    directMarkerRef.current = directMarker;
    const directSegmentPreview = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffc107, depthTest: false, transparent: true, opacity: 0.95 }),
    );
    directSegmentPreview.renderOrder = 29;
    directSegmentPreview.visible = false;
    scene.add(directSegmentPreview);

    function updateDirectSegmentPreview(candidate: DirectSelectionCandidate, delta: THREE.Vector3) {
      if (!candidate.segment) return;
      const positions = new Float32Array([
        candidate.segment[0].x + delta.x, candidate.segment[0].y + delta.y, candidate.segment[0].z + delta.z,
        candidate.segment[1].x + delta.x, candidate.segment[1].y + delta.y, candidate.segment[1].z + delta.z,
      ]);
      directSegmentPreview.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      directSegmentPreview.geometry.computeBoundingSphere();
      directSegmentPreview.visible = true;
    }

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
        buildDirectSelectionCandidates(cadDocument, meshesRef.current),
        cursor,
        projectPixels,
        exclude,
      );
    }

    function directSnapEntities(): SnapEntity[] {
      const result: SnapEntity[] = [];
      for (const feature of Object.values(cadDocument.features)) {
        if (feature.type !== "drawing") continue;
        const object = cadDocument.objects[feature.output];
        const layer = object ? cadDocument.layers[object.layerId] : undefined;
        const mesh = meshesRef.current.get(feature.output);
        const kind = feature.params.kind;
        if (!object?.visible || layer?.visible === false || !mesh?.visible || !(["line", "polyline", "rectangle", "circle", "arc"] as unknown[]).includes(kind)) continue;
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

    function directWorldPoint(event: PointerEvent) {
      const currentCamera = cameraRef.current; if (!currentCamera) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, currentCamera);
      return intersectRayWithWorkPlane(raycaster.ray.origin.toArray() as Vec3, raycaster.ray.direction.toArray() as Vec3, activeWorkPlaneRef.current);
    }

    function handleDirectMove(event: PointerEvent) {
      if (!directSelectModeRef.current) { directMarker.visible = false; return; }
      if (!directDrag) {
        directSegmentPreview.visible = false;
        const hover = nearestDirectCandidate(event);
        directMarker.visible = Boolean(hover);
        if (hover) {
          directMarker.position.copy(hover.worldPoint);
          (directMarker.material as THREE.MeshBasicMaterial).color.setHex(hover.kind === "control" ? 0x76ead1 : hover.kind === "segment" ? 0xffc107 : 0xb78cff);
          directMarker.scale.setScalar(hover.kind === "control" ? 1 : 0.8);
        }
        return;
      }
      const raw = directWorldPoint(event); if (!raw) return;
      let world = new THREE.Vector3(...raw);
      if (orthoEnabledRef.current) {
        const a = worldToPlane(directDrag.startWorld.toArray() as Vec3, activeWorkPlaneRef.current);
        const b = worldToPlane(world.toArray() as Vec3, activeWorkPlaneRef.current);
        if (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])) b[1] = a[1]; else b[0] = a[0];
        world = new THREE.Vector3(...planeToWorld(b, activeWorkPlaneRef.current));
      }
      if (snapEnabledRef.current) {
        const snapped = querySnap({
          point: world.toArray() as Vec3,
          referencePoint: directDrag.startWorld.toArray() as Vec3,
          entities: directSnapEntities(),
          plane: activeWorkPlaneRef.current,
          gridStep: 1,
          tolerancePx: 12,
          project: (point) => projectPixels(new THREE.Vector3(...point)).toArray() as [number, number],
        });
        if (Number.isFinite(snapped.screenDistance)) world.set(...snapped.point);
      }
      directDrag.lastWorld.copy(world);
      directMarker.position.copy(world); directMarker.visible = true;
      if (directDrag.candidate.kind === "segment") {
        updateDirectSegmentPreview(directDrag.candidate, world.clone().sub(directDrag.startWorld));
      }
    }

    function commitDirectDrag() {
      if (!directDrag) return;
      const drag = directDrag;
      const mesh = meshesRef.current.get(drag.candidate.objectId);
      if (!mesh) return;
      if (drag.candidate.kind === "segment") {
        const deltaWorld = drag.lastWorld.clone().sub(drag.startWorld);
        const localStart = mesh.worldToLocal(drag.startWorld.clone());
        const localEnd = mesh.worldToLocal(drag.startWorld.clone().add(deltaWorld));
        const delta = localEnd.sub(localStart).toArray() as Vec3;
        if (Math.hypot(...delta) > 1e-9) {
          onDirectSegmentEditCommitRef.current?.(drag.candidate.objectId, drag.candidate.topologyId, delta);
        }
        return;
      }
      const origin = Array.isArray(mesh.userData.drawingOrigin) ? new THREE.Vector3(...mesh.userData.drawingOrigin as Vec3) : new THREE.Vector3();
      const modelPoint = mesh.worldToLocal(drag.lastWorld.clone()).add(origin).toArray() as Vec3;
      if (drag.candidate.controlId) onDirectEditCommitRef.current?.(drag.candidate.objectId, drag.candidate.controlId, modelPoint);
    }

    function handleDirectUp(event: PointerEvent) {
      if (!directDrag) return;
      if (event.pointerId !== directDrag.pointerId || directDrag.committed) return;
      directDrag.committed = true;
      const moved = Math.hypot(event.clientX - directDrag.startClient[0], event.clientY - directDrag.startClient[1]) >= 3;
      if (moved) {
        handleDirectMove(event);
        commitDirectDrag();
      }
      try { renderer.domElement.releasePointerCapture(event.pointerId); } catch { /* capture may already be released */ }
      directSegmentPreview.visible = false;
      directDrag = null;
      controls.enabled = true;
      if (transformControlsRef.current) transformControlsRef.current.enabled = true;
    }

    function handleDirectKeyDown(event: KeyboardEvent) {
      if (!directDrag) return;
      if (event.key !== "Escape" && event.key !== "Enter" && !/^[0-9.,+\-]$/.test(event.key) && event.key !== "Backspace") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        try { renderer.domElement.releasePointerCapture(directDrag.pointerId); } catch { /* capture may already be released */ }
        directDrag = null;
        directMarker.visible = false;
        directSegmentPreview.visible = false;
        controls.enabled = true;
        if (transformControlsRef.current) transformControlsRef.current.enabled = true;
        return;
      }
      if (event.key === "Enter") {
        if (directDrag.numericBuffer) {
          const length = parseLength(directDrag.numericBuffer);
          if (length !== null && Number.isFinite(length) && length >= 0) {
            const start = worldToPlane(directDrag.startWorld.toArray() as Vec3, activeWorkPlaneRef.current);
            const current = worldToPlane(directDrag.lastWorld.toArray() as Vec3, activeWorkPlaneRef.current);
            const dx = current[0] - start[0], dy = current[1] - start[1];
            const magnitude = Math.hypot(dx, dy);
            if (magnitude > 1e-9) {
              const point = planeToWorld([start[0] + dx / magnitude * length, start[1] + dy / magnitude * length], activeWorkPlaneRef.current);
              directDrag.lastWorld.set(...point);
              directMarker.position.copy(directDrag.lastWorld);
            }
          }
        }
        commitDirectDrag();
        directDrag.committed = true;
        try { renderer.domElement.releasePointerCapture(directDrag.pointerId); } catch { /* capture may already be released */ }
        directDrag = null;
        controls.enabled = true;
        if (transformControlsRef.current) transformControlsRef.current.enabled = true;
        return;
      }
      if (event.key === "Backspace") directDrag.numericBuffer = directDrag.numericBuffer.slice(0, -1);
      else directDrag.numericBuffer += event.key === "," ? "." : event.key;
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
      const points = world.points.map((point) => {
        const projected = new THREE.Vector3(...point).project(camera);
        return { x: (projected.x + 1) * rect.width / 2, y: (1 - projected.y) * rect.height / 2 };
      });
      return { points, closed: world.kind === "rectangle" || world.kind === "circle" };
    };

    function handlePointerDown(
      event: PointerEvent
    ) {
      /*
       * Left click selects.
       * Right / middle click does
       * not change selection.
       */
      if (event.button !== 0) {
        return;
      }

      if (drawingToolRef.current) return;
      if (directSelectModeRef.current) {
        const additive = event.shiftKey || event.ctrlKey || event.metaKey;
        const key = `${Math.round(event.clientX / 4)}:${Math.round(event.clientY / 4)}`;
        let candidate = nearestDirectCandidate(event);
        if (!additive && key === directOverlapKey && directOverlapSelection) {
          candidate = nearestDirectCandidate(event, directOverlapSelection) ?? candidate;
        }
        directOverlapKey = key;
        directOverlapSelection = candidate
          ? { objectId: candidate.objectId, topologyId: candidate.topologyId }
          : null;
        if (!candidate) { updateSelection(null); directMarker.visible = false; return; }
        if (candidate.kind !== "control") {
          event.preventDefault();
          event.stopImmediatePropagation();
          onDirectSelectSubObjectRef.current?.({ objectId: candidate.objectId, kind: candidate.kind === "segment" ? "drawing-segment" : "drawing-curve", topologyId: candidate.topologyId }, additive);
          directMarker.position.copy(candidate.worldPoint);
          directMarker.visible = true;
          (directMarker.material as THREE.MeshBasicMaterial).color.setHex(candidate.kind === "segment" ? 0xffc107 : 0xb78cff);
        if (candidate.kind === "segment") {
            directDrag = { candidate, startWorld: candidate.worldPoint.clone(), startClient: [event.clientX, event.clientY], pointerId: event.pointerId, committed: false, lastWorld: candidate.worldPoint.clone(), numericBuffer: "" };
            updateDirectSegmentPreview(candidate, new THREE.Vector3());
            controls.enabled = false;
            if (transformControlsRef.current) transformControlsRef.current.enabled = false;
            renderer.domElement.setPointerCapture(event.pointerId);
          }
          return;
        }
        // Consume topology handles before TransformControls, object selection,
        // or OrbitControls can process the same pointer-down.
        event.preventDefault();
        event.stopImmediatePropagation();
        updateSelection(candidate.objectId, event.shiftKey || event.ctrlKey || event.metaKey);
        directDrag = { candidate, startWorld: candidate.worldPoint.clone(), startClient: [event.clientX, event.clientY], pointerId: event.pointerId, committed: false, lastWorld: candidate.worldPoint.clone(), numericBuffer: "" };
        directMarker.position.copy(candidate.worldPoint);
        directMarker.visible = true;
        controls.enabled = false;
        if (transformControlsRef.current) transformControlsRef.current.enabled = false;
        renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }

      // TransformControls owns pointer interaction while an axis/plane handle
      // is hot, but only after direct topology hit-testing has had priority.
      if (transformControlsRef.current?.axis) return;

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

      const hits =
        raycaster.intersectObjects(
          selectableMeshes,
          false
        );

      // Begin CAD window/crossing selection from empty viewport space. The
      // direction is determined on pointer-up: left-to-right is a strict
      // window, right-to-left is an intersecting/crossing selection.
      if (hits.length === 0) {
        selectionStart = { x: event.clientX - rect.left, y: event.clientY - rect.top, additive: event.shiftKey || event.ctrlKey || event.metaKey, pointerId: event.pointerId };
        selectionDragging = false;
        currentRenderer.domElement.setPointerCapture(event.pointerId);
        return;
      }

      const candidates = hits
        .map((hit) => hit.object.userData.cadObjectId as string | undefined)
        .filter((id, index, all): id is string => Boolean(id) && all.indexOf(id) === index);
      const key = `${Math.round(event.clientX / 4)}:${Math.round(event.clientY / 4)}`;
      if (key === overlapKey && !event.shiftKey && !event.ctrlKey && !event.metaKey) overlapIndex = (overlapIndex + 1) % Math.max(1, candidates.length);
      else { overlapKey = key; overlapIndex = 0; }
      const objectId = candidates[overlapIndex] ??
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

        updateSelection(objectId, event.shiftKey || event.ctrlKey || event.metaKey);
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
        targetId = raycaster.intersectObjects(selectableMeshes, false)[0]?.object.userData.cadObjectId as string | undefined;
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
      renderer.domElement.removeEventListener("pointerup", handleSelectionUp);
      window.removeEventListener("keydown", handleDirectKeyDown, true);
      scene.remove(directMarker);
      scene.remove(directSegmentPreview);
      if (directMarkerRef.current === directMarker) directMarkerRef.current = null;
      directMarker.geometry.dispose();
      (directMarker.material as THREE.Material).dispose();
      directSegmentPreview.geometry.dispose();
      (directSegmentPreview.material as THREE.Material).dispose();

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
    const current = cameraRef.current;
    const perspective = perspectiveCameraRef.current;
    const orthographic = orthographicCameraRef.current;
    const controls = controlsRef.current;
    const host = hostRef.current;
    if (!current || !perspective || !orthographic || !controls || !host) return;

    const next: ViewCamera = projectionMode === "perspective" ? perspective : orthographic;
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
  }, [projectionMode]);

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
    controls.enableDamping = false;
    let completed = false;
    let frame = 0;
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
        completed = true;
        camera.position.copy(targetPosition);
        camera.up.copy(targetUp);
        camera.lookAt(controls.target);
        controls.enableDamping = dampingWasEnabled;
        controls.enableRotate = workspaceMode === "3d";
        controls.update();
      }
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      if (!completed) controls.enableDamping = dampingWasEnabled;
    };
  }, [workspaceMode, activeWorkPlane]);

  useEffect(() => {
    if (!viewAction) return;
    switch (viewAction.type) {
      case "fit-all":
        fitMeshes();
        break;
      case "fit-selection":
        if (selectedObjectIdsRef.current.length) fitMeshes(new Set(selectedObjectIdsRef.current));
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
  }, [selectedObjectId, selectedObjectIds, transformMode, documentRevision]);

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

      const objectIds = new Set(
        cadDocument.rootObjects
      );

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
            feature?.type === "primitive" || feature?.type === "boolean" || feature?.type === "drawing" || feature?.type === "extrude"
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
        of cadDocument.rootObjects
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
          (feature.type !== "primitive" && feature.type !== "boolean" && feature.type !== "drawing" && feature.type !== "extrude")
        ) {
          continue;
        }

        const featureSignature =
          JSON.stringify(
            feature.params
          );

        const existingMesh =
          meshesRef.current.get(
            objectId
          );

        const layer = cadDocument.layers[cadObject.layerId];
        const isolated = isolatedObjectIdsRef.current;
        const effectivelyVisible = cadObject.visible && (layer?.visible ?? true) && (!isolated || isolated.has(objectId));

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

        const mesh = feature.type === "drawing"
          ? createDrawingRenderObject(objectId, feature.params)
          : createThreeMesh(objectId, feature.type === "boolean"
            ? await buildBooleanMesh(feature.params)
            : feature.type === "extrude"
              ? await buildExtrudeMesh(feature.params)
              : await buildPrimitiveMesh(feature.params));

        if (cancelled) return;

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
          ) && (!isolated || isolated.has(objectId));
        if (mesh.visible !== visible) {
          mesh.visible = visible;
          visibilityUpdateCount += 1;
        }
      }

      /*
       * Selection color LAST.
       */
      applySelectionColor();
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
  }, [documentRevision, isolatedObjectIds]);

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
    const snapPoint = (raw: Vec3) => snapEnabled ? querySnap({ point: raw, referencePoint: first ?? undefined, entities, plane, gridStep: 1, tolerancePx: 12, project })?.point ?? raw : raw;
    const update = (p: Vec3) => { hover = snapPoint(p); const points = first ? [first, hover] : [hover]; line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setFromPoints(points.map((v) => new THREE.Vector3(...v))); setToolReadout(first ? `DISTANCE · ${measurePoints(first, hover, activeWorkPlane).distance.toFixed(2)} mm` : "DISTANCE · pick first point"); };
    const onMove = (e: PointerEvent) => { const p = worldPoint(e); if (p) update(p); };
    const onDown = (e: PointerEvent) => { if (e.button !== 0) return; const p = worldPoint(e); if (!p) return; const exact = snapPoint(p); if (!first) { first = exact; update(exact); } else { onDistanceMeasure?.(measurePoints(first, exact, activeWorkPlane)); first = null; hover = null; setToolReadout("DISTANCE · measured"); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); first = null; setToolReadout("DISTANCE · cancelled"); } };
    renderer.domElement.addEventListener("pointermove", onMove); renderer.domElement.addEventListener("pointerdown", onDown); window.addEventListener("keydown", onKey, true);
    return () => { renderer.domElement.removeEventListener("pointermove", onMove); renderer.domElement.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey, true); scene.remove(line); line.geometry.dispose(); (line.material as THREE.Material).dispose(); controls.enabled = true; };
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

    function snapEntities(): SnapEntity[] {
      const result: SnapEntity[] = [];
      for (const feature of Object.values(cadDocument.features)) {
        if (feature.type !== "drawing") continue;
        const object = cadDocument.objects[feature.output];
        const layer = object ? cadDocument.layers[object.layerId] : undefined;
        if (!object || !object.visible || layer?.visible === false) continue;
        const kind = feature.params.kind;
        if (!(["line", "polyline", "rectangle", "circle", "arc"] as unknown[]).includes(kind)) continue;
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

    function constrain(point: Vec3) {
      if (!orthoEnabled || acquired.length === 0) return point;
      const start = worldToPlane(acquired[acquired.length - 1], plane);
      const next = worldToPlane(point, plane);
      return Math.abs(next[0] - start[0]) >= Math.abs(next[1] - start[1])
        ? planeToWorld([next[0], start[1]], plane)
        : planeToWorld([start[0], next[1]], plane);
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
      } else if (result.type === "center") {
        for (let index = 0; index < 12; index += 1) {
          const a = index / 12 * Math.PI * 2, b = (index + 1) / 12 * Math.PI * 2;
          segment(x.clone().multiplyScalar(Math.cos(a)).add(y.clone().multiplyScalar(Math.sin(a))), x.clone().multiplyScalar(Math.cos(b)).add(y.clone().multiplyScalar(Math.sin(b))));
        }
      } else {
        segment(x.clone().add(y), x.clone().negate().sub(y)); segment(x.clone().sub(y), x.clone().negate().add(y));
      }
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

    function acquirePoint(raw: Vec3) {
      const startedAt = performance.now();
      const snapped = snapEnabled ? querySnap({ point: raw, referencePoint: acquired.at(-1), entities: snapEntities(), plane, gridStep: 1, tolerancePx: 12, project }) : null;
      performance.measure("agent-webcad:snap-query", { start: startedAt, end: performance.now(), detail: { entityCount: cadDocument.rootObjects.length, result: snapped?.type ?? "disabled" } });
      if (performance.getEntriesByName("agent-webcad:snap-query").length > 200) performance.clearMeasures("agent-webcad:snap-query");
      const point = constrain(snapped && Number.isFinite(snapped.screenDistance) ? snapped.point : raw);
      if (snapped && Number.isFinite(snapped.screenDistance)) markerShape(snapped, point); else marker.visible = false;
      return { point, snap: snapped && Number.isFinite(snapped.screenDistance) ? snapped : null };
    }

    function commit(params: Record<string, unknown>) {
      onDrawingCommit?.(activeTool, { ...params, workPlane: activeWorkPlane });
    }

    function handlePointerMove(event: PointerEvent) {
      const raw = worldPoint(event);
      if (!raw) return;
      const acquiredPoint = acquirePoint(raw);
      hoverPoint = acquiredPoint.point;
      updatePreview(hoverPoint);
      const snapLabel = acquiredPoint.snap ? acquiredPoint.snap.type[0].toUpperCase() + acquiredPoint.snap.type.slice(1) : (orthoEnabled ? "Ortho" : "Free");
      const previous = acquired.at(-1);
      let inference = "";
      if (previous) {
        const a = worldToPlane(previous, plane), b = worldToPlane(hoverPoint, plane);
        const dx = b[0] - a[0], dy = b[1] - a[1];
        if (Math.abs(dy) < 1e-5) inference = " · Horizontal";
        else if (Math.abs(dx) < 1e-5) inference = " · Vertical";
        else inference = ` · ${Math.hypot(dx, dy).toFixed(2)} mm · ${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)}°`;
      }
      setToolReadout(`${activeTool.toUpperCase()} · ${snapLabel}${inference} · ${numericBuffer || worldToPlane(hoverPoint, plane).map((value) => value.toFixed(2)).join(", ")} mm`);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      event.preventDefault();
      const raw = worldPoint(event);
      if (!raw) return;
      const point = acquirePoint(raw).point;
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
      if (event.key === "Escape") { event.preventDefault(); onDrawingCancel?.(); return; }
      if (event.key === "Backspace") { event.preventDefault(); numericBuffer = numericBuffer.slice(0, -1); return; }
      if (event.key === "Enter") {
        event.preventDefault();
        if (activeTool === "polyline" && !numericBuffer && acquired.length >= 2) {
          const first = acquired[0], last = acquired[acquired.length - 1];
          const closed = first.every((value, index) => Math.abs(value - last[index]) < 1e-7);
          const points = closed ? acquired.slice(0, -1) : acquired;
          while (closed && points.length > 2 && first.every((value, index) => Math.abs(value - points[points.length - 1][index]) < 1e-7)) points.pop();
          commit({ points, closed });
          return;
        }
        if (!numericBuffer || acquired.length === 0) return;
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
        if (!hoverPoint) return;
        const [distanceText, angleText] = numericBuffer.split("<");
        const distance = parseLength(distanceText);
        if (distance === null || distance <= 0) return;
        const start = acquired[acquired.length - 1];
        const start2 = worldToPlane(start, plane), hover2 = worldToPlane(hoverPoint, plane);
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
      if (/^[0-9a-zA-Z.°<,+\- ]$/.test(event.key)) {
        event.preventDefault();
        numericBuffer += event.key;
        setToolReadout(`${activeTool.toUpperCase()} · exact input ${numericBuffer}`);
      }
    }

    activeRenderer.domElement.addEventListener("pointermove", handlePointerMove);
    activeRenderer.domElement.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      activeRenderer.domElement.removeEventListener("pointermove", handlePointerMove);
      activeRenderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
      scene.remove(preview, marker);
      preview.geometry.dispose(); previewMaterial.dispose();
      marker.geometry.dispose(); markerMaterial.dispose();
      controls.enabled = true;
      setToolReadout("");
    };
  }, [drawingTool, activeWorkPlane, snapEnabled, orthoEnabled, onDrawingCommit, onDrawingCancel]);

  const offsetPreviewRef = useRef<RenderObject | null>(null);

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
    const world = getWorldDrawingGeometry(object, feature);
    if (!world?.planeAligned) return;
    const transform = getObjectTransform(object, feature);
    const plane = feature.params.workPlane === "XZ" || feature.params.workPlane === "YZ" ? feature.params.workPlane : "XY";
    const scale = drawingPlaneScale(transform.scale, plane);
    if (!scale.uniform) return;
    const params = offsetDrawingParams(String(feature.params.kind), structuredClone(feature.params), (offsetPreview.side === "right" ? -offsetPreview.distance : offsetPreview.distance) * scale.orientation / scale.magnitude);
    if (!params) return;
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
      if (feature.type !== "drawing" || feature.output === lineEditCutterId || feature.params.kind !== "line") return [];
      const object = cadDocument.objects[feature.output];
      const layer = object ? cadDocument.layers[object.layerId] : undefined;
      const mesh = meshesRef.current.get(feature.output);
      if (!object?.visible || !layer?.visible || layer.locked || !mesh?.visible) return [];
      const world = getWorldDrawingGeometry(object, feature);
      if (!world?.points || world.points.length !== 2 || world.workPlane !== cutterWorld.workPlane) return [];
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
        const a = new THREE.Vector3(...candidate.points[0]).project(camera);
        const b = new THREE.Vector3(...candidate.points[1]).project(camera);
        const ax = (a.x + 1) * rect.width / 2, ay = (1 - a.y) * rect.height / 2;
        const bx = (b.x + 1) * rect.width / 2, by = (1 - b.y) * rect.height / 2;
        const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
        if (length2 < 1e-9) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2));
        const distance = Math.hypot(x - ax - dx * t, y - ay - dy * t);
        if (distance > 14 || (nearest && distance >= nearest.distance)) continue;
        const pickPoint: Vec3 = candidate.points[0].map((v, index) => v + (candidate.points[1][index] - v) * t) as Vec3;
        nearest = { object: candidate.object, feature: candidate.feature, pickPoint, distance };
      }
      const edit = nearest && resolveLineEdit(lineEditTool, nearest.object, nearest.feature, cutter, cutterFeature, nearest.pickPoint);
      preview.visible = Boolean(edit);
      hover = edit && nearest ? { targetId: nearest.object.id, pickPoint: nearest.pickPoint } : null;
      if (edit) {
        positions.set([...edit.preview[0], ...edit.preview[1]]);
        geometry.attributes.position.needsUpdate = true;
        geometry.computeBoundingSphere();
      }
      setToolReadout(hover ? `${lineEditTool.toUpperCase()} · click highlighted segment` : `${lineEditTool.toUpperCase()} · hover a valid line; Esc to cancel`);
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      update(event);
      if (hover) onLineEditCommitRef.current?.(lineEditTool, hover.targetId, hover.pickPoint);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onLineEditCancelRef.current?.();
    };
    renderer.domElement.addEventListener("pointermove", update);
    renderer.domElement.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    setToolReadout(`${lineEditTool.toUpperCase()} · hover a valid line; Esc to cancel`);
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
      {selectionBox && <div className={`cad-selection-box${selectionBox.crossing ? " cad-selection-box-crossing" : ""}`} style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} aria-hidden="true" />}
      {contextMenu && <div className="cad-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onMouseLeave={() => setContextMenu(null)}>
        {(contextMenu.kind === "object"
          ? ([['fit-selection', 'Fit Selection'], ['duplicate', 'Duplicate'], ['hide', 'Hide'], ['isolate', 'Isolate'], ['delete', 'Delete']] as const)
          : ([['fit-all', 'Fit All'], ['top', 'Top'], ['front', 'Front'], ['right', 'Right'], ['isometric', 'Isometric'], ['toggle-projection', 'Perspective / Orthographic'], ['toggle-grid', 'Toggle Grid']] as const)
        ).map(([action, label]) => <button key={action} type="button" role="menuitem" onClick={() => { setContextMenu(null); onContextMenuActionRef.current?.(action); }}>{label}</button>)}
      </div>}
      {toolReadout && <div className="cad-tool-readout" role="status">{toolReadout}</div>}
    </>
  );
}
