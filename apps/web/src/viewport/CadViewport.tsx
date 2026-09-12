import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { cadDocument } from "../state/cadDocument";

import {
  createBox,
  createCylinder,
  translate,
  cut,
  shapeToMesh,
} from "@agent-webcad/cad-kernel";

type CadViewportProps = {
  documentRevision: number;

  selectedObjectId: string | null;

  onSelectObject?: (
    objectId: string | null
  ) => void;
};

const DEFAULT_COLOR = 0x4f8cff;
const SELECTED_COLOR = 0xffc107;

export function CadViewport({
  documentRevision,
  selectedObjectId,
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

  const cameraRef =
    useRef<THREE.PerspectiveCamera | null>(
      null
    );

  const rendererRef =
    useRef<THREE.WebGLRenderer | null>(
      null
    );

  const controlsRef =
    useRef<OrbitControls | null>(
      null
    );

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

  useEffect(() => {
    onSelectObjectRef.current =
      onSelectObject;
  }, [onSelectObject]);

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

    const grid =
      new THREE.GridHelper(
        50,
        50,
        0x444444,
        0x222222
      );

    scene.add(
      grid
    );

    sceneRef.current =
      scene;

    cameraRef.current =
      camera;

    rendererRef.current =
      renderer;

    controlsRef.current =
      controls;

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

      camera.aspect =
        width / height;

      camera
        .updateProjectionMatrix();

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

      renderer.render(
        scene,
        camera
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

      renderer.dispose();

      renderer.domElement.remove();

      sceneRef.current =
        null;

      cameraRef.current =
        null;

      rendererRef.current =
        null;

      controlsRef.current =
        null;
    };
  }, []);

  /*
   * Synchronize CadDocument
   * into Three.js meshes.
   */
  useEffect(() => {
    let cancelled =
      false;

    async function syncDocument() {
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

      /*
       * Remove all generated document
       * meshes. Keep static demo-part.
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
        if (
          objectId ===
          "demo-part"
        ) {
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
      }

      /*
       * Build demo part only once.
       */
      if (
        !meshesRef.current.has(
          "demo-part"
        )
      ) {
        const box =
          await createBox(
            10,
            10,
            10
          );

        const cylinder =
          await createCylinder(
            3,
            14
          );

        const movedCylinder =
          await translate(
            cylinder,
            5,
            5,
            -2
          );

        const result =
          await cut(
            box,
            movedCylinder
          );

        const meshData =
          await shapeToMesh(
            result
          );

        if (cancelled) {
          return;
        }

        const demoMesh =
          createThreeMesh(
            "demo-part",
            meshData
          );

        meshesRef.current.set(
          "demo-part",
          demoMesh
        );

        scene.add(
          demoMesh
        );

        /*
         * Initial camera fit only.
         */
        const bounds =
          new THREE.Box3()
            .setFromObject(
              demoMesh
            );

        const center =
          bounds.getCenter(
            new THREE.Vector3()
          );

        const size =
          bounds.getSize(
            new THREE.Vector3()
          );

        const maxDimension =
          Math.max(
            size.x,
            size.y,
            size.z
          );

        const fov =
          THREE.MathUtils.degToRad(
            camera.fov
          );

        let distance =
          maxDimension /
          (
            2 *
            Math.tan(
              fov / 2
            )
          );

        distance *=
          1.5;

        camera.position.set(
          center.x +
            distance,
          center.y +
            distance,
          center.z +
            distance
        );

        camera.near =
          Math.max(
            distance / 100,
            0.01
          );

        camera.far =
          distance * 100;

        camera
          .updateProjectionMatrix();

        controls.target.copy(
          center
        );

        controls.update();
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
          Object.values(
            cadDocument.features
          ).find(
            (entry) =>
              entry.output ===
              objectId
          );

        if (
          !feature ||
          feature.type !==
            "primitive"
        ) {
          continue;
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

        const position =
          (
            feature.params
              .position ??
            [0, 0, 0]
          ) as [
            number,
            number,
            number,
          ];

        let shape =
          await createBox(
            width,
            depth,
            height
          );

        if (
          position[0] !== 0 ||
          position[1] !== 0 ||
          position[2] !== 0
        ) {
          shape =
            await translate(
              shape,
              position[0],
              position[1],
              position[2]
            );
        }

        const meshData =
          await shapeToMesh(
            shape
          );

        if (cancelled) {
          return;
        }

        const mesh =
          createThreeMesh(
            objectId,
            meshData
          );

        meshesRef.current.set(
          objectId,
          mesh
        );

        scene.add(
          mesh
        );
      }

      /*
       * Visibility first.
       */
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

        const layer =
          cadDocument.layers[
            cadObject.layerId
          ];

        mesh.visible =
          cadObject.visible &&
          (
            layer?.visible ??
            true
          );
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