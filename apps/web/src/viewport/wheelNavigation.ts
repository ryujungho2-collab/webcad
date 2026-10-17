import * as THREE from "three";

type ViewCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
type WheelInput = Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "clientX" | "clientY">;
type ViewRect = Pick<DOMRect, "left" | "top" | "width" | "height">;

export const VIEW_NAVIGATION_HINT = "Wheel: pan vertically · Ctrl+wheel: zoom at cursor · Shift+wheel: pan horizontally · Alt+wheel: rotate view · Middle drag: pan · Shift+middle drag: orbit in 3D";

/** Wheel deltas use pixels, lines, or pages depending on the input device. */
export function wheelPixels(event: WheelInput, height: number): { x: number; y: number } {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
  return { x: event.deltaX * unit, y: event.deltaY * unit };
}

/** Navigation moves only the camera and its target, never document geometry. */
export function navigateWheel(camera: ViewCamera, target: THREE.Vector3, event: WheelInput, rect: ViewRect,
  mode: "2d" | "3d", limits: { minZoom: number; maxZoom: number; minDistance: number; maxDistance: number }): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const delta = wheelPixels(event, rect.height);
  const amount = delta.y || delta.x;
  camera.updateMatrixWorld();
  const zoom = event.ctrlKey || event.metaKey;
  if (!zoom && (event.shiftKey || !event.altKey)) {
    const height = camera instanceof THREE.OrthographicCamera
      ? (camera.top - camera.bottom) / camera.zoom
      : 2 * camera.position.distanceTo(target) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / camera.zoom;
    // Some browsers already convert Shift+wheel into deltaX.
    const movement = event.shiftKey
      ? new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(amount * height / rect.height)
      : new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(delta.x * height / rect.height)
        .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), -delta.y * height / rect.height);
    camera.position.add(movement);
    target.add(movement);
  } else if (event.altKey && !zoom) {
    const angle = THREE.MathUtils.clamp(amount, -240, 240) * 0.002;
    if (mode === "2d") {
      camera.up.applyAxisAngle(camera.getWorldDirection(new THREE.Vector3()), angle).normalize();
    } else {
      camera.position.sub(target).applyAxisAngle(camera.up.clone().normalize(), angle).add(target);
    }
    camera.lookAt(target);
  } else {
    // Keep the point under the pointer fixed on the view plane through target.
    // This works in perspective views too, including when looking down a plane.
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), target);
    const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, camera);
    const before = ray.ray.intersectPlane(plane, new THREE.Vector3());
    const factor = Math.exp(THREE.MathUtils.clamp(amount, -240, 240) * 0.002);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom / factor, Math.max(limits.minZoom, 1e-6), limits.maxZoom);
      camera.updateProjectionMatrix();
    } else {
      const distance = camera.position.distanceTo(target);
      const next = THREE.MathUtils.clamp(distance * factor, Math.max(limits.minDistance, camera.near * 2), limits.maxDistance);
      if (distance > 0) camera.position.sub(target).multiplyScalar(next / distance).add(target);
    }
    camera.updateMatrixWorld();
    ray.setFromCamera(pointer, camera);
    const after = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (before && after) {
      const movement = before.sub(after);
      camera.position.add(movement);
      target.add(movement);
    }
  }
  camera.updateMatrixWorld();
}
