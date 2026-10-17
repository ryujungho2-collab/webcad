type Vector3 = [number, number, number];
/** Camera values in document/world coordinates (mm), independent of geometry and work planes. */
export type CadModelViewCamera = {
  eye: Vector3; target: Vector3; up: Vector3; near: number; far: number; zoom: number;
} & ({ projection: "perspective"; fov: number; aspect: number } |
  { projection: "orthographic"; left: number; right: number; top: number; bottom: number });
export type CadModelView = { id: string; name: string; camera: CadModelViewCamera };
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const vector = (v: unknown): v is Vector3 => Array.isArray(v) && v.length === 3 && v.every(finite);
export const validModelViewId = (v: unknown): v is string => typeof v === "string" && v.trim() === v && v.length > 0 && v.length <= 200 && !["__proto__", "constructor", "prototype"].includes(v);
export function validModelViewCamera(v: unknown): v is CadModelViewCamera {
  if (!record(v) || !vector(v.eye) || !vector(v.target) || !vector(v.up) ||
    !finite(v.near) || !finite(v.far) || v.near <= 0 || v.far <= v.near || !Number.isFinite(v.far + v.near) ||
    !finite(v.zoom) || v.zoom <= 0) return false;
  const direction = v.target.map((x, i) => x - (v.eye as Vector3)[i]);
  const length = Math.hypot(...direction), upLength = Math.hypot(...v.up);
  if (!Number.isFinite(length) || length <= 1e-9 || Math.abs(upLength - 1) > 1e-6) return false;
  const dot = direction.reduce((sum, x, i) => sum + x / length * (v.up as Vector3)[i], 0);
  if (Math.abs(dot) > 1 - 1e-8) return false;
  const fields = ["projection", "eye", "target", "up", "near", "far", "zoom"];
  if (v.projection === "perspective") {
    fields.push("fov", "aspect");
    if (!finite(v.fov) || v.fov <= 0 || v.fov >= 180 || !finite(v.aspect) || v.aspect <= 0) return false;
    const halfHeight = v.near * Math.tan(v.fov * Math.PI / 360) / v.zoom;
    if (!Number.isFinite(halfHeight) || halfHeight <= 0 || !Number.isFinite(halfHeight * v.aspect) || halfHeight * v.aspect <= 0) return false;
  } else if (v.projection === "orthographic") {
    fields.push("left", "right", "top", "bottom");
    if (![v.left, v.right, v.top, v.bottom].every(finite) || Number(v.right) <= Number(v.left) || Number(v.top) <= Number(v.bottom) ||
      !Number.isFinite(Number(v.right) - Number(v.left)) || !Number.isFinite(Number(v.top) - Number(v.bottom))) return false;
    const zoom = v.zoom;
    if (![Number(v.right) - Number(v.left), Number(v.top) - Number(v.bottom)].every(span => Number.isFinite(span / zoom) && span / zoom > 0)) return false;
  } else return false;
  return Object.keys(v).every(key => fields.includes(key));
}
export function validModelView(v: unknown): v is CadModelView {
  return record(v) && Object.keys(v).every(key => ["id", "name", "camera"].includes(key)) && validModelViewId(v.id) &&
    typeof v.name === "string" && v.name.trim() === v.name && v.name.length > 0 && v.name.length <= 200 && validModelViewCamera(v.camera);
}
export function validateModelViews(views: unknown): void {
  if (views === undefined) return;
  if (!record(views) || Object.keys(views).length > 256) throw new Error("Invalid CAD document: model view collection.");
  const names = new Set<string>();
  for (const [id, view] of Object.entries(views)) {
    if (!validModelView(view) || view.id !== id || names.has(view.name.toLowerCase())) throw new Error(`Invalid CAD document: model view ${id}.`);
    names.add(view.name.toLowerCase());
  }
}
