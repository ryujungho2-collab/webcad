import * as THREE from "three";
import { resolveDimension } from "../precision/dimensionGeometry";

export const DIMENSION_COLOR = 0x36d9c5;
const TEXT_WORLD_HEIGHT = 4;

function makeTextSprite(text: string): THREE.Sprite {
  const font = "600 44px system-ui, sans-serif";
  const measurer = document.createElement("canvas").getContext("2d")!;
  measurer.font = font;
  const width = Math.max(8, Math.ceil(measurer.measureText(text).width) + 28);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.font = font;
  context.textBaseline = "middle";
  context.shadowColor = "rgba(0,0,0,0.9)";
  context.shadowBlur = 6;
  context.fillStyle = "#d9f7f2";
  context.fillText(text, 14, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((TEXT_WORLD_HEIGHT * width) / 64, TEXT_WORLD_HEIGHT, 1);
  sprite.renderOrder = 21;
  return sprite;
}

/**
 * Transient three group for one dimension feature: linework plus a
 * world-sized label. The group carries the feature output id for picking and
 * receives the standard object transform from the viewport sync.
 */
export function createDimensionRenderObject(objectId: string, params: Record<string, unknown>): THREE.Group | null {
  const resolved = resolveDimension(params);
  if (!resolved) return null;
  const group = new THREE.Group();
  const positions = new Float32Array(resolved.segments.length * 6);
  resolved.segments.forEach(([a, b], index) => {
    positions.set([a[0], a[1], a[2], b[0], b[1], b[2]], index * 6);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingBox();
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: DIMENSION_COLOR, depthTest: false, transparent: true, opacity: 0.95 }),
  );
  lines.renderOrder = 20;
  lines.userData.cadObjectId = objectId;
  group.add(lines);
  const label = makeTextSprite(resolved.text);
  label.position.fromArray(resolved.textPosition);
  label.userData.cadObjectId = objectId;
  group.add(label);
  group.userData.cadObjectId = objectId;
  return group;
}
