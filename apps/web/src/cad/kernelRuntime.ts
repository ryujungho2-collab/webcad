import type { KernelOperation, KernelTaskPhase, KernelTaskResults, PrimitiveParams, SerializedOperand } from "./kernelProtocol";
import { CAD_PRECISION } from "@agent-webcad/cad-document";
type CadKernelModule = typeof import("@agent-webcad/cad-kernel");
let kernelPromise: Promise<CadKernelModule> | null = null;

async function loadKernel() {
  if (!kernelPromise) {
    kernelPromise = import("@agent-webcad/cad-kernel").then(async (kernel) => {
      await kernel.CadEngine.create();
      return kernel;
    }).catch((error) => { kernelPromise = null; throw error; });
  }
  return kernelPromise;
}
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
  return kernel.transformShape(shape, operand.transform ?? {});
}

async function buildUnplacedShape(kernel: CadKernelModule, params: PrimitiveParams): Promise<any> {
  const kind = String(params.kind ?? "");
  if (kind === "extrude") {
    const distance = Number(params.distance);
    const profile = params.profile as Parameters<typeof kernel.extrudeProfile>[0];
    const profiles = params.profiles as typeof profile[] | undefined;
    if ((!profile && !profiles?.length) || !Number.isFinite(distance)) throw new Error("Invalid extrude operand.");
    return kernel.extrudeProfiles(profiles ?? [profile], distance);
  }
  if (kind === "fillet") {
    const radius = Number(params.radius);
    const edgeKeys = params.edgeKeys as string[] | undefined;
    const source = params.source as SerializedOperand | undefined;
    if (!(radius > 0) || !Array.isArray(edgeKeys) || !edgeKeys.length || !source) {
      throw new Error("Invalid fillet parameters.");
    }
    const uniqueKeys = [...new Set(edgeKeys)];
    const base = await buildUnplacedShape(kernel, source.params);
    let indices: number[];
    try {
      indices = await resolveFilletEdgeIndices(kernel, base, uniqueKeys);
    } catch (error) {
      base?.delete?.();
      throw error;
    }
    let result: any;
    try {
      result = await kernel.filletEdges(base, radius, indices);
    } finally {
      base?.delete?.();
    }
    const placed = await placeShape(kernel, result, { params, transform: source.transform });
    if (placed !== result) result?.delete?.();
    return placed;
  }
  if (kind === "chamfer") {
    // Mirrors the fillet branch above (kept separate so the proven fillet
    // path is never refactored under a passing suite): resolve stable keys
    // in params-local frame, chamfer, then apply the source placement once.
    const distance = Number(params.distance);
    const edgeKeys = params.edgeKeys as string[] | undefined;
    const source = params.source as SerializedOperand | undefined;
    if (!(distance > 0) || !Array.isArray(edgeKeys) || !edgeKeys.length || !source) {
      throw new Error("Invalid chamfer parameters.");
    }
    const uniqueKeys = [...new Set(edgeKeys)];
    const base = await buildUnplacedShape(kernel, source.params);
    let indices: number[];
    try {
      indices = await resolveFilletEdgeIndices(kernel, base, uniqueKeys);
    } catch (error) {
      base?.delete?.();
      throw error;
    }
    let result: any;
    try {
      result = await kernel.chamferEdges(base, distance, indices);
    } finally {
      base?.delete?.();
    }
    const placed = await placeShape(kernel, result, { params, transform: source.transform });
    if (placed !== result) result?.delete?.();
    return placed;
  }
  if (kind === "revolve") {    // Axis origin/direction are resolved to plain coordinates by the command
    // handler, so this layer stays work-plane agnostic like the other cases.
    // Stored params keep `axis: "x" | "y"` for the Inspector plus resolved
    // `axisOrigin`/`axisDirection` coordinates; accept a canonical
    // `{ origin, direction }` object as well for forward compatibility.
    const profile = params.profile as Parameters<typeof kernel.revolveProfile>[0];
    const rawAxis = params.axis as unknown;
    const axis = typeof rawAxis === "object" && rawAxis !== null && "origin" in rawAxis && "direction" in rawAxis
      ? rawAxis as { origin: [number, number, number]; direction: [number, number, number] }
      : Array.isArray(params.axisOrigin) && Array.isArray(params.axisDirection)
        ? { origin: params.axisOrigin as [number, number, number], direction: params.axisDirection as [number, number, number] }
        : undefined;
    const angle = Number(params.angle) * Math.PI / 180;
    if (!profile || !axis || !Number.isFinite(angle) || angle <= 1e-9) {
      throw new Error("Invalid revolve parameters.");
    }
    return kernel.revolveProfile(profile, axis, angle);
  }
  if (kind === "sweep") {
    const profile = params.profile as Parameters<typeof kernel.sweepProfile>[0];
    const spine = params.spine as Parameters<typeof kernel.sweepProfile>[1];
    if (!profile || !Array.isArray(spine)) {
      throw new Error("Invalid sweep parameters.");
    }
    return kernel.sweepProfile(profile, spine);
  }
  if (kind === "loft") {
    const profiles = params.profiles as Parameters<typeof kernel.loftProfiles>[0];
    const ruled = params.ruled === true;
    if (!Array.isArray(profiles)) {
      throw new Error("Invalid loft parameters.");
    }
    return kernel.loftProfiles(profiles, ruled);
  }
  const nested = params.operands as SerializedOperand[] | undefined;
  const operation = String(params.operation ?? "");
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
    try {
      return operation === "union" ? await kernel.fuse(left, right)
        : operation === "intersect" ? await kernel.intersect(left, right)
        : await kernel.cut(left, right);
    } finally {
      left?.delete?.();
      right?.delete?.();
    }
  }
  return createPrimitiveShape(kernel, params);
}

