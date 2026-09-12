import initOpenCascade, {
  type OpenCascadeInstance
} from "opencascade.js/dist/node.js";

export class CadEngine {
  private static instance: CadEngine | null = null;

  public readonly oc: OpenCascadeInstance;

  private constructor(oc: OpenCascadeInstance) {
    this.oc = oc;
  }

  static async create(): Promise<CadEngine> {
    if (!CadEngine.instance) {
      const oc = await initOpenCascade();
      CadEngine.instance = new CadEngine(oc);
    }

    return CadEngine.instance;
  }
}