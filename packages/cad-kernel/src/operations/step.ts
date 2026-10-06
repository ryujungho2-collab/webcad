import { CadEngine } from "../runtime/CadEngine";

/**
 * STEP AP214 export for solid transfer to manufacturers and other CAD.
 * Shapes are transferred as-is (manifold BRep); the file round-trips
 * through Emscripten MEMFS and returns as bytes for download. Only closed
 * solids belong here — the caller filters feature types.
 */
export async function exportStepShapes(shapes: unknown[]): Promise<Uint8Array> {
  if (!shapes.length) {
    throw new Error("STEP export needs at least one solid.");
  }
  const engine = await CadEngine.create();
  const oc = engine.oc as unknown as Record<string, any>;
  const temporaries: { delete?: () => void }[] = [];
  const path = `/agent-webcad-export.step`;
  // The wasm build marshals enum returns as NaN (verified: transfer and
  // write succeed while returning NaN), so success is established by reading
  // real output back: an ISO-10303-21 header with sane length.
  // STEPControl_StepModelType::AsIs = 0 (stable OCCT ABI ordinal).
  try {
    const writer = new oc.STEPControl_Writer_1();
    temporaries.push(writer);
    for (const shape of shapes) {
      const progress = new oc.Message_ProgressRange_1();
      temporaries.push(progress);
      writer.Transfer(shape, 0, true, progress);
    }
    writer.Write(path);
    const data = new Uint8Array(oc.FS.readFile(path) as Uint8Array);
    const head = new TextDecoder().decode(data.slice(0, 64));
    if (!head.includes("ISO-10303-21") || data.length < 256) {
      throw new Error("STEP writer produced no usable file.");
    }
    return data;
  } finally {
    try {
      (oc.FS as { unlink?: (path: string) => void }).unlink?.(path);
    } catch {
      // Best-effort MEMFS cleanup; export bytes already copied out.
    }
    for (const value of temporaries.reverse()) value.delete?.();
  }
}
