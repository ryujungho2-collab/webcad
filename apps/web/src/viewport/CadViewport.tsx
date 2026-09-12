import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  createBox,
  createCylinder,
  translate,
  cut,
  shapeToMesh,
} from "@agent-webcad/cad-kernel";

export function CadViewport() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111318);

    const camera = new THREE.PerspectiveCamera(
      45,
      host.clientWidth / host.clientHeight,
      0.1,
      1000
    );

    camera.position.set(24, 24, 24);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
    });

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 2)
    );

    renderer.setSize(
      host.clientWidth,
      host.clientHeight
    );

    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(
      camera,
      renderer.domElement
    );

    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const ambientLight = new THREE.AmbientLight(
      0xffffff,
      1.5
    );

    scene.add(ambientLight);

    const directionalLight =
      new THREE.DirectionalLight(
        0xffffff,
        2.5
      );

    directionalLight.position.set(20, 30, 40);
    scene.add(directionalLight);

    const grid = new THREE.GridHelper(
      50,
      50,
      0x444444,
      0x222222
    );

    scene.add(grid);

    let disposed = false;
    let meshObject: THREE.Mesh | null = null;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let selected = false;

    function setSelected(nextSelected: boolean) {
      if (!meshObject) {
        return;
      }

      const material =
        meshObject.material as THREE.MeshStandardMaterial;

      selected = nextSelected;

      material.color.set(
        selected
          ? 0xffc107
          : 0x4f8cff
      );
    }

    function handlePointerDown(event: PointerEvent) {
      if (!meshObject) {
        return;
      }

      const rect =
        renderer.domElement.getBoundingClientRect();

      pointer.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1;

      pointer.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(
        pointer,
        camera
      );

      const hits =
        raycaster.intersectObject(
          meshObject,
          false
        );

      setSelected(hits.length > 0);
    }

    async function buildCadShape() {
      const box = await createBox(
        10,
        10,
        10
      );

      const cylinder = await createCylinder(
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

      const result = await cut(
        box,
        movedCylinder
      );

      const meshData =
        await shapeToMesh(result);

      if (disposed) {
        return;
      }

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
          color: 0x4f8cff,
          metalness: 0.05,
          roughness: 0.55,
          side: THREE.DoubleSide,
        });

      meshObject = new THREE.Mesh(
        geometry,
        material
      );

      scene.add(meshObject);

      const box3 = new THREE.Box3().setFromObject(meshObject);

      const center = box3.getCenter(

        new THREE.Vector3()
        );

      const size =
        box3.getSize(
          new THREE.Vector3()
        );

      const maxDimension = Math.max(
        size.x,
        size.y,
        size.z
      );

      const fov = THREE.MathUtils.degToRad(
        camera.fov
      );

      let distance =
        maxDimension /
        (2 * Math.tan(fov / 2));

      distance *= 1.5;

      camera.position.set(
        center.x + distance,
        center.y + distance,
        center.z + distance
      );

      camera.near = Math.max(
        distance / 100,
        0.01
      );

      camera.far = distance * 100;

      camera.updateProjectionMatrix();

      controls.target.copy(center);
      controls.update();
    }

    buildCadShape().catch(
      console.error
    );

    function render() {
      if (disposed) {
        return;
      }

      controls.update();

      renderer.render(
        scene,
        camera
      );

      requestAnimationFrame(
        render
      );
    }

    render();

    function resize() {
      if (!host) {
        return;
      }

      const width =
        host.clientWidth;

      const height =
        host.clientHeight;

      camera.aspect =
        width / height;

      camera.updateProjectionMatrix();

      renderer.setSize(
        width,
        height
      );
    }

    window.addEventListener(
      "resize",
      resize
    );

    renderer.domElement.addEventListener(
      "pointerdown",
      handlePointerDown
    );

    return () => {
      disposed = true;

      controls.dispose();

      renderer.domElement.removeEventListener(
        "pointerdown",
        handlePointerDown
      );

      window.removeEventListener(
        "resize",
        resize
      );

      if (meshObject) {
        meshObject.geometry.dispose();

        const material =
          meshObject.material;

        if (Array.isArray(material)) {
          material.forEach(
            (entry) =>
              entry.dispose()
          );
        } else {
          material.dispose();
        }
      }

      renderer.dispose();

      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="cad-viewport"
    />
  );
}
