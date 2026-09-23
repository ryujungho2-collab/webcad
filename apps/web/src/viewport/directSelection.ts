import type { CadDocument } from "@agent-webcad/cad-document";
import * as THREE from "three";
import type { DrawingTopology } from "../precision/drawingTopology";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { planeToWorld, WORK_PLANES, worldToPlane, type Vec3, type WorkPlaneId } from "../precision/workPlane";
import { profileSegments, sampleProfileSegment } from "../precision/profileGeometry";

export type DirectSelectionCandidate = {
  objectId: string;
  kind: "control" | "segment" | "curve";
  topologyId: string;
  controlId?: string;
  startControlId?: string;
  endControlId?: string;
  modelPoint?: Vec3;
  worldPoint: THREE.Vector3;
  segment?: [THREE.Vector3, THREE.Vector3];
  samples?: THREE.Vector3[];
};

export function drawingControlModelPoint(
  params: Record<string, unknown>,
  role: string,
  index?: number,
): Vec3 | null {
  if (role === "vertex" && typeof index === "number" && Array.isArray(params.points)) {
    return (params.points as Vec3[])[index] ?? null;
  }
  if (!Array.isArray(params.center)) return null;
  const center = params.center as Vec3;
  if (role === "center") return center;
  const planeId = (params.workPlane === "XZ" || params.workPlane === "YZ" ? params.workPlane : "XY") as WorkPlaneId;
  const plane = WORK_PLANES[planeId];
  const center2 = worldToPlane(center, plane);
  const radius = Number(params.radius);
  if (!(radius > 0)) return null;
  const angle = role === "start" ? Number(params.startAngle) : role === "end" ? Number(params.endAngle) : 0;
  return planeToWorld([
    center2[0] + Math.cos(angle) * radius,
    center2[1] + Math.sin(angle) * radius,
  ], plane);
}

function worldControlPoint(
  params: Record<string, unknown>,
  mesh: THREE.Object3D,
  control: { role: string; index?: number },
) {
  const modelPoint = drawingControlModelPoint(params, control.role, control.index);
  if (!modelPoint) return null;
  const origin = Array.isArray(mesh.userData.drawingOrigin)
    ? new THREE.Vector3(...mesh.userData.drawingOrigin as Vec3)
    : new THREE.Vector3();
  const worldPoint = new THREE.Vector3(...modelPoint).sub(origin).applyMatrix4(mesh.matrixWorld);
  return { modelPoint, worldPoint };
}

