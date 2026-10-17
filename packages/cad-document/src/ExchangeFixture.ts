/** Offline geometry fixture contract. No executable payloads or external asset fetching. */
export type ExchangePoint = [number, number, number];
export type ExchangeIdentity = { adapter: string; documentId: string; objectId: string };
export type ExchangeLoss = { code: string; message: string; sourceId?: string };
export type ExchangeAsset = { id: string; mediaType: string; byteLength: number; sha256: string };
export type ExchangeCoordinates = { unit: "mm" | "cm" | "m" | "inch"; origin: ExchangePoint; axes: [ExchangePoint, ExchangePoint, ExchangePoint] };
export type ExchangeEntity = { sourceId: string; name?: string; provenance?: ExchangeIdentity; assetIds?: string[] } &
  ({ kind: "line" | "rectangle"; points: ExchangePoint[] } | { kind: "unsupported"; reason: string });
export type ExchangeFixture = {
  schema: "webcad.exchange.fixture"; version: 1; adapter: "webcad-fixture"; documentId: string;
  coordinates: ExchangeCoordinates; entities: ExchangeEntity[]; assets: ExchangeAsset[]; losses: ExchangeLoss[];
};
/** Historical receipt: deleted objects keep their mapping, but are never exported as live geometry. */
export type ExchangeImport = {
  id: string; adapter: "webcad-fixture"; version: 1; documentId: string; coordinates: ExchangeCoordinates;
  mappings: { sourceId: string; objectId: string; provenance: ExchangeIdentity }[];
  assets: ExchangeAsset[]; losses: ExchangeLoss[];
};
export const MAX_FIXTURE_BYTES = 2 * 1024 * 1024;
export const MAX_FIXTURE_ENTITIES = 1000;
export const identityCoordinates = (): ExchangeCoordinates => ({ unit: "mm", origin: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, any>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
export const validExchangeId = (v: unknown): v is string => typeof v === "string" && v.trim() === v && v.length > 0 && v.length <= 200 && !["__proto__", "prototype", "constructor"].includes(v) && !/[\u0000-\u001f]/.test(v);
const message = (v: unknown) => typeof v === "string" && v.trim().length > 0 && v.length <= 500;
const vector = (v: unknown): v is ExchangePoint => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e12);
const sub = (a: ExchangePoint, b: ExchangePoint) => a.map((n, i) => n - b[i]) as ExchangePoint;
const dot = (a: ExchangePoint, b: ExchangePoint) => a.reduce((s, n, i) => s + n * b[i], 0);
export function validFixtureRectangle(points: ExchangePoint[]): boolean {
  if (points.length !== 4 || !points.every(vector)) return false;
  const edges = points.map((p, i) => sub(points[(i + 1) % 4], p)), lengths = edges.map(e => Math.hypot(...e));
  return lengths.every(n => n > 1e-6) && edges.every((e, i) => Math.abs(dot(e, edges[(i + 1) % 4])) <= 1e-8 * lengths[i] * lengths[(i + 1) % 4]) &&
    [0, 1].every(i => Math.hypot(...edges[i].map((n, j) => n + edges[i + 2][j])) <= 1e-8 * Math.max(lengths[i], lengths[i + 2]));
}
function validCoordinates(v: unknown): v is ExchangeCoordinates {
  if (!record(v) || !keys(v, ["unit", "origin", "axes"]) || !["mm", "cm", "m", "inch"].includes(v.unit) || !vector(v.origin) || !Array.isArray(v.axes) || v.axes.length !== 3 || !v.axes.every(vector)) return false;
  const [a, b, c] = v.axes as ExchangePoint[];
  const cross: ExchangePoint = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  return [a, b, c].every(p => Math.abs(dot(p, p) - 1) < 1e-9) && Math.abs(dot(a,b)) < 1e-9 && dot(cross,c) > 1 - 1e-9;
}
function validIdentity(v: unknown): v is ExchangeIdentity { return record(v) && keys(v,["adapter","documentId","objectId"]) && [v.adapter,v.documentId,v.objectId].every(validExchangeId); }
function validAssets(v: unknown): v is ExchangeAsset[] {
  return Array.isArray(v) && v.length <= 256 && new Set(v.map(a=>a?.id)).size === v.length && v.every(a => record(a) && keys(a,["id","mediaType","byteLength","sha256"]) && validExchangeId(a.id) && typeof a.mediaType === "string" && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(a.mediaType) && a.mediaType.length <= 100 && Number.isSafeInteger(a.byteLength) && a.byteLength >= 0 && a.byteLength <= 1e9 && typeof a.sha256 === "string" && /^[a-f0-9]{64}$/.test(a.sha256));
}
function validLosses(v: unknown): v is ExchangeLoss[] { return Array.isArray(v) && v.length <= 4096 && v.every(l=>record(l) && keys(l,["code","message","sourceId"]) && validExchangeId(l.code) && message(l.message) && (l.sourceId === undefined || validExchangeId(l.sourceId))); }
export function validateExchangeFixture(v: unknown): asserts v is ExchangeFixture {
  if (!record(v) || !keys(v,["schema","version","adapter","documentId","coordinates","entities","assets","losses"]) || v.schema !== "webcad.exchange.fixture" || v.version !== 1 || v.adapter !== "webcad-fixture" || !validExchangeId(v.documentId) || !validCoordinates(v.coordinates) || !validAssets(v.assets) || !validLosses(v.losses) || !Array.isArray(v.entities) || v.entities.length > MAX_FIXTURE_ENTITIES) throw new Error("Invalid or unsupported exchange fixture envelope/manifest.");
  const ids = new Set<string>(), assets = new Set(v.assets.map((a: ExchangeAsset)=>a.id));
  for (const e of v.entities) {
    if (!record(e) || !keys(e,["sourceId","name","provenance","assetIds","kind",e.kind === "unsupported" ? "reason" : "points"]) || !validExchangeId(e.sourceId) || ids.has(e.sourceId) || (e.name !== undefined && (!message(e.name) || e.name.length > 200)) || (e.provenance !== undefined && !validIdentity(e.provenance)) || (e.assetIds !== undefined && (!Array.isArray(e.assetIds) || e.assetIds.length > 256 || new Set(e.assetIds).size !== e.assetIds.length || !e.assetIds.every((id:unknown)=>validExchangeId(id) && assets.has(id))))) throw new Error("Invalid exchange entity identity or asset reference.");
    ids.add(e.sourceId);
    if (e.kind === "unsupported") { if (!message(e.reason)) throw new Error("Invalid unsupported entity description."); }
    else if (!["line","rectangle"].includes(e.kind) || !Array.isArray(e.points) || !e.points.every(vector) || (e.kind === "line" ? e.points.length !== 2 || Math.hypot(...sub(e.points[1],e.points[0])) <= 1e-6 : !validFixtureRectangle(e.points))) throw new Error("Invalid exchange line/rectangle geometry.");
  }
  if (v.losses.some((l:ExchangeLoss)=>l.sourceId !== undefined && !ids.has(l.sourceId))) throw new Error("Invalid exchange loss reference.");
}
export function validExchangeImport(v: unknown): v is ExchangeImport {
  if (!record(v) || !keys(v,["id","adapter","version","documentId","coordinates","mappings","assets","losses"]) || !validExchangeId(v.id) || v.adapter !== "webcad-fixture" || v.version !== 1 || !validExchangeId(v.documentId) || !validCoordinates(v.coordinates) || !validAssets(v.assets) || !validLosses(v.losses) || !Array.isArray(v.mappings) || !v.mappings.length || v.mappings.length > MAX_FIXTURE_ENTITIES) return false;
  return new Set(v.mappings.map(m=>m?.sourceId)).size === v.mappings.length && new Set(v.mappings.map(m=>m?.objectId)).size === v.mappings.length && v.mappings.every(m=>record(m) && keys(m,["sourceId","objectId","provenance"]) && validExchangeId(m.sourceId) && validExchangeId(m.objectId) && validIdentity(m.provenance));
}
export function validateExchangeImports(v: unknown) {
  if (v === undefined) return;
  if (!record(v) || Object.keys(v).length > 256 || Object.entries(v).some(([id,r])=>!validExchangeId(id) || !validExchangeImport(r) || r.id !== id)) throw new Error("Invalid exchange import receipts.");
  const objects = Object.values(v).flatMap(r=>r.mappings.map((m:{objectId:string})=>m.objectId));
  if (new Set(objects).size !== objects.length) throw new Error("Duplicate exchange object mapping.");
}
