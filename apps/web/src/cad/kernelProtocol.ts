export type PrimitiveParams = Record<string, unknown>;
export type SerializedOperand = { params: PrimitiveParams; transform?: { translation?: number[]; rotation?: number[]; scale?: number[] } };
export type MeshData = {
  positions: Float64Array;
  normals: Float32Array;
  indices: Uint32Array;
  faces?: { key: string; start: number; count: number }[];
};
export type BrepTopologyFace = { key: string };
export type BrepTopologyEdge = { key: string; points: [number, number, number][] };
export type BrepTopology = { faces: BrepTopologyFace[]; edges: BrepTopologyEdge[] };
export type StepData = { bytes: Uint8Array };
export type KernelTaskResults = {
  projection: import("@agent-webcad/cad-kernel").ProjectionCurve[];
  section: import("@agent-webcad/cad-kernel").SectionCurve[];
  inspect: import("@agent-webcad/cad-document").GeometryMeasurement;
  primitive: MeshData;
  solid: MeshData;
  demo: MeshData;
  topology: BrepTopology;
  step: StepData;
};
export type KernelOperation = keyof KernelTaskResults;
export type KernelTaskPhase = "queued" | "loading" | "building" | "meshing" | "topology" | "measuring";
export type KernelTaskProgress = {
  taskId: number;
  operation: KernelOperation;
  phase: KernelTaskPhase;
  pendingCount: number;
};
export type KernelRequest = { taskId: number; operation: KernelOperation; params: PrimitiveParams };
export type KernelResponse =
  | { type: "progress"; taskId: number; phase: KernelTaskPhase }
  | { type: "result"; taskId: number; result: KernelTaskResults[KernelOperation]; memory?:{capacityBytes:number|null;retainedSources:number;retainedSlabs:number} }
  | { type: "error"; taskId: number; message: string };

/** Rejection message for user- or agent-initiated task cancellation. Never
 * produced by the worker itself: cancel is client-side (drop queued work,
 * terminate a blocked worker). Cancelled tasks must not flip kernel status
 * to "error" and their cache entries are dropped like any rejection. */
export const KERNEL_CANCELLED_MESSAGE = "Kernel task cancelled.";

export class KernelCancelledError extends Error {
  constructor(taskId: number) {
    super(`${KERNEL_CANCELLED_MESSAGE} (task ${taskId})`);
    this.name = "KernelCancelledError";
  }
}

export function isKernelCancelled(error: unknown): boolean {
  return error instanceof KernelCancelledError ||
    (error instanceof Error && error.message.includes(KERNEL_CANCELLED_MESSAGE));
}

export function meshTransferList(result: KernelTaskResults[KernelOperation]): ArrayBuffer[] {
  if ("positions" in result) {
    return [result.positions.buffer, result.normals.buffer, result.indices.buffer] as ArrayBuffer[];
  }
  if ("bytes" in result) {
    return [result.bytes.buffer] as ArrayBuffer[];
  }
  return [];
}
