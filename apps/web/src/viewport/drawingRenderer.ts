import * as THREE from "three";
import { planeToWorld, WORK_PLANES, worldToPlane, type Vec3, type WorkPlaneId } from "../precision/workPlane";
import { sampleProfile } from "../precision/profileGeometry";
import { drawingModelOrigin } from "../precision/worldGeometry";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { CadVectorStyle, LayerStyle } from "@agent-webcad/cad-document";
import { applyCenterPattern } from "./lineStyle";

export type DrawingRenderObject =
  | Line2
  | THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  | THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  | THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;

export function drawingRenderPoints(params: Record<string, unknown>, planeId: WorkPlaneId): Vec3[] {
  const kind = String(params.kind ?? "");
  if (["point", "infinite-line", "ray"].includes(kind) && Array.isArray(params.points)) return params.points as Vec3[];
  if ((kind === "line" || kind === "polyline" || kind === "rectangle") && Array.isArray(params.points)) {
    return sampleProfile(kind, params);
  }
  if ((kind === "circle" || kind === "arc") && Array.isArray(params.center)) {
    const center = params.center as Vec3;
    const radius = Number(params.radius);
    const start = kind === "arc" ? Number(params.startAngle) : 0;
    const end = kind === "arc" ? Number(params.endAngle) : Math.PI * 2;
    const center2d = worldToPlane(center, WORK_PLANES[planeId]);
    const count = kind === "circle" ? 64 : Math.max(12, Math.ceil(Math.abs(end - start) / (Math.PI / 32)));
    return Array.from({ length: count + 1 }, (_, index) => {
      const angle = start + (end - start) * index / count;
      const point = planeToWorld([
        center2d[0] + Math.cos(angle) * radius,
        center2d[1] + Math.sin(angle) * radius,
      ], WORK_PLANES[planeId]);
      const h = center.reduce((sum, v, i) => sum + v * WORK_PLANES[planeId].normal[i], 0);
      return point.map((v, i) => v + h * WORK_PLANES[planeId].normal[i]) as Vec3;
    });
  }
  return [];
}

export function drawingRenderOrigin(params: Record<string, unknown>, planeId: WorkPlaneId): Vec3 {
  return drawingModelOrigin({ ...params, workPlane: planeId });
}

export function createDrawingRenderObject(
  objectId: string,
  params: Record<string, unknown>,
  color = 0x4f8cff,
  style?: LayerStyle,
): DrawingRenderObject {
  const planeId = (params.workPlane === "XZ" || params.workPlane === "YZ" ? params.workPlane : "XY") as WorkPlaneId;
  const points = drawingRenderPoints(params, planeId);
  const origin = drawingRenderOrigin(params, planeId);
  const vectorStyle = params.vectorStyle && typeof params.vectorStyle === "object" ? params.vectorStyle as Partial<CadVectorStyle> : undefined;
  const pivot = new THREE.Vector3(...origin);
  const local=points.map(point=>new THREE.Vector3(...point).sub(pivot));
  if (params.kind === "point") {
    const material = new THREE.PointsMaterial({ color: params.construction ? 0x8aa7b0 : vectorStyle?.stroke ?? style?.color ?? color, size: 8, sizeAttenuation: false, depthTest: false, transparent: (vectorStyle?.opacity ?? 1) < 1, opacity: vectorStyle?.opacity ?? 1 });
    material.userData.baseColor = material.color.clone();
    const object = new THREE.Points(new THREE.BufferGeometry().setFromPoints(local), material);
    object.userData.cadObjectId = objectId; object.userData.drawingOrigin = origin;
    return object;
  }
  const closed=params.kind === "rectangle" || params.kind === "circle" || params.closed === true;
  if(closed && local.length)local.push(local[0]);
  const geometry=new LineGeometry().setPositions(local.flatMap(point=>point.toArray()));
  const dashed=Boolean(params.construction || style?.lineType!==undefined && style.lineType!=="continuous");
  const material=new LineMaterial({color:params.construction?0x8aa7b0:vectorStyle?.stroke??style?.color??color,linewidth:Math.max(1,(vectorStyle?.strokeWidth??style?.lineWeight??0.25)*96/25.4),dashed,dashSize:style?.lineType==="center"?6:3,gapSize:1.5});
  material.transparent = (vectorStyle?.opacity ?? 1) < 1;
  material.opacity = vectorStyle?.opacity ?? 1;
  const renderObject=new Line2(geometry,material);
  applyCenterPattern(material,style?.lineType);
  (renderObject as THREE.Object3D).onBeforeRender=(renderer,_scene,camera)=>{
    material.resolution.copy(renderer.getSize(new THREE.Vector2()));
    if (["infinite-line", "ray"].includes(String(params.kind))) {
      const clipped = clipLinearToCamera(local, renderObject.matrixWorld, camera, params.kind === "ray");
      // Reuse the GPU attributes. Replacing them during onBeforeRender happens
      // after the renderer's geometry upload and can leave an invisible line.
      const data = (geometry.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute).data;
      const values = clipped.flatMap(p => p.toArray());
      if (values.some((v, i) => Math.fround(v) !== data.array[i])) {
        data.array.set(values); data.needsUpdate = true;
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        if (dashed) {
          const distances = (geometry.getAttribute("instanceDistanceStart") as THREE.InterleavedBufferAttribute).data;
          distances.array.set([0, clipped[0].distanceTo(clipped[1])]); distances.needsUpdate = true;
        }
      }
    }
  };
  if (["infinite-line", "ray"].includes(String(params.kind))) renderObject.frustumCulled = false;
  material.userData.baseColor=material.color.clone();
  renderObject.userData.cadObjectId = objectId;
  renderObject.userData.drawingOrigin = origin;
  if (dashed) renderObject.computeLineDistances();
  return renderObject;
}

