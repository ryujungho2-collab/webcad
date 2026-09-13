import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

import { cadDocument } from "../state/cadDocument";
import { getObjectTransform } from "../state/objectTransform";
import { buildBoxMesh, buildDemoPartMesh, subscribeKernelStatus, type KernelStatus } from "./kernelGeometryService";

type CadViewportProps = {
  documentRevision: number;
  selectedObjectId: string | null;
  projectionMode: "perspective" | "orthographic";
  gridVisible: boolean;
  viewAction: ViewportAction | null;
  transformMode: TransformMode | null;
  onKernelStatus?: (status: KernelStatus) => void;
  onTransformCommit?: (objectId: string, mode: TransformMode, transform: ObjectTransformValue) => void;
  onSelectObject?: (objectId: string | null) => void;
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
export type ObjectTransformValue = {
  translation: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

type ViewCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
type AdaptiveGrid = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

const DEFAULT_COLOR = 0x4f8cff;
const SELECTED_COLOR = 0xffc107;

function createAdaptiveGrid(): AdaptiveGrid {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      minorStep: { value: 1 },
      majorStep: { value: 10 },
      fadeDistance: { value: 100 },
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

      float gridLine(float stepSize) {
        vec2 coordinate = worldPosition.xy / stepSize;
        vec2 width = max(fwidth(coordinate), vec2(0.0001));
        vec2 grid = abs(fract(coordinate - 0.5) - 0.5) / width;
        return 1.0 - min(min(grid.x, grid.y), 1.0);
      }

      void main() {
        float minor = gridLine(minorStep);
        float major = gridLine(majorStep);
        float distanceFromCamera = length(worldPosition.xy - cameraPosition.xy);
        float fade = 1.0 - smoothstep(fadeDistance * 0.35, fadeDistance, distanceFromCamera);

        vec3 color = mix(vec3(0.16, 0.18, 0.22), vec3(0.28, 0.32, 0.38), major);
        float axisWidth = max(fwidth(worldPosition.x), fwidth(worldPosition.y));
        float xAxis = 1.0 - smoothstep(0.0, axisWidth * 1.5, abs(worldPosition.y));
        float yAxis = 1.0 - smoothstep(0.0, axisWidth * 1.5, abs(worldPosition.x));
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
  onKernelStatus,
  onTransformCommit,
  onSelectObject,
}: CadViewportProps) {
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

  const meshesRef =
    useRef<Map<string, THREE.Mesh>>(
      new Map()
    );

  const selectedObjectIdRef =
    useRef<string | null>(
      selectedObjectId
    );

  const onSelectObjectRef =
    useRef(onSelectObject);
  const onTransformCommitRef = useRef(onTransformCommit);

  useEffect(() => {
    onSelectObjectRef.current =
      onSelectObject;
  }, [onSelectObject]);

  useEffect(() => {
    onTransformCommitRef.current = onTransformCommit;
  }, [onTransformCommit]);

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
    mesh: THREE.Mesh
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
      const material =
        mesh.material as
          THREE.MeshStandardMaterial;

      material.color.set(
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
    if (type === "top") camera.up.set(0, 1, 0);
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    camera.lookAt(controls.target);
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
      const mesh = transformControls.object as THREE.Mesh | undefined;
      const objectId = mesh?.userData.cadObjectId as string | undefined;
      if (!mesh || !objectId) return;
      onTransformCommitRef.current?.(objectId, transformControls.getMode() as TransformMode, {
        translation: mesh.position.toArray() as [number, number, number],
        rotation: [
          THREE.MathUtils.radToDeg(mesh.rotation.x),
          THREE.MathUtils.radToDeg(mesh.rotation.y),
          THREE.MathUtils.radToDeg(mesh.rotation.z),
        ],
        scale: mesh.scale.toArray() as [number, number, number],
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
      grid.position.x = Math.round(controls.target.x / minorStep) * minorStep;
      grid.position.y = Math.round(controls.target.y / minorStep) * minorStep;
      grid.scale.setScalar(fadeDistance);
      grid.material.uniforms.minorStep.value = minorStep;
      grid.material.uniforms.majorStep.value = minorStep * 10;
      grid.material.uniforms.fadeDistance.value = fadeDistance;

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
            feature?.type === "primitive"
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
          feature.type !==
            "primitive"
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

        const width =
          Number(
            feature.params.width
          );

        const depth =
          Number(
            feature.params.depth
          );

        const height =
          Number(
            feature.params.height
          );

        const meshData = await buildBoxMesh(width, depth, height);

        if (cancelled) {
          return;
        }

        const mesh =
          createThreeMesh(
            objectId,
            meshData
          );

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
          mesh.position.fromArray(transform.translation);
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

  return (
    <div
      ref={hostRef}
      className="cad-viewport"
    />
  );
}
