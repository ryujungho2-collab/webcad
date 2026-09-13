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

async function runKernelTask<T>(name: string, task: (kernel: CadKernelModule) => Promise<T>) {
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
    if (import.meta.env.DEV) {
      const ocInit = performance.getEntriesByName("agent-webcad:opencascade-init").at(-1);
      console.info("[agent-webcad:perf]", JSON.stringify({
        task: name,
        taskMs: Number(duration.toFixed(1)),
        openCascadeInitMs: ocInit ? Number(ocInit.duration.toFixed(1)) : null,
      }));
    }
    return result;
  } catch (error) {
    setKernelStatus("error");
    throw error;
  } finally {
    activeTasks -= 1;
    if (kernelStatus !== "error" && activeTasks === 0) setKernelStatus("ready");
  }
}

function getCachedMesh(key: string, factory: () => Promise<MeshData>) {
  const cached = primitiveMeshCache.get(key);
  if (cached) {
    performance.mark("agent-webcad:mesh-cache-hit", { detail: { key } });
    if (import.meta.env.DEV) {
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
