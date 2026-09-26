export type MeshData = {
  positions: number[];
  normals: number[];
  indices: number[];
  faces?: import("@agent-webcad/cad-kernel").MeshedFaceRange[];
};

export type BrepTopologyFace = { key: string };
export type BrepTopologyEdge = { key: string; points: [number, number, number][] };
export type BrepTopology = { faces: BrepTopologyFace[]; edges: BrepTopologyEdge[] };

export type KernelStatus = "deferred" | "loading" | "ready" | "working" | "error";

type CadKernelModule = typeof import("@agent-webcad/cad-kernel");
type StatusListener = (status: KernelStatus) => void;

const primitiveMeshCache = new Map<string, Promise<MeshData>>();
const statusListeners = new Set<StatusListener>();
const MAX_PRIMITIVE_CACHE_ENTRIES = 64;

let kernelPromise: Promise<CadKernelModule> | null = null;
let kernelStatus: KernelStatus = "deferred";
let activeTasks = 0;

function setKernelStatus(status: KernelStatus) {
  if (kernelStatus === status) return;
  kernelStatus = status;
  for (const listener of statusListeners) listener(status);
}

function yieldForInitialPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    const requestIdle = (window as Window & { requestIdleCallback?: typeof window.requestIdleCallback }).requestIdleCallback;
    if (requestIdle) {
      requestIdle(() => resolve(), { timeout: 200 });
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
}

async function loadKernel() {
  if (!kernelPromise) {
    kernelPromise = (async () => {
      await yieldForInitialPaint();
      setKernelStatus("loading");
      const startedAt = performance.now();
      try {
        const kernel = await import("@agent-webcad/cad-kernel");
        performance.measure("agent-webcad:kernel-module-load", {
          start: startedAt,
          end: performance.now(),
        });
        return kernel;
      } catch (error) {
        setKernelStatus("error");
        throw error;
      }
    })();
  }

  return kernelPromise;
}

async function runKernelTask<T>(name: string, task: (kernel: CadKernelModule) => Promise<T>, options: { fatal?: boolean } = {}) {
  activeTasks += 1;
  setKernelStatus(kernelPromise ? "working" : "loading");
  const startedAt = performance.now();
  try {
    const result = await task(await loadKernel());
    const duration = performance.now() - startedAt;
    performance.measure(`agent-webcad:kernel-task:${name}`, {
      start: startedAt,
      end: performance.now(),
    });
    if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) {
      const ocInit = performance.getEntriesByName("agent-webcad:opencascade-init").at(-1);
      console.info("[agent-webcad:perf]", JSON.stringify({
        task: name,
        taskMs: Number(duration.toFixed(1)),
        openCascadeInitMs: ocInit ? Number(ocInit.duration.toFixed(1)) : null,
      }));
    }
    return result;
  } catch (error) {
    if (options.fatal !== false) setKernelStatus("error");
    throw error;
  } finally {
    activeTasks -= 1;
    if ((kernelStatus !== "error" || options.fatal === false) && activeTasks === 0) setKernelStatus("ready");
  }
}

function getCachedMesh(key: string, factory: () => Promise<MeshData>) {
  const cached = primitiveMeshCache.get(key);
  if (cached) {
    performance.mark("agent-webcad:mesh-cache-hit", { detail: { key } });
    if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) {
      console.info("[agent-webcad:perf]", JSON.stringify({ meshCacheHit: key }));
    }
    return cached;
  }

  if (primitiveMeshCache.size >= MAX_PRIMITIVE_CACHE_ENTRIES) {
    const oldestKey = primitiveMeshCache.keys().next().value;
    if (oldestKey) primitiveMeshCache.delete(oldestKey);
  }

  const pending = factory().catch((error) => {
    primitiveMeshCache.delete(key);
    throw error;
  });
  primitiveMeshCache.set(key, pending);
  return pending;
}

