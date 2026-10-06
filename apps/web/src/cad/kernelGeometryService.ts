import { KernelWorkerClient } from "./kernelWorkerClient";
import { isKernelCancelled } from "./kernelProtocol";
import type { BrepTopology, KernelOperation, KernelTaskProgress, KernelTaskResults, MeshData, PrimitiveParams, SerializedOperand } from "./kernelProtocol";
export type { MeshData, BrepTopology, BrepTopologyFace, BrepTopologyEdge, KernelTaskProgress } from "./kernelProtocol";
export { isKernelCancelled, KERNEL_CANCELLED_MESSAGE } from "./kernelProtocol";
export type KernelStatus = "deferred" | "loading" | "ready" | "working" | "error";
type StatusListener = (status: KernelStatus) => void;
const statusListeners = new Set<StatusListener>();
const progressListeners = new Set<(progress: KernelTaskProgress | null) => void>();
const meshCache = new Map<string, Promise<MeshData>>();
const topologyCache = new Map<string, Promise<BrepTopology>>();
const measurementCache = new Map<string, Promise<KernelTaskResults["inspect"]>>();
const CACHE_LIMIT = 64;
let kernelStatus: KernelStatus = "deferred";
let progress: KernelTaskProgress | null = null;
let activeTasks = 0;
let nodeQueue: Promise<unknown> = Promise.resolve();

function setKernelStatus(status: KernelStatus) {
  if (kernelStatus === status) return;
  kernelStatus = status;
  for (const listener of statusListeners) listener(status);
}
const client = new KernelWorkerClient(
  () => new Worker(new URL("./kernel.worker.ts", import.meta.url), { type: "module", name: "cad-kernel" }),
  (next) => {
    progress = next;
    if (next) setKernelStatus(next.phase === "loading" || next.phase === "queued" ? "loading" : "working");
    for (const listener of progressListeners) listener(next);
  },
);

export function subscribeKernelStatus(listener: StatusListener) {
  statusListeners.add(listener);
  listener(kernelStatus);
  return () => { statusListeners.delete(listener); };
}
export function subscribeKernelProgress(listener: (progress: KernelTaskProgress | null) => void) {
  progressListeners.add(listener);
  listener(progress);
  return () => { progressListeners.delete(listener); };
}

async function runKernelTask<K extends KernelOperation>(operation: K, params: PrimitiveParams, fatal = true): Promise<KernelTaskResults[K]> {
  activeTasks++;
  const startedAt = performance.now();
  setKernelStatus(kernelStatus === "deferred" ? "loading" : "working");
  try {
    if (typeof window === "undefined") {
      // Node-only adapter for numerical regression tests. Browsers must use
      // the worker; loading failures never silently block the UI thread.
      const detached = structuredClone(params);
      const task = nodeQueue.then(async () => {
        const { executeKernelOperation } = await import("./kernelRuntime");
        return executeKernelOperation(operation, detached);
      });
      nodeQueue = task.catch(() => {});
      return await task;
    }
    return await client.request(operation, params);
  } catch (error) {
    // Cancellation is user intent, not a kernel failure: keep status honest
    // so the next request retries instead of surfacing a phantom error.
    if (fatal && !isKernelCancelled(error)) setKernelStatus("error");
    throw error;
  } finally {
    activeTasks--;
    if (!activeTasks && kernelStatus !== "error") setKernelStatus("ready");
    performance.measure(`agent-webcad:kernel-task:${operation}`, { start: startedAt, end: performance.now() });
  }
}