async function buildOperandShape(kernel: CadKernelModule, operand: SerializedOperand): Promise<any> {
  const shape = await buildUnplacedShape(kernel, operand.params);
  const placed = await placeShape(kernel, shape, operand);
  if (placed !== shape) shape?.delete?.();
  return placed;
}

async function resolveFilletEdgeIndices(kernel: CadKernelModule, shape: any, keys: string[]): Promise<number[]> {
  const enumerated = await kernel.enumerateSolidEdges(shape);
  return keys.map((key) => {
    const match = enumerated.find((entry: { key: string; index: number }) => entry.key === key);
    if (!match || !Number.isInteger(match.index) || match.index < 1) {
      throw new Error(`Fillet edge reference no longer resolves: ${key}`);
    }
    return match.index;
  });
}


/** Runs only in a browser Worker, or explicitly in Node for geometry tests.
 * BRep handles never leave this module; every result is structured-clone safe. */
export async function executeKernelOperation<K extends KernelOperation>(
  operation: K,
  params: PrimitiveParams,
  progress: (phase: KernelTaskPhase) => void = () => {},
): Promise<KernelTaskResults[K]> {
  progress("loading");
  const kernel = await loadKernel();
  if (operation === "inspect") {
    progress("building");
    const operand = params.operand as SerializedOperand | undefined;
    if (!operand?.params) throw new Error("Inspection needs a solid operand.");
    const shape = await buildOperandShape(kernel, operand);
    try { progress("measuring"); return await kernel.inspectShape(shape, CAD_PRECISION.brepPropertyRelativeTolerance) as KernelTaskResults[K]; }
    finally { shape?.delete?.(); }
  }
  if (operation === "step") {
    // File export path: shapes never mesh here, bytes cross the boundary.
    const solids = params.solids as SerializedOperand[] | undefined;
    if (!Array.isArray(solids) || !solids.length) {
      throw new Error("STEP export needs at least one solid.");
    }
    progress("building");
    const shapes: unknown[] = [];
    try {
      for (const solid of solids) shapes.push(await buildOperandShape(kernel, solid));
      progress("meshing");
      const bytes = await kernel.exportStepShapes(shapes);
      return { bytes } as KernelTaskResults[K];
    } finally {
      for (const shape of shapes) (shape as { delete?: () => void })?.delete?.();
    }
  }
  progress("building");
  let shape: any;
  try {
    if (operation === "demo") {
      const box = await kernel.createBox(10, 10, 10);
      let cylinder: any, moved: any;
      try {
        cylinder = await kernel.createCylinder(3, 14);
        moved = await kernel.translate(cylinder, 5, 5, -2);
        shape = await kernel.cut(box, moved);
      } finally { moved?.delete?.(); cylinder?.delete?.(); box?.delete?.(); }
    } else if (operation === "primitive") {
      shape = await createPrimitiveShape(kernel, params);
    } else {
      shape = await buildOperandShape(kernel, { params });
    }
    progress("meshing");
    const mesh = await kernel.shapeToMesh(shape);
    if (operation === "topology") {
      progress("topology");
      const edges = await kernel.enumerateSolidEdges(shape);
      return {
        faces: mesh.faces.map(({ key }) => ({ key })),
        edges: edges.map(({ key, points }) => ({ key, points })),
      } as KernelTaskResults[K];
    }
    // Positions retain double precision for bounds and geometry checks.
    // Buffers are owned by this task and transferred once, never cached here.
    return {
      positions: new Float64Array(mesh.positions),
      normals: new Float32Array(mesh.normals),
      indices: new Uint32Array(mesh.indices),
      faces: mesh.faces,
    } as KernelTaskResults[K];
  } finally { shape?.delete?.(); }
}
