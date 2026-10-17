import { requestProjectFrame as requestAnimationFrame, cancelProjectFrame as cancelAnimationFrame } from "../app/projectActivity";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import * as THREE from "three";
import type { CadImageCrop, CadImageNodeParams, CadRasterAsset } from "@agent-webcad/cad-document";
import { cadDocument } from "../state/cadDocument";
import type { Vec3 } from "../precision/workPlane";
import { cropFromImageCropHandle, imageCropBoundaryPoints, type ImageCropHandle, type CropPoint } from "./imageCropGeometry";

type PositionedPoint = { x: number; y: number };
type DisplayHandle = { name: ImageCropHandle; point: PositionedPoint; value: number };
const handleNames: ImageCropHandle[] = ["left", "right", "top", "bottom", "top-left", "top-right", "bottom-right", "bottom-left"];

function imageFrameMatrix(objectId: string, getObjectMatrix: (id: string) => THREE.Matrix4 | null): { matrix: THREE.Matrix4; params: CadImageNodeParams; asset: CadRasterAsset } | null {
  const feature = Object.values(cadDocument.features).find(entry => entry.output === objectId && entry.type === "image");
  const object = cadDocument.objects[objectId];
  if (!feature || !object) return null;
  const params = feature.params as unknown as CadImageNodeParams;
  const asset = cadDocument.rasterAssets?.[params.assetId];
  if (!asset) return null;
  const matrix = getObjectMatrix(objectId);
  return matrix ? { matrix, params, asset } : null;
}

export function ImageCropHandles({ objectId, crop, getCanvas, getCamera, getObjectMatrix, project, onCropChange }: {
  objectId: string;
  crop: CadImageCrop;
  getCanvas: () => HTMLCanvasElement | null;
  getCamera: () => THREE.Camera | null;
  getObjectMatrix: (objectId: string) => THREE.Matrix4 | null;
  project: (point: Vec3) => [number, number];
  onCropChange: (crop: CadImageCrop) => void;
}) {
  const [display, setDisplay] = useState<{ outline: PositionedPoint[]; crop: PositionedPoint[]; handles: DisplayHandle[] }>();
  const drag = useRef<{ pointerId: number; name: ImageCropHandle; initialCrop: CadImageCrop; params: CadImageNodeParams; asset: CadRasterAsset } | undefined>(undefined);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let frame = 0, previous = "", lastDraw = 0;
    const draw = (time: number) => {
      if (time - lastDraw >= 32) {
        lastDraw = time;
        const image = imageFrameMatrix(objectId, getObjectMatrix);
        const canvas = getCanvas();
        if (image && canvas) {
          const boundary = imageCropBoundaryPoints(crop, image.params.width, image.params.height);
          const outlineLocal = [{ x: -image.params.width / 2, y: image.params.height / 2 }, { x: image.params.width / 2, y: image.params.height / 2 }, { x: image.params.width / 2, y: -image.params.height / 2 }, { x: -image.params.width / 2, y: -image.params.height / 2 }];
          const toScreen = (point: CropPoint): PositionedPoint => {
            const world = new THREE.Vector3(point.x, point.y, 0).applyMatrix4(image.matrix).toArray() as Vec3;
            const projected = project(world);
            return { x: projected[0], y: projected[1] };
          };
          const outline = outlineLocal.map(toScreen), cropPoints = boundary.corners.map(toScreen);
          const handles = handleNames.map(name => {
            const point = toScreen(boundary.handles[name]);
            const inset = name.includes("left") ? crop.x : name.includes("right") ? 1 - crop.x - crop.width : name.includes("top") ? crop.y : 1 - crop.y - crop.height;
            return { name, point, value: inset * 100 };
          });
          const next = { outline, crop: cropPoints, handles };
          const signature = JSON.stringify(next);
          if (signature !== previous) { previous = signature; setDisplay(next); }
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [objectId, crop.x, crop.y, crop.width, crop.height, getCanvas, getObjectMatrix, project]);

  function localPoint(clientX: number, clientY: number): CropPoint | null {
    const canvas = getCanvas(), camera = getCamera(), image = imageFrameMatrix(objectId, getObjectMatrix);
    if (!canvas || !camera || !image) return null;
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, camera);
    const inverse = image.matrix.clone().invert();
    const origin = new THREE.Vector3(0, 0, 0).applyMatrix4(image.matrix);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(image.matrix);
    const hit = raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin), new THREE.Vector3());
    if (!hit) return null;
    const local = hit.applyMatrix4(inverse);
    return { x: local.x, y: local.y };
  }

  function updateDrag(clientX: number, clientY: number) {
    const active = drag.current;
    if (!active) return;
    const point = localPoint(clientX, clientY);
    if (!point) return;
    onCropChange(cropFromImageCropHandle(active.initialCrop, active.name, point, active.params.width, active.params.height, active.asset.width, active.asset.height));
  }

  function onPointerDown(event: PointerEvent<SVGRectElement>, handle: DisplayHandle) {
    event.preventDefault(); event.stopPropagation();
    const image = imageFrameMatrix(objectId, getObjectMatrix); if (!image) return;
    drag.current = { pointerId: event.pointerId, name: handle.name, initialCrop: structuredClone(crop), params: image.params, asset: image.asset };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent<SVGRectElement>, handle: DisplayHandle) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const image = imageFrameMatrix(objectId, getObjectMatrix); if (!image) return;
    const amount = (event.shiftKey ? 0.1 : 1) / 100;
    const current = imageCropBoundaryPoints(crop, image.params.width, image.params.height).handles[handle.name];
    const next = { ...current, x: current.x + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0) * amount * image.params.width, y: current.y + (event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0) * amount * image.params.height };
    onCropChange(cropFromImageCropHandle(crop, handle.name, next, image.params.width, image.params.height, image.asset.width, image.asset.height));
  }

  if (!display) return <svg ref={svg} className="image-crop-overlay" data-cad-editor aria-label="Image crop handles" role="group" />;
  const line = (points: PositionedPoint[]) => points.map(point => `${point.x},${point.y}`).join(" ");
  return <svg ref={svg} className="image-crop-overlay" data-cad-editor aria-label="Image crop handles" role="group">
    <polygon data-crop-source-outline points={line(display.outline)} />
    <polygon data-crop-boundary points={line(display.crop)} />
    {display.handles.map(handle => <rect key={handle.name} data-crop-handle={handle.name} role="slider" aria-label={`Crop ${handle.name} boundary`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(handle.value.toFixed(2))} tabIndex={0}
      x={handle.point.x - 7} y={handle.point.y - 7} width="14" height="14" rx="2"
      onKeyDown={event => onKeyDown(event, handle)}
      onPointerDown={event => onPointerDown(event, handle)}
      onPointerMove={event => { if (drag.current?.pointerId === event.pointerId) { event.preventDefault(); event.stopPropagation(); updateDrag(event.clientX, event.clientY); } }}
      onPointerUp={event => { if (drag.current?.pointerId === event.pointerId) { event.preventDefault(); event.stopPropagation(); updateDrag(event.clientX, event.clientY); drag.current = undefined; } }}
      onPointerCancel={event => { if (drag.current?.pointerId === event.pointerId) drag.current = undefined; }}>
      <title>Drag to change the visible source area; the image frame size stays fixed. Arrow keys adjust the edge.</title>
    </rect>)}
    <text x={display.crop[0].x + 8} y={display.crop[0].y + 18}>SOURCE CROP · frame size stays fixed</text>
  </svg>;
}