function cached<T>(cache: Map<string, Promise<T>>, key: string, factory: () => Promise<T>, kind="mesh"): Promise<T> {
  const existing = cache.get(key);
  if (existing) {
    performance.mark(`agent-webcad:${kind}-cache-hit`, { detail: { key } });
    return existing;
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  const pending = factory().catch((error) => {
    if (cache.get(key) === pending) cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}
function solidMesh(key: string, params: PrimitiveParams, preflight: boolean) {
  return cached(meshCache, key, () => runKernelTask("solid", params, !preflight));
}
export function buildBoxMesh(width: number, depth: number, height: number) {
  return buildPrimitiveMesh({ kind: "box", width, depth, height });
}
export function buildPrimitiveMesh(params: PrimitiveParams) {
  return cached(meshCache, `primitive:${JSON.stringify(params)}`, () => runKernelTask("primitive", params));
}
export function buildBooleanMesh(params: PrimitiveParams, preflight = false) {
  const geometry = { operation: params.operation, operands: params.operands };
  return solidMesh(`boolean:${JSON.stringify(geometry)}`, geometry, preflight);
}
export function buildExtrudeMesh(params: PrimitiveParams, preflight = false) {
  const geometry = { kind: "extrude", profile: params.profile, profiles: params.profiles, distance: params.distance };
  return solidMesh(`extrude:${JSON.stringify(geometry)}`, geometry, preflight);
}
export function buildFilletMesh(params: PrimitiveParams, preflight = false) {
  const geometry = { kind: "fillet", radius: params.radius, edgeKeys: params.edgeKeys, source: params.source };
  return solidMesh(`fillet:${JSON.stringify(geometry)}`, geometry, preflight);
}
export function buildChamferMesh(params: PrimitiveParams, preflight = false) {
  const geometry = { kind: "chamfer", distance: params.distance, edgeKeys: params.edgeKeys, source: params.source };
  return solidMesh(`chamfer:${JSON.stringify(geometry)}`, geometry, preflight);
}
export function buildRevolveMesh(params: PrimitiveParams, preflight = false) {
  const geometry = { kind: "revolve", angle: params.angle, axis: params.axis, axisOrigin: params.axisOrigin, axisDirection: params.axisDirection, profile: params.profile };
  return solidMesh(`revolve:${JSON.stringify(geometry)}`, geometry, preflight);
}
export function buildSweepMesh(params: PrimitiveParams, preflight = false) {
  const geometry = { kind: "sweep", profile: params.profile, spine: params.spine };
  return solidMesh(`sweep:${JSON.stringify(geometry)}`, geometry, preflight);
}
export function buildLoftMesh(params: PrimitiveParams, preflight = false) {
  const geometry = { kind: "loft", ruled: params.ruled === true, profiles: params.profiles };
  return solidMesh(`loft:${JSON.stringify(geometry)}`, geometry, preflight);
}
export async function validateExtrudeOperation(params: PrimitiveParams) { await buildExtrudeMesh(params, true); }
export async function validateBooleanOperation(params: PrimitiveParams) { await buildBooleanMesh(params, true); }
export async function validateFilletOperation(params: PrimitiveParams) { await buildFilletMesh(params, true); }
export async function validateChamferOperation(params: PrimitiveParams) { await buildChamferMesh(params, true); }
export async function validateRevolveOperation(params: PrimitiveParams) { await buildRevolveMesh(params, true); }
export async function validateSweepOperation(params: PrimitiveParams) { await buildSweepMesh(params, true); }
export async function validateLoftOperation(params: PrimitiveParams) { await buildLoftMesh(params, true); }

/**
 * STEP AP214 export. Never cached and never preflighted: every export is a
 * fresh transfer of the current solids. Cancel-aware like every kernel task.
 */
export function exportStepFile(solids: SerializedOperand[]): Promise<Uint8Array> {
  return runKernelTask("step", { solids }).then((result) => result.bytes);
}
export async function inspectSolid(operand: SerializedOperand) {
  // Key the complete immutable operand, including nested sources and placement.
  // Only exact matches reuse an OCCT result; every changed shape is still measured.
  const detached=structuredClone(operand),key=JSON.stringify(detached);
  const result=await cached(measurementCache,key,()=>runKernelTask("inspect",{operand:detached},false),"measurement");
  // Queries/reviews own their returned values and cannot poison later validation.
  return structuredClone(result);
}
export function enumerateSolidTopology(params: PrimitiveParams): Promise<BrepTopology> {
  return cached(topologyCache, `topology:${JSON.stringify(params)}`, () => runKernelTask("topology", params, false));
}
export async function resolveBrepReference(params: PrimitiveParams, kind: "brep-edge" | "brep-face", key: string): Promise<boolean> {
  const topology = await enumerateSolidTopology(params);
  return (kind === "brep-edge" ? topology.edges : topology.faces).some((entry) => entry.key === key);
}
export function buildDemoPartMesh() {
  return cached(meshCache, "demo:v1", () => runKernelTask("demo", {}));
}

/**
 * Cancel in-flight and queued kernel work (status-bar Cancel button,
 * future Copilot preflight abort). Returns the number of cancelled tasks.
 * Cancelled cache entries are dropped; the next request retries on a fresh
 * worker when the active one had to be terminated.
 */
export function cancelKernelTasks(): number {
  return client.cancelAll();
}

/** Cancel one kernel task by ID. Returns false for unknown task IDs. */
export function cancelKernelTask(taskId: number): boolean {
  return client.cancelTask(taskId);
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  client.reset();
  meshCache.clear();
  topologyCache.clear();
  measurementCache.clear();
});
/** World-space bounding box of kernel mesh positions, stored on composed features. */
export function meshPositionsBounds(positions: ArrayLike<number>): { min: [number, number, number]; max: [number, number, number] } | null {
  if (positions.length < 3) return null;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let index = 0; index + 2 < positions.length; index += 3) {
    const x = positions[index], y = positions[index + 1], z = positions[index + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }
  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) return null;
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}
