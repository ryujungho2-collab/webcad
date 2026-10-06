import { executeKernelOperation } from "./kernelRuntime";
import { meshTransferList, type KernelRequest, type KernelResponse } from "./kernelProtocol";

// Local interface avoids combining conflicting DOM and WebWorker lib globals.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<KernelRequest>) => void) | null;
  postMessage: (message: KernelResponse, transfer?: Transferable[]) => void;
};
let queue: Promise<void> = Promise.resolve();
scope.onmessage = ({ data }) => {
  // OCCT owns shared WASM state: one operation at a time even across awaits.
  queue = queue.then(async () => {
    try {
      const result = await executeKernelOperation(data.operation, data.params, (phase) => {
        scope.postMessage({ type: "progress", taskId: data.taskId, phase });
      });
      scope.postMessage({ type: "result", taskId: data.taskId, result }, meshTransferList(result));
    } catch (error) {
      scope.postMessage({ type: "error", taskId: data.taskId, message: error instanceof Error ? error.message : String(error) });
    }
  });
};
