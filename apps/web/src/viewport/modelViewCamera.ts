import * as THREE from "three";
import { validModelViewCamera, type CadModelViewCamera } from "@agent-webcad/cad-document";

export type ModelViewCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
/** Capture only the supported viewport projection; arbitrary lens offsets are not silently lost. */
export function captureModelViewCamera(camera: ModelViewCamera, target: THREE.Vector3): CadModelViewCamera {
  if (camera.view?.enabled || camera instanceof THREE.PerspectiveCamera && camera.filmOffset !== 0)
    throw new Error("Offset camera projections are not supported by model views.");
  const eye = camera.getWorldPosition(new THREE.Vector3());
  const orientation = camera.getWorldQuaternion(new THREE.Quaternion());
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation);
  if (direction.dot(target.clone().sub(eye).normalize()) < 1 - 1e-8)
    throw new Error("The camera direction must face its orbit target before saving a model view.");
  const base = { eye: eye.toArray() as [number, number, number], target: target.toArray() as [number, number, number],
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(orientation).normalize().toArray() as [number, number, number],
    near: camera.near, far: camera.far, zoom: camera.zoom };
  const state: CadModelViewCamera = camera instanceof THREE.PerspectiveCamera ?
    { ...base, projection: "perspective", fov: camera.fov, aspect: camera.aspect } :
    { ...base, projection: "orthographic", left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom };
  if (!validModelViewCamera(state)) throw new Error("Invalid model view camera.");
  return state;
}

/** Detached restoration for G6-A2. At a new aspect, preserve vertical framing and ortho frame center. */
export function cameraFromModelView(state: CadModelViewCamera, aspect?: number): ModelViewCamera {
  if (!validModelViewCamera(state) || aspect !== undefined && (!Number.isFinite(aspect) || aspect <= 0))
    throw new Error("Invalid model view camera or viewport aspect.");
  let camera: ModelViewCamera;
  if (state.projection === "perspective") camera = new THREE.PerspectiveCamera(state.fov, aspect ?? state.aspect, state.near, state.far);
  else {
    const center = state.left / 2 + state.right / 2;
    const halfWidth = aspect === undefined ? (state.right - state.left) / 2 : (state.top - state.bottom) * aspect / 2;
    camera = new THREE.OrthographicCamera(center - halfWidth, center + halfWidth, state.top, state.bottom, state.near, state.far);
  }
  camera.position.set(...state.eye); camera.up.set(...state.up); camera.zoom = state.zoom;
  camera.lookAt(new THREE.Vector3(...state.target)); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  if (!camera.projectionMatrix.elements.every(Number.isFinite) || !camera.projectionMatrixInverse.elements.every(Number.isFinite))
    throw new Error("Model view framing cannot form a finite projection.");
  return camera;
}