export function subscribeKernelStatus(listener: StatusListener) {
  statusListeners.add(listener);
  listener(kernelStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

export function buildBoxMesh(width: number, depth: number, height: number) {
  const key = `box:${width}:${depth}:${height}`;
  return getCachedMesh(key, () => runKernelTask(key, async ({ createBox, shapeToMesh }) => {
    const shape = await createBox(width, depth, height);
    try {
      return await shapeToMesh(shape);
    } finally {
      shape?.delete?.();
    }
  }));
}

type PrimitiveParams = Record<string, unknown>;
type SerializedOperand = { params: PrimitiveParams; transform?: { translation?: number[]; rotation?: number[]; scale?: number[] } };

async function createPrimitiveShape(kernel: CadKernelModule, params: PrimitiveParams) {
  const kind = String(params.kind ?? "box");
  if (kind === "box") return kernel.createBox(Number(params.width), Number(params.depth), Number(params.height));
  if (kind === "cylinder") return kernel.createCylinder(Number(params.radius), Number(params.height));
  if (kind === "sphere") return kernel.createSphere(Number(params.radius));
  if (kind === "cone") return kernel.createCone(Number(params.radius1), Number(params.radius2), Number(params.height));
  if (kind === "torus") return kernel.createTorus(Number(params.majorRadius), Number(params.minorRadius));
  throw new Error(`Unsupported primitive kind: ${kind}`);
}

async function placeShape(kernel: CadKernelModule, shape: any, operand: SerializedOperand) {
  const translation = operand.transform?.translation ?? [0, 0, 0];
  let placed = shape;
  if (translation.some((value) => value !== 0)) placed = await kernel.translate(placed, translation[0] ?? 0, translation[1] ?? 0, translation[2] ?? 0);
  const rotation = operand.transform?.rotation ?? [0, 0, 0];
  for (const [axis, degrees] of [[[1, 0, 0], rotation[0]], [[0, 1, 0], rotation[1]], [[0, 0, 1], rotation[2]]] as const) {
    if (degrees) placed = await kernel.rotate(placed, [...axis] as [number, number, number], degrees * Math.PI / 180);
  }
  return placed;
}

export function buildPrimitiveMesh(params: PrimitiveParams) {
  const key = `primitive:${JSON.stringify(params)}`;
  return getCachedMesh(key, () => runKernelTask(key, async (kernel) => {
    const shape = await createPrimitiveShape(kernel, params);
    try { return await kernel.shapeToMesh(shape); } finally { shape?.delete?.(); }
  }));
}

/**
 * Builds one operand shape, recursing into composed (extrude/boolean) params
 * so booleans compose over the full solid pipeline instead of primitives
 * only. Each level applies its own stored placement; ownership transfers to
 * the caller, mirroring the existing cleanup discipline.
 */
async function buildOperandShape(kernel: CadKernelModule, operand: SerializedOperand): Promise<any> {
  const kind = String(operand.params.kind ?? "");
  if (kind === "extrude") {
    const distance = Number(operand.params.distance);
    const profile = operand.params.profile as Parameters<typeof kernel.extrudeProfile>[0];
    if (!profile || !Number.isFinite(distance)) throw new Error("Invalid extrude operand.");
    const raw = await kernel.extrudeProfile(profile, distance);
    const placed = await placeShape(kernel, raw, operand);
    if (placed !== raw) raw?.delete?.();
    return placed;
  }
  const nested = operand.params.operands as SerializedOperand[] | undefined;
  const operation = String(operand.params.operation ?? "");
  if (Array.isArray(nested) && (operation === "union" || operation === "cut" || operation === "intersect")) {
    if (nested.length !== 2) throw new Error("Invalid nested boolean operands.");
    const left = await buildOperandShape(kernel, nested[0]);
    let right: any;
    try {
      right = await buildOperandShape(kernel, nested[1]);
    } catch (error) {
      left?.delete?.();
      throw error;
    }
    let combined: any;
    try {
      combined = operation === "union" ? await kernel.fuse(left, right)
        : operation === "intersect" ? await kernel.intersect(left, right)
        : await kernel.cut(left, right);
    } finally {
      left?.delete?.();
      right?.delete?.();
    }
    const placed = await placeShape(kernel, combined, operand);
    if (placed !== combined) combined?.delete?.();
    return placed;
  }
  const source = await createPrimitiveShape(kernel, operand.params);
  const placedPrimitive = await placeShape(kernel, source, operand);
  if (placedPrimitive !== source) source?.delete?.();
  return placedPrimitive;
}

export function buildBooleanMesh(params: PrimitiveParams, preflight = false) {
  const key = `boolean:${JSON.stringify(params)}`;
  return getCachedMesh(key, () => runKernelTask(key, async (kernel) => {
    const operands = params.operands as SerializedOperand[];
    if (!Array.isArray(operands) || operands.length !== 2) throw new Error("Invalid boolean operands.");
    const a = await buildOperandShape(kernel, operands[0]);
    let b: any;
    try {
      b = await buildOperandShape(kernel, operands[1]);
    } catch (error) {
      a?.delete?.();
      throw error;
    }
    let result: any;
    try {
      result = params.operation === "union" ? await kernel.fuse(a, b) : params.operation === "intersect" ? await kernel.intersect(a, b) : await kernel.cut(a, b);
      return await kernel.shapeToMesh(result);
    } finally {
      result?.delete?.();
      a?.delete?.();
      b?.delete?.();
    }
  }, { fatal: !preflight }));
}

export function buildExtrudeMesh(params: PrimitiveParams, preflight = false) {
  const key = `extrude:${JSON.stringify(params)}`;
  return getCachedMesh(key, () => runKernelTask(key, async ({ extrudeProfile, shapeToMesh }) => {
    const profile = params.profile as Parameters<typeof extrudeProfile>[0];
    const distance = Number(params.distance);
    const shape = await extrudeProfile(profile, distance);
    try {
      return await shapeToMesh(shape);
    } finally {
      shape?.delete?.();
    }
  }, { fatal: !preflight }));
}

export async function validateExtrudeOperation(params: PrimitiveParams) {
  await buildExtrudeMesh(params, true);
}

/** Runs the exact cached operation before a boolean command mutates the document. */
export async function validateBooleanOperation(params: PrimitiveParams) {
  await buildBooleanMesh(params, true);
}

const topologyCache = new Map<string, Promise<BrepTopology>>();

/**
 * Enumerates stable geometric references (faces + edges) for one solid's
 * feature params in params-local frame: no object placement is applied, so
 * keys survive viewport moves and can be matched after deterministic
 * rebuilds. Resolution primitive for selection validation and future
 * selective fillet/chamfer; never called per pointer event (viewport caches).
 */
export function enumerateSolidTopology(params: PrimitiveParams): Promise<BrepTopology> {
  const key = `brep-topology:${JSON.stringify(params)}`;
  const cached = topologyCache.get(key);
  if (cached) return cached;
  if (topologyCache.size >= MAX_PRIMITIVE_CACHE_ENTRIES) {
    const oldestKey = topologyCache.keys().next().value;
    if (oldestKey) topologyCache.delete(oldestKey);
  }
  const pending = runKernelTask(key, async (kernel) => {
    const shape = await buildOperandShape(kernel, { params });
    try {
      const mesh = await kernel.shapeToMesh(shape);
      const edges = await kernel.enumerateSolidEdges(shape);
      return {
        faces: (mesh.faces as { key: string }[]).map((entry) => ({ key: entry.key })),
        edges: edges.map((entry) => ({ key: entry.key, points: entry.points })),
      };
    } finally {
      shape?.delete?.();
    }
  }, { fatal: false });
  pending.catch(() => {
    topologyCache.delete(key);
  });
  topologyCache.set(key, pending);
  return pending;
}

/** Async use-time check: does this reference still resolve against current params? */
export async function resolveBrepReference(
  params: PrimitiveParams,
  kind: "brep-edge" | "brep-face",
  key: string,
): Promise<boolean> {
  const topology = await enumerateSolidTopology(params);
  const list = kind === "brep-edge" ? topology.edges : topology.faces;
  return list.some((entry) => entry.key === key);
}

export function buildDemoPartMesh() {
  const key = "demo:boolean-cut:v1";
  return getCachedMesh(key, () => runKernelTask(key, async ({ createBox, createCylinder, translate, cut, shapeToMesh }) => {
    const box = await createBox(10, 10, 10);
    const cylinder = await createCylinder(3, 14);
    const movedCylinder = await translate(cylinder, 5, 5, -2);
    const result = await cut(box, movedCylinder);
    try {
      return await shapeToMesh(result);
    } finally {
      result?.delete?.();
      movedCylinder?.delete?.();
      cylinder?.delete?.();
      box?.delete?.();
    }
  }));
}
