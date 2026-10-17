import { CacheBudget, payloadBytes } from "./cacheBudget";
import { KernelWorkerClient } from "./kernelWorkerClient";
import { subscribeProjectActivity } from "../app/projectActivity";
import { isKernelCancelled, KernelCancelledError } from "./kernelProtocol";
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
export type KernelTaskOptions={signal?:AbortSignal};
const cacheBudget=new CacheBudget(64*1024*1024);
let viewController=new AbortController(),viewCancellations=0;
export function viewTaskOptions():KernelTaskOptions{return {signal:viewController.signal};}
let kernelStatus: KernelStatus = "deferred";
let progress: KernelTaskProgress | null = null;
let activeTasks = 0;
let submittedTasks = 0;
let gpuBytes=0,releasedGpuScenes=0;
export function setViewResourceMetrics(bytes:number,released=false){gpuBytes=bytes;if(released)releasedGpuScenes++;}
const settled=new WeakSet<object>(),requestSignals=new WeakMap<object,AbortSignal>();
let nodeQueue: Promise<unknown> = Promise.resolve();
let wasmTrimTimer:ReturnType<typeof setTimeout>|undefined;

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

// Keep short tab switches warm. Never interrupt document edits, queries or exports.
let idleWorkerReleases = 0;
let stopIdleWorkerTimer = () => {};
if (typeof window !== "undefined") {
  let idleTimer: ReturnType<typeof setInterval> | undefined;
  let trimTimer:ReturnType<typeof setTimeout>|undefined;
  const unsubscribe = subscribeProjectActivity(active => {
    if(trimTimer!==undefined)clearTimeout(trimTimer);
    if(!active)trimTimer=setTimeout(()=>cacheBudget.setLimit(0),30_000);
    if(active){if(viewController.signal.aborted)viewController=new AbortController();cacheBudget.setLimit(64*1024*1024);}else{viewCancellations++;viewController.abort();cacheBudget.setLimit(16*1024*1024);}
    if (idleTimer !== undefined) clearInterval(idleTimer);
    idleTimer = undefined;
    if (!active) idleTimer = setInterval(() => {
      if (activeTasks === 0 && client.releaseIfIdle()) { idleWorkerReleases++; setKernelStatus("deferred"); }
    }, 60_000);
  });
  stopIdleWorkerTimer = () => { unsubscribe(); if (idleTimer !== undefined) clearInterval(idleTimer);if(trimTimer!==undefined)clearTimeout(trimTimer); };
}
export function projectKernelMetrics() { return { ...client.metrics(),activeTasks, submittedTasks, idleWorkerReleases, viewCancellations,cacheBytes:cacheBudget.bytes,cacheLimitBytes:cacheBudget.limit,cacheEvictions:cacheBudget.evictions,gpuPayloadBytes:gpuBytes,releasedGpuScenes, meshCacheEntries: meshCache.size, topologyCacheEntries: topologyCache.size, measurementCacheEntries: measurementCache.size }; }

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

async function runKernelTask<K extends KernelOperation>(operation: K, params: PrimitiveParams, fatal = true, options:KernelTaskOptions={}): Promise<KernelTaskResults[K]> {
  if(wasmTrimTimer!==undefined)clearTimeout(wasmTrimTimer);
  activeTasks++;
  submittedTasks++;
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
    return await client.request(operation, params, options);
  } catch (error) {
    // Cancellation is user intent, not a kernel failure: keep status honest
    // so the next request retries instead of surfacing a phantom error.
    if (fatal && !isKernelCancelled(error)) setKernelStatus("error");
    throw error;
  } finally {
    activeTasks--;
    if (!activeTasks && (client.metrics().wasmCapacityBytes??0)>128*1024*1024)wasmTrimTimer=setTimeout(()=>{if(activeTasks===0&&client.releaseIfIdle()){idleWorkerReleases++;setKernelStatus("deferred");}},1000);
    if (!activeTasks && kernelStatus !== "error") setKernelStatus("ready");
    performance.measure(`agent-webcad:kernel-task:${operation}`, { start: startedAt, end: performance.now() });
  }
}