/** Add a real triangulated fill under a closed CAD path, with the same object identity. */
export function createDrawingSceneObject(objectId: string, params: Record<string, unknown>, color = 0x4f8cff, style?: LayerStyle): DrawingRenderObject | THREE.Group {
  const vectorStyle = params.vectorStyle && typeof params.vectorStyle === "object" ? params.vectorStyle as Partial<CadVectorStyle> : undefined;
  const line = createDrawingRenderObject(objectId, params, color, style);
  const closed = params.kind === "rectangle" || params.kind === "circle" || params.closed === true;
  if (!closed || typeof vectorStyle?.fill !== "string" || !/^#[0-9a-f]{6}$/i.test(vectorStyle.fill)) return line;
  const planeId = (params.workPlane === "XZ" || params.workPlane === "YZ" ? params.workPlane : "XY") as WorkPlaneId;
  const world = drawingRenderPoints(params, planeId);
  const origin = drawingRenderOrigin(params, planeId);
  if (world.length < 3) return line;
  const points = world.map(point => worldToPlane(point, WORK_PLANES[planeId]));
  if (close(points[0], points[points.length - 1])) points.pop();
  if (points.length < 3) return line;
  const contour = points.map(point => new THREE.Vector2(point[0], point[1]));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  if (!triangles.length) return line;
  const normal = WORK_PLANES[planeId].normal;
  const planeOffset = world[0].reduce((sum, value, index) => sum + value * normal[index], 0);
  const positions = points.flatMap(([x, y]) => planeToWorld([x, y], WORK_PLANES[planeId]).map((value, index) => value + normal[index] * planeOffset - origin[index]));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(triangles.flat());
  geometry.computeVertexNormals();
  const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: vectorStyle.fill, transparent: (vectorStyle.opacity ?? 1) < 1, opacity: vectorStyle.opacity ?? 1, side: THREE.DoubleSide, depthWrite: false }));
  fill.name = `Vector fill · ${objectId}`;
  fill.userData.cadObjectId = objectId;
  fill.renderOrder = -1;
  const group = new THREE.Group();
  group.name = `Vector path · ${objectId}`;
  group.userData = { ...line.userData };
  group.add(fill, line);
  return group;
}

function close(a: [number, number], b: [number, number]) { return Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-8; }

/** Only the display is clipped. The document continues to own origin/direction. */
export function clipLinearToCamera(local: THREE.Vector3[], matrix: THREE.Matrix4, camera: THREE.Camera, ray: boolean) {
  const origin = local[0].clone().applyMatrix4(matrix), direction = local[1].clone().applyMatrix4(matrix).sub(origin);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let minimum = ray ? 0 : -Infinity, maximum = Infinity;
  for (const plane of frustum.planes) {
    const value = plane.distanceToPoint(origin), slope = plane.normal.dot(direction);
    if (Math.abs(slope) < 1e-12) { if (value < 0) return [local[0], local[0]]; continue; }
    const bound = -value / slope;
    if (slope > 0) minimum = Math.max(minimum, bound); else maximum = Math.min(maximum, bound);
  }
  if (!(minimum <= maximum) || !Number.isFinite(minimum) || !Number.isFinite(maximum)) return [local[0], local[0]];
  const inverse = matrix.clone().invert();
  return [minimum, maximum].map(t => origin.clone().addScaledVector(direction, t).applyMatrix4(inverse));
}
