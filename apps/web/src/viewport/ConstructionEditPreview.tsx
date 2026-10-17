import { requestProjectFrame as requestAnimationFrame, cancelProjectFrame as cancelAnimationFrame } from "../app/projectActivity";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { constructionExpression } from "@agent-webcad/cad-document";
import { cadDocument } from "../state/cadDocument";
import { getCadPlanDrawingPaths, type CadPlanPreview } from "../state/documentPlans";
import type { Vec3 } from "../precision/workPlane";
import { clipLinearToCamera } from "./drawingRenderer";

/** The same evaluated proposal as Apply, including the full construction cascade. */
export function ConstructionEditPreview({ plan, project, getCamera, constructionVisible }: { plan?: CadPlanPreview; project: (p: Vec3) => [number, number]; getCamera: () => THREE.Camera | null; constructionVisible: boolean }) {
  const paths = useMemo(() => !plan?.result.ok ? [] : plan.changes.flatMap(change => {
    const feature = Object.values(cadDocument.features).find(f => f.output === change.objectId);
    if (!feature?.construction || !constructionVisible && feature.params.construction) return [];
    const data = getCadPlanDrawingPaths(plan.planId, change.objectId); if (!data) return [];
    return (["before", "after"] as const).flatMap(side => data[side] ? [{ id: change.objectId, name: change.name, kind: String(feature.params.kind), side, points: data[side]! }] : []);
  }), [plan, constructionVisible]);
  const [screen, setScreen] = useState<(typeof paths[number] & { pixels: [number, number][] })[]>([]);
  useEffect(() => {
    let frame: number, signature = "";
    const draw = () => {
      const camera = getCamera(), next = paths.map(path => {
        const points = camera && ["infinite-line", "ray"].includes(path.kind) ? clipLinearToCamera(path.points.map(p => new THREE.Vector3(...p)), new THREE.Matrix4(), camera, path.kind === "ray").map(p => p.toArray() as Vec3) : path.points;
        return { ...path, pixels: points.map(project) };
      });
      const hash = JSON.stringify(next.map(path => path.pixels)); if (hash !== signature) { signature = hash; setScreen(next); }
      frame = requestAnimationFrame(draw);
    }; draw(); return () => cancelAnimationFrame(frame);
  }, [paths, project, getCamera]);
  return <svg className="direct-edit-ghosts" aria-label="Dependent construction edit preview">{screen.map(path => <g key={`${path.id}:${path.side}`} data-construction-edit-object={path.id} data-construction-edit-side={path.side}>
    {path.pixels.length === 1 ? <><circle cx={path.pixels[0][0]} cy={path.pixels[0][1]} r="5" style={{ fill: path.side === "after" ? "#61dcac" : "#ffaa75", stroke: "none", opacity: path.side === "after" ? 1 : .4 }} /><text x={path.pixels[0][0] + (path.side === "after" ? 8 : -8)} y={path.pixels[0][1] - 9} textAnchor={path.side === "before" ? "end" : "start"} fill={path.side === "after" ? "#8aefc4" : "#ffaa75"} fontSize="11">{path.name}{path.side === "before" ? " · before" : ""}</text></> : <polyline className={`direct-ghost-${path.side}`} points={path.pixels.map(p => p.join(",")).join(" ")} />}
  </g>)}</svg>;
}

export function ConstructionEditImpact({ plan }: { plan?: CadPlanPreview }) {
  if (!plan?.result.ok) return null;
  const changed = plan.changes.flatMap(change => {
    const feature = Object.values(cadDocument.features).find(f => f.output === change.objectId);
    return feature?.construction ? [{ change, definition: feature.construction }] : [];
  });
  if (!changed.length) return null;
  return <details open className="dimension-relations construction-impact"><summary>Construction cascade · {changed.length} objects follow</summary>{changed.map(({ change, definition }) => <p key={change.objectId} data-construction-impact={change.objectId}><strong>{change.name}</strong> · {constructionExpression(definition, id => cadDocument.objects[id]?.name ?? id)} · retained</p>)}</details>;
}
