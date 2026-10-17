import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { navigateWheel, wheelPixels } from "../src/viewport/wheelNavigation";

const rect = { left: 30, top: 50, width: 1000, height: 600 };
const limits = { minZoom: 0.1, maxZoom: 100, minDistance: 1, maxDistance: 1000 };
const wheel = (overrides: Partial<WheelEvent> = {}) => ({ deltaX: 0, deltaY: -100, deltaMode: 0,
  ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, clientX: 730, clientY: 200, ...overrides });
function cameraFor(kind: "perspective" | "orthographic", position = new THREE.Vector3(12, -18, 24)) {
  const camera = kind === "perspective" ? new THREE.PerspectiveCamera(50, rect.width / rect.height, 0.1, 2000)
    : new THREE.OrthographicCamera(-25, 25, 15, -15, 0.1, 2000);
  camera.up.set(0, 0, 1);
  camera.position.copy(position);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

for (const kind of ["perspective", "orthographic"] as const) {
  test(`${kind}: plain wheel pans vertically without changing zoom or viewing direction`, () => {
    const camera = cameraFor(kind), controls = new OrbitControls(camera, null);
    const anchor = new THREE.Vector3(), before = anchor.clone().project(camera);
    const direction = camera.getWorldDirection(new THREE.Vector3()), zoom = camera.zoom;
    const distance = camera.position.distanceTo(controls.target);
    navigateWheel(camera, controls.target, wheel({ deltaY: 100 }), rect, "3d", limits);
    controls.update();
    const after = anchor.clone().project(camera);
    near(after.x, before.x); assert.ok(after.y > before.y);
    near(camera.zoom, zoom); near(camera.position.distanceTo(controls.target), distance);
    near(camera.getWorldDirection(new THREE.Vector3()).distanceTo(direction), 0);
  });

  test(`${kind}: Ctrl zoom preserves cursor anchor, including after OrbitControls update`, () => {
    const camera = cameraFor(kind), controls = new OrbitControls(camera, null);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), controls.target);
    const pointer = new THREE.Vector2(0.4, 0.5), ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, camera);
    const anchor = ray.ray.intersectPlane(plane, new THREE.Vector3())!;
    const beforeDistance = camera.position.distanceTo(controls.target), beforeZoom = camera.zoom;
    navigateWheel(camera, controls.target, wheel({ ctrlKey: true }), rect, "3d", limits);
    controls.update();
    const projected = anchor.clone().project(camera);
    near(projected.x, pointer.x); near(projected.y, pointer.y);
    assert.ok(kind === "perspective" ? camera.position.distanceTo(controls.target) < beforeDistance : camera.zoom > beforeZoom);
    navigateWheel(camera, controls.target, wheel({ ctrlKey: true, deltaY: 100 }), rect, "3d", limits);
    controls.update();
    near(camera.zoom, beforeZoom); near(camera.position.distanceTo(controls.target), beforeDistance);
  });

  test(`${kind}: Shift wheel pans along screen horizontal without zooming`, () => {
    const camera = cameraFor(kind), target = new THREE.Vector3();
    const position = camera.position.clone(), zoom = camera.zoom;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    navigateWheel(camera, target, wheel({ shiftKey: true, deltaY: 100 }), rect, "3d", limits);
    near(camera.zoom, zoom);
    near(camera.position.clone().sub(position).distanceTo(target), 0);
    near(target.clone().normalize().dot(right), 1);
    const horizontal = target.clone();
    const otherCamera = cameraFor(kind), otherTarget = new THREE.Vector3();
    navigateWheel(otherCamera, otherTarget, wheel({ shiftKey: true, deltaY: 0, deltaX: 100 }), rect, "3d", limits);
    near(otherTarget.distanceTo(horizontal), 0);
  });
}

test("2D rotation stays in each work plane and survives controls update", () => {
  for (const [normal, up] of [[new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],
    [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1)],
    [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]]) {
    const camera = cameraFor("orthographic", normal.clone().multiplyScalar(30));
    camera.up.copy(up); camera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, null);
    controls.enableRotate = false;
    navigateWheel(camera, controls.target, wheel({ altKey: true }), rect, "2d", limits);
    controls.update();
    near(camera.position.distanceTo(normal.clone().multiplyScalar(30)), 0);
    near(camera.getWorldDirection(new THREE.Vector3()).dot(normal), -1);
    assert.ok(camera.up.distanceTo(up) > 0.1);
    const rolledUp = camera.up.clone();
    navigateWheel(camera, controls.target, wheel({ shiftKey: true }), rect, "2d", limits);
    controls.update();
    near(camera.up.distanceTo(rolledUp), 0);
    near(controls.target.dot(normal), 0);
  }
});

test("3D Alt wheel orbits about target without changing zoom or radius", () => {
  const camera = cameraFor("perspective"), controls = new OrbitControls(camera, null);
  const position = camera.position.clone(), distance = position.length();
  navigateWheel(camera, controls.target, wheel({ altKey: true }), rect, "3d", limits);
  controls.update();
  near(camera.position.length(), distance); near(camera.zoom, 1); near(controls.target.length(), 0);
  assert.ok(camera.position.distanceTo(position) > 1);
});

test("wheel units normalize and Ctrl/Cmd take precedence over Shift", () => {
  assert.deepEqual(wheelPixels(wheel({ deltaMode: 1, deltaY: 3 }), 600), { x: 0, y: 48 });
  assert.deepEqual(wheelPixels(wheel({ deltaMode: 2, deltaY: 1 }), 600), { x: 0, y: 600 });
  const camera = cameraFor("orthographic"), target = new THREE.Vector3();
  navigateWheel(camera, target, wheel({ metaKey: true, shiftKey: true }), rect, "2d", limits);
  assert.ok(camera.zoom > 1);
  camera.zoom = 100;
  navigateWheel(camera, target, wheel({ ctrlKey: true }), rect, "2d", limits);
  near(camera.zoom, 100);
  const position = camera.position.clone();
  navigateWheel(camera, target, wheel(), { ...rect, height: 0 }, "2d", limits);
  near(camera.position.distanceTo(position), 0);
});
