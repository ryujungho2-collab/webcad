import * as THREE from "three";
import { resolveDimension } from "../precision/dimensionGeometry";
import type { LayerStyle } from "@agent-webcad/cad-document";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { applyCenterPattern } from "./lineStyle";

export const DIMENSION_COLOR = 0x36d9c5;
function makeTextSprite(text: string, height: number, color = "#d9f7f2"): THREE.Sprite {
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
  context.fillStyle = color;
  context.fillText(text, 14, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  material.userData.baseColor=material.color.clone();
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((height * width) / 64, height, 1);
  sprite.renderOrder = 21;
  return sprite;
}

/**
 * Transient three group for one dimension feature: linework plus a
 * world-sized label. The group carries the feature output id for picking and
 * receives the standard object transform from the viewport sync.
 */
export function createDimensionRenderObject(objectId: string, params: Record<string, unknown>, style?: LayerStyle): THREE.Group | null {
  const resolved = resolveDimension(params);
  if (!resolved) return null;
  const group = new THREE.Group();
  const positions = new Float32Array(resolved.segments.length * 6);
  resolved.segments.forEach(([a, b], index) => {
    positions.set([a[0], a[1], a[2], b[0], b[1], b[2]], index * 6);
  });
  const geometry = new LineSegmentsGeometry().setPositions(positions);
  geometry.computeBoundingBox();
  const material=new LineMaterial({ color: style?.color??DIMENSION_COLOR, linewidth:Math.max(1,(style?.lineWeight??.25)*96/25.4), depthTest:false, transparent:true, opacity:0.95, dashed:style?.lineType!==undefined&&style.lineType!=="continuous",dashSize:style?.lineType==="center"?6:3,gapSize:1.5 });
  material.userData.baseColor=material.color.clone();applyCenterPattern(material,style?.lineType);
  const lines = new LineSegments2(geometry,material);lines.computeLineDistances();
  lines.onBeforeRender=renderer=>material.resolution.copy(renderer.getSize(new THREE.Vector2()));
  lines.renderOrder = 20;
  lines.userData.cadObjectId = objectId;
  group.add(lines);
  const label = makeTextSprite(resolved.text,resolved.textHeight,style?.color);
  label.position.fromArray(resolved.textPosition);
  label.userData.cadObjectId = objectId;
  group.add(label);
  group.userData.cadObjectId = objectId;
  return group;
}