export function buildDirectSelectionCandidates(
  document: CadDocument,
  renderObjects: ReadonlyMap<string, THREE.Object3D>,
): DirectSelectionCandidate[] {
  const candidates: DirectSelectionCandidate[] = [];
  for (const feature of Object.values(document.features)) {
    if (feature.type !== "drawing") continue;
    const object = document.objects[feature.output];
    const layer = object ? document.layers[object.layerId] : undefined;
    const mesh = renderObjects.get(feature.output);
    const topology = feature.params.topology as DrawingTopology | undefined;
    if (!object?.visible || layer?.visible === false || layer?.locked || !mesh?.visible || !topology?.controls) continue;

    const worldByControl = new Map<string, THREE.Vector3>();
    for (const control of topology.controls) {
      const resolved = worldControlPoint(feature.params, mesh, control);
      if (!resolved) continue;
      worldByControl.set(control.id, resolved.worldPoint);
      candidates.push({
        objectId: object.id,
        kind: "control",
        topologyId: control.id,
        controlId: control.id,
        modelPoint: resolved.modelPoint,
        worldPoint: resolved.worldPoint,
      });
    }
    for (const segment of topology.segments ?? []) {
      const start = worldByControl.get(segment.startControlId);
      const end = worldByControl.get(segment.endControlId);
      if (!start || !end) continue;
      const profileSegment = typeof segment.index === "number"
        ? profileSegments(String(feature.params.kind), feature.params)[segment.index]
        : undefined;
      if (segment.kind === "arc" && profileSegment?.kind === "arc") {
        const origin = Array.isArray(mesh.userData.drawingOrigin)
          ? new THREE.Vector3(...mesh.userData.drawingOrigin as Vec3)
          : new THREE.Vector3();
        const samples = sampleProfileSegment(profileSegment, feature.params)
          .map((point) => new THREE.Vector3(...point).sub(origin).applyMatrix4(mesh.matrixWorld));
        candidates.push({
          objectId: object.id,
          kind: "curve",
          topologyId: segment.id,
          startControlId: segment.startControlId,
          endControlId: segment.endControlId,
          worldPoint: samples[Math.floor(samples.length / 2)].clone(),
          samples,
        });
        continue;
      }
      candidates.push({
        objectId: object.id,
        kind: "segment",
        topologyId: segment.id,
        startControlId: segment.startControlId,
        endControlId: segment.endControlId,
        worldPoint: start.clone().add(end).multiplyScalar(0.5),
        segment: [start, end],
      });
    }
    const world = getWorldDrawingGeometry(object, feature);
    if (world?.points?.length) {
      for (const curve of topology.curves?.filter((entry) => !topology.segments.some((segment) => segment.id === entry.id)) ?? []) {
        const samples = world.points.map((point) => new THREE.Vector3(...point));
        candidates.push({
          objectId: object.id,
          kind: "curve",
          topologyId: curve.id,
          worldPoint: samples[Math.floor(samples.length / 2)].clone(),
          samples,
        });
      }
    }
  }
  return candidates;
}

export function nearestDirectSelectionCandidate(
  candidates: readonly DirectSelectionCandidate[],
  cursor: THREE.Vector2,
  project: (point: THREE.Vector3) => THREE.Vector2,
  exclude?: Pick<DirectSelectionCandidate, "objectId" | "topologyId">,
): DirectSelectionCandidate | null {
  let nearest: DirectSelectionCandidate | null = null;
  let distance = 12;
  let priority = 99;
  let nearestControl: DirectSelectionCandidate | null = null;
  let controlDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.objectId === exclude?.objectId && candidate.topologyId === exclude.topologyId) continue;
    let candidateDistance = project(candidate.worldPoint).distanceTo(cursor);
    let hitPoint = candidate.worldPoint;
    if (candidate.segment) {
      const a = project(candidate.segment[0]);
      const b = project(candidate.segment[1]);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared > 1e-9
        ? Math.max(0, Math.min(1, ((cursor.x - a.x) * dx + (cursor.y - a.y) * dy) / lengthSquared))
        : 0;
      const projected = new THREE.Vector2(a.x + dx * t, a.y + dy * t);
      candidateDistance = projected.distanceTo(cursor);
      hitPoint = candidate.segment[0].clone().lerp(candidate.segment[1], t);
    } else if (candidate.samples && candidate.samples.length > 1) {
      for (const sample of candidate.samples) {
        const sampleDistance = project(sample).distanceTo(cursor);
        if (sampleDistance < candidateDistance) {
          candidateDistance = sampleDistance;
          hitPoint = sample;
        }
      }
    }
    if (candidate.kind === "control" && candidateDistance < controlDistance) {
      controlDistance = candidateDistance;
      nearestControl = { ...candidate, worldPoint: hitPoint.clone() };
    }
    const candidatePriority = candidate.kind === "control" ? 0 : candidate.kind === "segment" ? 1 : 2;
    if (
      candidateDistance < distance - 0.25 ||
      (Math.abs(candidateDistance - distance) <= 0.25 && candidatePriority < priority)
    ) {
      distance = candidateDistance;
      priority = candidatePriority;
      nearest = { ...candidate, worldPoint: hitPoint.clone() };
    }
  }
  return nearestControl && controlDistance <= 24 ? nearestControl : nearest;
}
