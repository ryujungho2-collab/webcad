import type {
  OpenCascadeInstance,
} from "opencascade.js";

type InitOpenCascade = (
  settings?: Record<string, unknown>
) => Promise<OpenCascadeInstance>;

async function loadBrowserOpenCascade(): Promise<OpenCascadeInstance> {
  const [
    jsModule,
    wasmModule,
  ] = await Promise.all([
    import("opencascade.js/dist/opencascade.full.js"),
    import("opencascade.js/dist/opencascade.full.wasm?url"),
  ]);

  type OpenCascadeMainJS = new (
    settings?: {
      locateFile?: (path: string) => string;
      [key: string]: unknown;
    }
  ) => Promise<OpenCascadeInstance>;

  const mainJS =
    jsModule.default as unknown as OpenCascadeMainJS;

  const mainWasm = wasmModule.default;

  return new Promise((resolve) => {
    new mainJS({
      locateFile(path: string) {
        if (path.endsWith(".wasm")) {
          return mainWasm;
        }

        return path;
      },
    }).then((oc) => {
      resolve(oc);
    });
  });
}

async function loadNodeOpenCascade(): Promise<OpenCascadeInstance> {
  const nodeEntry =
    "opencascade.js/dist/" + "node.js";

  const module = await import(
    /* @vite-ignore */
    nodeEntry
  );

  const initOpenCascade =
    module.default as InitOpenCascade;

  return initOpenCascade();
}

export class CadEngine {
  private static instance: CadEngine | null = null;

  public readonly oc: OpenCascadeInstance;

  private constructor(
    oc: OpenCascadeInstance
  ) {
    this.oc = oc;
  }

  static async create(): Promise<CadEngine> {
    if (!CadEngine.instance) {
      const startedAt = globalThis.performance?.now();
      const oc =
        typeof window !== "undefined"
          ? await loadBrowserOpenCascade()
          : await loadNodeOpenCascade();

      CadEngine.instance =
        new CadEngine(oc);

      if (startedAt !== undefined) {
        globalThis.performance?.measure("agent-webcad:opencascade-init", {
          start: startedAt,
          end: globalThis.performance.now(),
        });
      }
    }

    return CadEngine.instance;
  }
}
