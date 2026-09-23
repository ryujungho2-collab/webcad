export type MeshData = {
  positions: number[];
  normals: number[];
  indices: number[];
};

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

export function buildBooleanMesh(params: PrimitiveParams, preflight = false) {
  const key = `boolean:${JSON.stringify(params)}`;
  return getCachedMesh(key, () => runKernelTask(key, async (kernel) => {
    const operands = params.operands as SerializedOperand[];
    if (!Array.isArray(operands) || operands.length !== 2) throw new Error("Invalid boolean operands.");
    const sourceA = await createPrimitiveShape(kernel, operands[0].params);
    const sourceB = await createPrimitiveShape(kernel, operands[1].params);
    let a: any = sourceA; let b: any = sourceB; let result: any;
    try {
      a = await placeShape(kernel, a, operands[0]);
      b = await placeShape(kernel, b, operands[1]);
      result = params.operation === "union" ? await kernel.fuse(a, b) : params.operation === "intersect" ? await kernel.intersect(a, b) : await kernel.cut(a, b);
      return await kernel.shapeToMesh(result);
    } finally { result?.delete?.(); if (a !== sourceA) a?.delete?.(); if (b !== sourceB) b?.delete?.(); sourceA?.delete?.(); sourceB?.delete?.(); }
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