function cached<T>(cache: Map<string, Promise<T>>, key: string, factory: () => Promise<T>, kind="mesh", limit=CACHE_LIMIT, options:KernelTaskOptions={}): Promise<T> {
  if(options.signal?.aborted)return Promise.reject(new KernelCancelledError(-1));
  if(options.signal)key=`view:${key}`;
  let existing=cache.get(key);
  if(existing&&!settled.has(existing)&&options.signal&&requestSignals.get(existing)!==options.signal){cache.delete(key);cacheBudget.remove(existing);existing=undefined;}
  if(existing&&requestSignals.get(existing)?.aborted&&!settled.has(existing)){cache.delete(key);cacheBudget.remove(existing);existing=undefined;}
  if(existing){const mark=`agent-webcad:${kind}-cache-hit`;if(performance.getEntriesByName(mark).length>=128)performance.clearMarks(mark);performance.mark(mark,{detail:{keyBytes:key.length*2}});cache.delete(key);cache.set(key,existing);cacheBudget.touch(existing);return existing;}
  if(cache.size>=limit){const first=cache.keys().next().value!;cacheBudget.remove(cache.get(first)!);cache.delete(first);}
  let pending:Promise<T>;
  pending=factory().then(value=>{settled.add(pending);if(cache.get(key)===pending)cacheBudget.resize(pending,key.length*2+payloadBytes(value));return value;},error=>{if(cache.get(key)===pending)cache.delete(key);cacheBudget.remove(pending);throw error;});
  if(options.signal)requestSignals.set(pending,options.signal);
  cache.set(key,pending);cacheBudget.track(pending,key.length*2+65536,()=>{if(cache.get(key)===pending)cache.delete(key);});
  return pending;
}
function solidMesh(key: string, params: PrimitiveParams, preflight: boolean, options:KernelTaskOptions={}) {
  return cached(meshCache, key, () => runKernelTask("solid", params, !preflight,options),"mesh",CACHE_LIMIT,options);
}
export function buildBoxMesh(width: number, depth: number, height: number) {
  return buildPrimitiveMesh({ kind: "box", width, depth, height });
}
export function buildPrimitiveMesh(params: PrimitiveParams, options:KernelTaskOptions={}) {
  params=contentGeometryParams(params);
  return cached(meshCache, `primitive:${JSON.stringify(params)}`, () => runKernelTask("primitive", params,true,options),"mesh",CACHE_LIMIT,options);
}
export function buildBooleanMesh(params: PrimitiveParams, preflight = false, options:KernelTaskOptions={}) {
  const geometry = { operation: params.operation, operands: params.operands };
  return solidMesh(`boolean:${JSON.stringify(geometry)}`, geometry, preflight,options);
}
export function buildExtrudeMesh(params: PrimitiveParams, preflight = false, options:KernelTaskOptions={}) {
  const geometry = { kind: "extrude", profile: params.profile, profiles: params.profiles, distance: params.distance };
  return solidMesh(`extrude:${JSON.stringify(geometry)}`, geometry, preflight,options);
}
export function buildFilletMesh(params: PrimitiveParams, preflight = false, options:KernelTaskOptions={}) {
  const geometry = { kind: "fillet", radius: params.radius, edgeKeys: params.edgeKeys, source: params.source };
  return solidMesh(`fillet:${JSON.stringify(geometry)}`, geometry, preflight,options);
}
export function buildChamferMesh(params: PrimitiveParams, preflight = false, options:KernelTaskOptions={}) {
  const geometry = { kind: "chamfer", distance: params.distance, edgeKeys: params.edgeKeys, source: params.source };
  return solidMesh(`chamfer:${JSON.stringify(geometry)}`, geometry, preflight,options);
}
export function buildShellMesh(params:PrimitiveParams,preflight=false,options:KernelTaskOptions={}){
  const geometry={kind:"shell",thickness:params.thickness,faceKeys:params.faceKeys,source:params.source};
  return solidMesh(`shell:${JSON.stringify(geometry)}`,geometry,preflight,options);
}
export function buildRevolveMesh(params: PrimitiveParams, preflight = false, options:KernelTaskOptions={}) {
  const geometry = { kind: "revolve", angle: params.angle, axis: params.axis, axisOrigin: params.axisOrigin, axisDirection: params.axisDirection, profile: params.profile };
  return solidMesh(`revolve:${JSON.stringify(geometry)}`, geometry, preflight,options);
}
export function buildSweepMesh(params: PrimitiveParams, preflight = false, options:KernelTaskOptions={}) {
  const geometry = { kind: "sweep", profile: params.profile, spine: params.spine };
  return solidMesh(`sweep:${JSON.stringify(geometry)}`, geometry, preflight,options);
}
export function buildLoftMesh(params: PrimitiveParams, preflight = false, options:KernelTaskOptions={}) {
  const geometry = { kind: "loft", ruled: params.ruled === true, profiles: params.profiles };
  return solidMesh(`loft:${JSON.stringify(geometry)}`, geometry, preflight,options);
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
/** Evaluated content and finish metadata never drive an exact kernel shape. */
function contentGeometryParams(params:PrimitiveParams):PrimitiveParams{const {solidFinish:_,componentContent:__,...geometry}=params;return {...geometry,...Array.isArray(geometry.operands)?{operands:(geometry.operands as SerializedOperand[]).map(o=>({...o,params:contentGeometryParams(o.params)}))}:{},...geometry.source&&typeof geometry.source==="object"&&"params" in geometry.source?{source:{...geometry.source,params:contentGeometryParams((geometry.source as SerializedOperand).params)}}:{}};}
export async function inspectSolid(operand: SerializedOperand) {
  // Key the complete immutable operand, including nested sources and placement.
  // Only exact matches reuse an OCCT result; every changed shape is still measured.
  const detached=structuredClone(operand);detached.params=contentGeometryParams(detached.params);const key=JSON.stringify(detached);
  const result=await cached(measurementCache,key,()=>runKernelTask("inspect",{operand:detached},false),"measurement");
  // Queries/reviews own their returned values and cannot poison later validation.
  return structuredClone(result);
}
export function enumerateSolidTopology(params: PrimitiveParams, options:KernelTaskOptions={}): Promise<BrepTopology> {
  return cached(topologyCache, `topology:${JSON.stringify(params)}`, () => runKernelTask("topology", params, false,options),"topology",CACHE_LIMIT,options);
}
export async function resolveBrepReference(params: PrimitiveParams, kind: "brep-edge" | "brep-face", key: string): Promise<boolean> {
  const topology = await enumerateSolidTopology(params);
  return (kind === "brep-edge" ? topology.edges : topology.faces).some((entry) => entry.key === key);
}
export function buildDemoPartMesh(options:KernelTaskOptions={}) {
  return cached(meshCache, "demo:v1", () => runKernelTask("demo", {},true,options),"mesh",CACHE_LIMIT,options);
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
  if(wasmTrimTimer!==undefined)clearTimeout(wasmTrimTimer);
  stopIdleWorkerTimer();
  cacheBudget.setLimit(0);client.reset();
  meshCache.clear();
  topologyCache.clear();
  measurementCache.clear();
  sectionCache.clear();
  projectionCache.clear();
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

const sectionCache=new Map<string,Promise<KernelTaskResults["section"]>>();
const projectionCache=new Map<string,Promise<KernelTaskResults["projection"]>>();
export async function projectSolids(operands:SerializedOperand[],normal:[number,number,number],xAxis:[number,number,number],clipping?:import("@agent-webcad/cad-kernel").ProjectionClip){
 const params=structuredClone({operands,normal,xAxis,...clipping?{clipping}:{}});return structuredClone(await cached(projectionCache,JSON.stringify(params),()=>runKernelTask("projection",params,false),"projection",32));
}
export async function sectionSolid(operand:SerializedOperand,normal:[number,number,number],height:number){
 const params=structuredClone({operand,normal,height});return structuredClone(await cached(sectionCache,JSON.stringify(params),()=>runKernelTask("section",params,false),"section",1024));
}


