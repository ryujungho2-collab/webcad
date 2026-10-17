import { KernelCancelledError, type KernelOperation, type KernelRequest, type KernelResponse, type KernelTaskProgress, type KernelTaskResults, type PrimitiveParams } from "./kernelProtocol";

export interface KernelWorkerPort {
  onmessage: ((event: MessageEvent<KernelResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: KernelRequest): void;
  terminate(): void;
}
type PendingTask = {
  signal?:AbortSignal;
  request: KernelRequest;
  resolve: (result: KernelTaskResults[KernelOperation]) => void;
  reject: (error: Error) => void;
};

/** Lazy RPC transport. IDs are never reused, including after worker restart. */
export class KernelWorkerClient {
  private worker: KernelWorkerPort | null = null;
  private nextId = 1;
  private tasks: PendingTask[] = [];
  private active: PendingTask | null = null;
  private progress: KernelTaskProgress | null = null;
  private memory:{capacityBytes:number|null;retainedSources:number;retainedSlabs:number}={capacityBytes:0,retainedSources:0,retainedSlabs:0};
  private workersCreated=0;
  private cancelledTasks=0;
  metrics(){return {workerResident:!!this.worker,workersCreated:this.workersCreated,cancelledTasks:this.cancelledTasks,wasmCapacityBytes:this.memory.capacityBytes,retainedSources:this.memory.retainedSources,retainedSlabs:this.memory.retainedSlabs};}

  constructor(
    private readonly createWorker: () => KernelWorkerPort,
    private readonly onProgress: (progress: KernelTaskProgress | null) => void = () => {},
  ) {}

  request<K extends KernelOperation>(operation: K, params: PrimitiveParams, options: {signal?:AbortSignal} = {}): Promise<KernelTaskResults[K]> {
    return new Promise((resolve, reject) => {
      // Detach inputs now: later document edits cannot change a queued task.
      const request = { taskId: this.nextId++, operation, params: structuredClone(params) };
      if(options.signal?.aborted){reject(new KernelCancelledError(request.taskId));return;}
      const abort=()=>this.cancelTask(request.taskId),cleanup=()=>options.signal?.removeEventListener("abort",abort);
      this.tasks.push({ request, signal:options.signal,resolve: result=>{cleanup();resolve(result as KernelTaskResults[K]);}, reject:error=>{if(error instanceof KernelCancelledError)this.cancelledTasks++;cleanup();reject(error);} });
      options.signal?.addEventListener("abort",abort,{once:true});
      this.startNext();
      this.notify();
    });
  }

  private notify() {
    this.onProgress(this.progress ? { ...this.progress, pendingCount: this.tasks.length + (this.active ? 1 : 0) } : null);
  }

  private startNext() {
    if (this.active) return;
    let task = this.tasks.shift();
    while(task?.signal?.aborted){task.reject(new KernelCancelledError(task.request.taskId));task=this.tasks.shift();}
    if (!task) { this.progress = null; this.notify(); return; }
    this.active = task;
    this.progress = { taskId: task.request.taskId, operation: task.request.operation, phase: "queued", pendingCount: 1 };
    try {
      if (!this.worker) {
        const worker = this.createWorker();
        this.worker = worker;
        this.workersCreated++;this.memory={capacityBytes:null,retainedSources:0,retainedSlabs:0};
        worker.onmessage = ({ data }) => {
          // Replies from a terminated worker or an obsolete ID are ignored.
          if (this.worker !== worker || this.active?.request.taskId !== data.taskId) return;
          if (data.type === "progress") {
            this.progress = { ...this.progress!, phase: data.phase };
            this.notify();
            return;
          }
          const active = this.active;
          this.active = null;
          if (data.type === "error") active.reject(new Error(data.message));
          else {if(data.memory)this.memory=data.memory;active.resolve(data.result);}
          this.startNext();
        };
        worker.onerror = (event) => {
          if (this.worker !== worker) return;
          event.preventDefault();
          this.reset(new Error(event.message || "Geometry worker failed."));
        };
        worker.onmessageerror = () => {
          if (this.worker === worker) this.reset(new Error("Could not decode geometry worker response."));
        };
      }
      this.worker.postMessage(task.request);
    } catch (error) {
      this.reset(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Reject every waiter before releasing the WASM heap. A later request retries. */
  releaseIfIdle(): boolean {
    if (this.active || this.tasks.length || !this.worker) return false;
    this.reset(); return true;
  }

  reset(error = new Error("Geometry worker stopped.")) {
    const worker = this.worker;
    this.worker = null;
    this.memory={capacityBytes:0,retainedSources:0,retainedSlabs:0};
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
    const pending = this.active ? [this.active, ...this.tasks] : this.tasks;
    this.active = null;
    this.tasks = [];
    this.progress = null;
    for (const task of pending) task.reject(error);
    this.notify();
  }

  /**
   * Cancel one task. A queued task is dropped before it reaches the worker;
   * the active task is aborted by terminating the worker (OpenCascade calls
   * block and cannot be interrupted cooperatively) and the remaining queue
   * continues on a fresh worker. Returns false for unknown task IDs.
   */
  cancelTask(taskId: number): boolean {
    const queued = this.tasks.findIndex((task) => task.request.taskId === taskId);
    if (queued >= 0) {
      const [task] = this.tasks.splice(queued, 1);
      task.reject(new KernelCancelledError(taskId));
      this.notify();
      return true;
    }
    if (this.active?.request.taskId === taskId) {
      this.abortActive(taskId);
      this.startNext();
      return true;
    }
    return false;
  }

  /**
   * Cancel the active task and drop every queued task. The worker is
   * terminated only when an operation is actually in flight; a purely
   * queued backlog is dropped without losing the warm WASM heap.
   * Returns the number of cancelled tasks.
   */
  cancelAll(): number {
    let count = 0;
    if (this.active) {
      this.abortActive(this.active.request.taskId);
      count++;
    }
    for (const task of this.tasks) {
      task.reject(new KernelCancelledError(task.request.taskId));
      count++;
    }
    this.tasks = [];
    this.notify();
    return count;
  }

  private abortActive(taskId: number) {
    const worker = this.worker;
    this.worker = null;
    this.memory={capacityBytes:0,retainedSources:0,retainedSlabs:0};
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
    const active = this.active;
    this.active = null;
    this.progress = null;
    active?.reject(new KernelCancelledError(taskId));
  }
}
