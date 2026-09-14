import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

import { cadDocument } from "../state/cadDocument";
import { getObjectTransform } from "../state/objectTransform";
import { parseAngle, parseLength } from "../precision/units";
import { querySnap, type SnapEntity, type SnapResult } from "../precision/snapEngine";
import { intersectRayWithWorkPlane, planeToWorld, WORK_PLANES, worldToPlane, type Vec3, type WorkPlaneId } from "../precision/workPlane";
import { easeWorkspaceTransition, workspaceTransitionDuration, type WorkspaceMode } from "./workspaceTransition";
import { buildBooleanMesh, buildDemoPartMesh, buildPrimitiveMesh, subscribeKernelStatus, type KernelStatus } from "./kernelGeometryService";

type CadViewportProps = {
  documentRevision: number;
  selectedObjectId: string | null;
  projectionMode: "perspective" | "orthographic";
  gridVisible: boolean;
  viewAction: ViewportAction | null;
  transformMode: TransformMode | null;
  drawingTool?: DrawingTool | null;
  activeWorkPlane?: WorkPlaneId;
  snapEnabled?: boolean;
  orthoEnabled?: boolean;
  workspaceMode?: WorkspaceMode;
  onKernelStatus?: (status: KernelStatus) => void;
  onTransformCommit?: (objectId: string, mode: TransformMode, transform: ObjectTransformValue) => void;
  onSelectObject?: (objectId: string | null) => void;
  onDrawingCommit?: (drawing: DrawingTool, params: Record<string, unknown>) => void;
  onDrawingCancel?: () => void;
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

function drawingPoints(params: Record<string, unknown>, planeId: WorkPlaneId): Vec3[] {
  const kind = String(params.kind ?? "");
  if ((kind === "line" || kind === "polyline" || kind === "rectangle") && Array.isArray(params.points)) {
    const points = params.points as Vec3[];
    return kind === "rectangle" ? [...points, points[0]] : points;
  }
  if ((kind === "circle" || kind === "arc") && Array.isArray(params.center)) {
    const center = params.center as Vec3;
    const radius = Number(params.radius);
    const start = kind === "arc" ? Number(params.startAngle) : 0;
    const end = kind === "arc" ? Number(params.endAngle) : Math.PI * 2;
    const c = worldToPlane(center, WORK_PLANES[planeId]);
    const count = kind === "circle" ? 64 : Math.max(12, Math.ceil(Math.abs(end - start) / (Math.PI / 32)));
    return Array.from({ length: count + 1 }, (_, index) => {
      const angle = start + (end - start) * index / count;
      return planeToWorld([c[0] + Math.cos(angle) * radius, c[1] + Math.sin(angle) * radius], WORK_PLANES[planeId]);
    });
  }
  return [];
}

function drawingOrigin(params: Record<string, unknown>, planeId: WorkPlaneId): Vec3 {
  const points = drawingPoints(params, planeId);
  if (!points.length) return [0, 0, 0];
  const bounds = new THREE.Box3().setFromPoints(points.map((point) => new THREE.Vector3(...point)));
  return bounds.getCenter(new THREE.Vector3()).toArray() as Vec3;
}

function createDrawingObject(objectId: string, params: Record<string, unknown>): RenderObject {
  const planeId = (params.workPlane === "XZ" || params.workPlane === "YZ" ? params.workPlane : "XY") as WorkPlaneId;
  const points = drawingPoints(params, planeId);
  const origin = drawingOrigin(params, planeId);
  const pivot = new THREE.Vector3(...origin);
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point).sub(pivot)));
  const material = new THREE.LineBasicMaterial({ color: DEFAULT_COLOR, linewidth: 1 });
  const renderObject = params.kind === "rectangle" || params.kind === "circle"
    ? new THREE.LineLoop(geometry, material)
    : new THREE.Line(geometry, material);
  renderObject.userData.cadObjectId = objectId;
  renderObject.userData.drawingOrigin = origin;
  return renderObject;
}

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
  projectionMode,
  gridVisible,
  viewAction,
  transformMode,
  drawingTool = null,
  activeWorkPlane = "XY",
  snapEnabled = true,
  orthoEnabled = false,
  workspaceMode = "3d",
  onKernelStatus,
  onTransformCommit,
  onSelectObject,
  onDrawingCommit,
  onDrawingCancel,
}: CadViewportProps) {
  const [toolReadout, setToolReadout] = useState("");
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
  const firstGeometryReadyRef = useRef(false);
  const activeWorkPlaneRef = useRef(WORK_PLANES[activeWorkPlane]);
  const cameraWorkspaceRef = useRef({ mode: workspaceMode, plane: activeWorkPlane });
  const saved3dViewRef = useRef<{ direction: THREE.Vector3; distance: number } | null>(null);

  const meshesRef =
    useRef<Map<string, RenderObject>>(
      new Map()
    );

  const selectedObjectIdRef =
    useRef<string | null>(
      selectedObjectId
    );

  const onSelectObjectRef =
    useRef(onSelectObject);
  const onTransformCommitRef = useRef(onTransformCommit);
  const drawingToolRef = useRef(drawingTool);

  useEffect(() => {
    onSelectObjectRef.current =
      onSelectObject;
  }, [onSelectObject]);

  useEffect(() => {
    onTransformCommitRef.current = onTransformCommit;
  }, [onTransformCommit]);

  useEffect(() => { drawingToolRef.current = drawingTool; }, [drawingTool]);

  useEffect(() => { activeWorkPlaneRef.current = WORK_PLANES[activeWorkPlane]; }, [activeWorkPlane]);

  useEffect(() => subscribeKernelStatus((status) => onKernelStatus?.(status)), [onKernelStatus]);

  /*
   * React selection is authoritative.
   */
  useEffect(() => {
    selectedObjectIdRef.current =
      selectedObjectId;

    applySelectionColor();
  }, [selectedObjectId]);

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
    const activeId =
      selectedObjectIdRef.current;

    for (
      const [
        objectId,
        mesh,
      ]
      of meshesRef.current
    ) {
      const material = mesh.material as THREE.Material & { color?: THREE.Color };

      material.color?.set(
        objectId === activeId
          ? SELECTED_COLOR
          : DEFAULT_COLOR
      );
    }
  }

  function updateSelection(
    objectId: string | null
  ) {
    selectedObjectIdRef.current =
      objectId;

    applySelectionColor();

    onSelectObjectRef.current?.(
      objectId
    );
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
    controls.attach(mesh);
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
    let transformDragActive = false;
    transformControls.addEventListener("mouseDown", () => {
      transformDragActive = true;
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
      onTransformCommitRef.current?.(objectId, transformControls.getMode() as TransformMode, {
        translation: renderObject.position.clone().sub(drawingPivot).toArray() as [number, number, number],
        rotation: [
          THREE.MathUtils.radToDeg(renderObject.rotation.x),
          THREE.MathUtils.radToDeg(renderObject.rotation.y),
          THREE.MathUtils.radToDeg(renderObject.rotation.z),
        ],
        scale: renderObject.scale.toArray() as [number, number, number],
      });
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

      if (
        hits.length === 0
      ) {
        updateSelection(
          null
        );

        return;
      }

      const objectId =
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

      updateSelection(
        objectId
      );
    }

    renderer.domElement
      .addEventListener(
        "pointerdown",
        handlePointerDown
      );

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

      controls.dispose();
      transformControls.detach();
      transformControls.dispose();
      scene.remove(transformHelper);

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
        if (selectedObjectIdRef.current) fitMeshes(new Set([selectedObjectIdRef.current]));
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
  }, [selectedObjectId, transformMode, documentRevision]);

  /*
   * Synchronize CadDocument
   * into Three.js meshes.
   */
  useEffect(() => {
    let cancelled =
      false;

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
            feature?.type === "primitive" || feature?.type === "boolean" || feature?.type === "drawing"
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
          (feature.type !== "primitive" && feature.type !== "boolean" && feature.type !== "drawing")
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
        const effectivelyVisible = cadObject.visible && (layer?.visible ?? true);

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
          ? createDrawingObject(objectId, feature.params)
          : createThreeMesh(objectId, feature.type === "boolean"
            ? await buildBooleanMesh(feature.params)
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

        const visible =
          cadObject.visible &&
          (
            layer?.visible ??
            true
          );
        if (mesh.visible !== visible) {
          mesh.visible = visible;
          visibilityUpdateCount += 1;
        }
      }

      /*
       * Validate current selection.
       */
      const activeId =
        selectedObjectIdRef.current;

      if (activeId) {
        const activeObject =
          cadDocument.objects[
            activeId
          ];

        const activeLayer =
          activeObject
            ? cadDocument.layers[
                activeObject.layerId
              ]
            : null;

        if (
          !activeObject ||
          !activeObject.visible ||
          !activeLayer?.visible ||
          activeLayer.locked
        ) {
          selectedObjectIdRef.current =
            null;

          onSelectObjectRef.current?.(
            null
          );
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
  }, [documentRevision]);

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
      const pivot = feature?.type === "drawing" ? new THREE.Vector3(...drawingOrigin(feature.params, planeId)) : new THREE.Vector3();
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
        const matrix = entityTransform(object.id);
        const transformPoint = (point: Vec3) => new THREE.Vector3(...point).applyMatrix4(matrix).toArray() as Vec3;
        const transform = getObjectTransform(object, feature);
        result.push({
          objectId: object.id,
          kind: kind as SnapEntity["kind"],
          points: Array.isArray(feature.params.points) ? (feature.params.points as Vec3[]).map(transformPoint) : undefined,
          center: Array.isArray(feature.params.center) ? transformPoint(feature.params.center as Vec3) : undefined,
          radius: typeof feature.params.radius === "number" ? feature.params.radius * Math.max(transform.scale[0], transform.scale[1]) : undefined,
          startAngle: typeof feature.params.startAngle === "number" ? feature.params.startAngle : undefined,
          endAngle: typeof feature.params.endAngle === "number" ? feature.params.endAngle : undefined,
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
        return drawingPoints({ kind: "circle", center: acquired[0], radius: Math.hypot(b[0] - a[0], b[1] - a[1]) }, activeWorkPlane);
      }
      if (activeTool === "arc" && acquired[0]) {
        const c = worldToPlane(acquired[0], plane);
        const startPoint = acquired[1] ?? point;
        const s = worldToPlane(startPoint, plane), e = worldToPlane(point, plane);
        return drawingPoints({ kind: "arc", center: acquired[0], radius: Math.hypot(s[0] - c[0], s[1] - c[1]), startAngle: Math.atan2(s[1] - c[1], s[0] - c[0]), endAngle: Math.atan2(e[1] - c[1], e[0] - c[0]) }, activeWorkPlane);
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
      const snapped = snapEnabled ? querySnap({ point: raw, entities: snapEntities(), plane, gridStep: 1, tolerancePx: 12, project }) : null;
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
      setToolReadout(`${activeTool.toUpperCase()} · ${acquiredPoint.snap?.type ?? (orthoEnabled ? "ortho" : "free")} · ${numericBuffer || worldToPlane(hoverPoint, plane).map((value) => value.toFixed(2)).join(", ")} mm`);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      event.preventDefault();
      const raw = worldPoint(event);
      if (!raw) return;
      const point = acquirePoint(raw).point;
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
        if (event.detail >= 2 && acquired.length >= 1) commit({ points: [...acquired, point] });
        else acquired.push(point);
      }
      numericBuffer = "";
      updatePreview(point);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onDrawingCancel?.(); return; }
      if (event.key === "Backspace") { event.preventDefault(); numericBuffer = numericBuffer.slice(0, -1); return; }
      if (event.key === "Enter") {
        event.preventDefault();
        if (activeTool === "polyline" && !numericBuffer && acquired.length >= 2) { commit({ points: acquired }); return; }
        if (!numericBuffer || acquired.length === 0 || !hoverPoint) return;
        const [distanceText, angleText] = numericBuffer.split("<");
        const distance = parseLength(distanceText);
        if (!distance || distance <= 0) return;
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

  return (
    <>
      <div ref={hostRef} className="cad-viewport" />
      {toolReadout && <div className="cad-tool-readout" role="status">{toolReadout}</div>}
    </>
  );
}
