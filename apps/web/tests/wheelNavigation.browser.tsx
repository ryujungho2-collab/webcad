import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { CadViewport } from "../src/viewport/CadViewport";
import { cadDocument } from "../src/state/cadDocument";
import { installBrowserChecks } from "./helpers/browserChecks";

// Avoid automatic framing of asynchronously loaded demo solids during checks.
cadDocument.objects = {};
cadDocument.features = {};
cadDocument.sketches = {};
cadDocument.rootObjects = [];

// Observe camera matrix updates from the viewport and its render loop.
let camera: THREE.Camera;
const updateMatrixWorld = THREE.Camera.prototype.updateMatrixWorld;
THREE.Camera.prototype.updateMatrixWorld = function(force) {
  camera = this;
  return updateMatrixWorld.call(this, force);
};
const root = createRoot(document.getElementById("root")!);
function mount(mode: "2d" | "3d") {
  root.render(<CadViewport documentRevision={0} selectedObjectId={null} projectionMode="perspective"
    gridVisible workspaceMode={mode} viewAction={null} transformMode={null} />);
}
mount("3d");
const button = document.getElementById("run-navigation") as HTMLButtonElement;
const output = document.getElementById("navigation-result")!;
const pause = () => new Promise(resolve => setTimeout(resolve, 500));
button.onclick = async () => {
  const lines: string[] = [];
  const check = (condition: boolean, label: string) => {
    if (!condition) throw new Error(label);
    lines.push(`PASS: ${label}`); output.textContent = lines.join("\n");
  };
  try {
    for (let attempt = 0; !camera && attempt < 20; attempt++) await pause();
    mount("2d");
    await pause();
    const canvas = document.querySelector("canvas")!;
    const bounds = canvas.getBoundingClientRect();
    const clientX = Math.round(bounds.left + bounds.width * 0.7), clientY = Math.round(bounds.top + bounds.height * 0.25);
    const pointer = new THREE.Vector2((clientX - bounds.left) / bounds.width * 2 - 1, 1 - (clientY - bounds.top) / bounds.height * 2);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, camera);
    const anchor = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3())!;
    const documentBefore = JSON.stringify(cadDocument);
    async function wheel(modifiers: Partial<WheelEventInit>) {
      const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100,
        clientX, clientY, ...modifiers });
      canvas.dispatchEvent(event);
      check(event.defaultPrevented, "Canvas consumes wheel input to prevent browser scroll/zoom");
      await pause();
    }
    const zoom = (camera as THREE.OrthographicCamera).zoom;
    await wheel({ ctrlKey: true });
    const projected = anchor.clone().project(camera);
    check((camera as THREE.OrthographicCamera).zoom > zoom && Math.abs(projected.x - pointer.x) < 1e-6
      && Math.abs(projected.y - pointer.y) < 1e-6, `Ctrl wheel zooms around cursor after rendered frames (${zoom} -> ${(camera as THREE.OrthographicCamera).zoom}, anchor ${projected.x}, ${projected.y})`);
    const beforePan = anchor.clone().project(camera), panZoom = (camera as THREE.OrthographicCamera).zoom;
    await wheel({ shiftKey: true, deltaY: 100 });
    const afterPan = anchor.clone().project(camera);
    check(afterPan.x < beforePan.x && Math.abs(afterPan.y - beforePan.y) < 1e-6
      && (camera as THREE.OrthographicCamera).zoom === panZoom, "Shift wheel pans horizontally without dolly");
    const beforeVertical = anchor.clone().project(camera);
    await wheel({ deltaY: 100 });
    const afterVertical = anchor.clone().project(camera);
    check(Math.abs(afterVertical.x - beforeVertical.x) < 1e-6 && afterVertical.y > beforeVertical.y
      && (camera as THREE.OrthographicCamera).zoom === panZoom, `Plain wheel pans vertically without zooming (${beforeVertical.x},${beforeVertical.y} -> ${afterVertical.x},${afterVertical.y}, zoom ${(camera as THREE.OrthographicCamera).zoom})`);
    const up = camera.up.clone(), position = camera.position.clone();
    await wheel({ altKey: true });
    check(camera.up.distanceTo(up) > 0.1 && camera.position.distanceTo(position) < 1e-6,
      "Alt wheel rotates 2D screen without leaving work plane");
    mount("3d"); await pause();
    const direction = camera.getWorldDirection(new THREE.Vector3());
    await wheel({ altKey: true });
    check(camera.getWorldDirection(new THREE.Vector3()).distanceTo(direction) > 0.05, "Alt wheel orbits the rendered 3D camera");
    check(JSON.stringify(cadDocument) === documentBefore, "View navigation leaves document unchanged");
    output.textContent = `${lines.join("\n")}\nALL ${lines.length} CHECKS PASSED`;
  } catch (error) { output.textContent += `\nFAIL: ${error instanceof Error ? error.message : String(error)}`; }
};
installBrowserChecks(button, output);
