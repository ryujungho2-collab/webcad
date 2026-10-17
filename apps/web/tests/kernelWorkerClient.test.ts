import assert from "node:assert/strict";
import { test } from "node:test";
import { KernelWorkerClient, type KernelWorkerPort } from "../src/cad/kernelWorkerClient";
import { isKernelCancelled, KernelCancelledError, meshTransferList, type KernelRequest, type KernelResponse, type KernelTaskProgress, type MeshData } from "../src/cad/kernelProtocol";

class FakeWorker implements KernelWorkerPort {
  onmessage: KernelWorkerPort["onmessage"] = null;
  onerror: KernelWorkerPort["onerror"] = null;
  onmessageerror: KernelWorkerPort["onmessageerror"] = null;
  requests: KernelRequest[] = [];
  terminated = false;
  postMessage(message: KernelRequest) { this.requests.push(message); }
  terminate() { this.terminated = true; }
  emit(data: KernelResponse) { this.onmessage?.({ data } as MessageEvent<KernelResponse>); }
}
function mesh(): MeshData {
  return { positions: new Float64Array([0, 0, 0, 1.0000000001, 0, 0]), normals: new Float32Array([0, 0, 1]), indices: new Uint32Array([0, 1, 0]) };
}

test("worker RPC serializes requests, snapshots queued input, and ignores stale replies", async () => {
  const worker = new FakeWorker();
  const events: (KernelTaskProgress | null)[] = [];
  const client = new KernelWorkerClient(() => worker, (event) => events.push(event));
  const first = client.request("primitive", { kind: "box" });
  const params = { kind: "sphere", radius: 3 };
  const second = client.request("primitive", params);
  params.radius = 99;
  assert.equal(worker.requests.length, 1);
  const firstId = worker.requests[0].taskId;
  worker.emit({ type: "result", taskId: firstId + 100, result: mesh() });
  assert.equal(worker.requests.length, 1);
  worker.emit({ type: "progress", taskId: firstId, phase: "meshing" });
  assert.equal(events.at(-1)?.pendingCount, 2);
  assert.equal(events.at(-1)?.phase, "meshing");
  worker.emit({ type: "result", taskId: firstId, result: mesh() });
  await first;
  assert.equal(worker.requests.length, 2);
  assert.equal(worker.requests[1].params.radius, 3);
  worker.emit({ type: "result", taskId: worker.requests[1].taskId, result: mesh() });
  await second;
  assert.equal(events.at(-1), null);
});

test("operation rejection does not poison the queue", async () => {
  const worker = new FakeWorker();
  const client = new KernelWorkerClient(() => worker);
  const first = assert.rejects(client.request("solid", {}), /Invalid solid/);
  const second = client.request("primitive", {});
  worker.emit({ type: "error", taskId: worker.requests[0].taskId, message: "Invalid solid" });
  await first;
  worker.emit({ type: "result", taskId: worker.requests[1].taskId, result: mesh() });
  assert.ok((await second).positions.length);
  assert.equal(worker.terminated, false);
});

test("worker crash rejects all waiters and a later request starts a fresh worker", async () => {
  const workers: FakeWorker[] = [];
  const client = new KernelWorkerClient(() => { const worker = new FakeWorker(); workers.push(worker); return worker; });
  const first = assert.rejects(client.request("solid", {}), /crashed/);
  const second = assert.rejects(client.request("topology", {}), /crashed/);
  const obsoleteHandler = workers[0].onmessage!;
  workers[0].onerror?.({ message: "crashed", preventDefault() {} } as ErrorEvent);
  await Promise.all([first, second]);
  assert.equal(workers[0].terminated, true);
  const next = client.request("primitive", {});
  obsoleteHandler({ data: { type: "result", taskId: workers[1].requests[0].taskId, result: mesh() } } as MessageEvent<KernelResponse>);
  assert.equal(workers[1].requests.length, 1);
  workers[1].emit({ type: "result", taskId: workers[1].requests[0].taskId, result: mesh() });
  await next;
});

test("decode failures and synchronous post failures reject instead of hanging", async () => {
  const worker = new FakeWorker();
  const client = new KernelWorkerClient(() => worker);
  const failed = assert.rejects(client.request("primitive", {}), /decode/);
  worker.onmessageerror?.({} as MessageEvent);
  await failed;
  const brokenClient = new KernelWorkerClient(() => { throw new Error("Worker unavailable"); });
  await assert.rejects(brokenClient.request("primitive", {}), /unavailable/);
  const badPort = new FakeWorker();
  badPort.postMessage = () => { throw new Error("post failed"); };
  await assert.rejects(new KernelWorkerClient(() => badPort).request("primitive", {}), /post failed/);
});

test("mesh transfer detaches task-owned buffers while retaining double precision", () => {
  const original = mesh();
  const received = structuredClone(original, { transfer: meshTransferList(original) });
  assert.equal(original.positions.byteLength, 0);
  assert.equal(received.positions[3], 1.0000000001);
  assert.ok(received.indices instanceof Uint32Array);
  assert.deepEqual(meshTransferList({ faces: [], edges: [] }), []);
});

test("cancelTask drops a queued task without losing the warm worker", async () => {
  const worker = new FakeWorker();
  const client = new KernelWorkerClient(() => worker);
  const first = client.request("primitive", { kind: "box" });
  const queuedId = worker.requests[0].taskId + 1;
  const second = assert.rejects(client.request("primitive", { kind: "sphere" }), /cancelled/);
  assert.equal(client.cancelTask(queuedId), true);
  await second;
  // The active task still runs on the warm worker; nothing was terminated.
  assert.equal(worker.terminated, false);
  assert.equal(worker.requests.length, 1);
  worker.emit({ type: "result", taskId: worker.requests[0].taskId, result: mesh() });
  await first;
});

test("cancelTask aborts the active task and continues the queue on a fresh worker", async () => {
  const workers: FakeWorker[] = [];
  const events: (KernelTaskProgress | null)[] = [];
  const client = new KernelWorkerClient(() => { const worker = new FakeWorker(); workers.push(worker); return worker; }, (event) => events.push(event));
  const first = assert.rejects(client.request("solid", {}), /cancelled/);
  const second = client.request("primitive", {});
  const activeId = workers[0].requests[0].taskId;
  assert.equal(client.cancelTask(activeId), true);
  await first;
  assert.equal(workers[0].terminated, true);
  // The queued task continues automatically on a fresh worker.
  assert.equal(workers.length, 2);
  assert.equal(workers[1].requests.length, 1);
  workers[1].emit({ type: "result", taskId: workers[1].requests[0].taskId, result: mesh() });
  await second;
  assert.equal(events.at(-1), null);
});

test("cancelTask returns false for unknown task IDs", async () => {
  const worker = new FakeWorker();
  const client = new KernelWorkerClient(() => worker);
  const pending = client.request("primitive", {});
  assert.equal(client.cancelTask(9999), false);
  assert.equal(client.cancelTask(worker.requests[0].taskId + 100), false);
  worker.emit({ type: "result", taskId: worker.requests[0].taskId, result: mesh() });
  await pending;
});

test("cancelAll rejects everything and a later request recovers", async () => {
  const workers: FakeWorker[] = [];
  const client = new KernelWorkerClient(() => { const worker = new FakeWorker(); workers.push(worker); return worker; });
  const first = assert.rejects(client.request("solid", {}), /cancelled/);
  const second = assert.rejects(client.request("primitive", {}), /cancelled/);
  assert.equal(client.cancelAll(), 2);
  await Promise.all([first, second]);
  assert.equal(workers[0].terminated, true);
  assert.equal(client.cancelAll(), 0);
  const next = client.request("primitive", {});
  workers[1].emit({ type: "result", taskId: workers[1].requests[0].taskId, result: mesh() });
  await next;
});

test("cancelAll on an idle client cancels nothing and spawns no worker", () => {
  let created = 0;
  const client = new KernelWorkerClient(() => { created++; return new FakeWorker(); });
  assert.equal(client.cancelAll(), 0);
  assert.equal(created, 0);
  assert.equal(client.cancelTask(1), false);
});

test("cancellation is distinguishable from kernel failures", () => {
  assert.equal(isKernelCancelled(new KernelCancelledError(7)), true);
  assert.equal(isKernelCancelled(new Error("Kernel task cancelled. (task 7)")), true);
  assert.equal(isKernelCancelled(new Error("Invalid solid")), false);
  assert.equal(isKernelCancelled(null), false);
});

test("idle release retains active and queued operations and restarts with fresh task IDs", async()=>{
 const workers:FakeWorker[]=[];const client=new KernelWorkerClient(()=>{const w=new FakeWorker();workers.push(w);return w;});
 const a=client.request('primitive',{}),b=client.request('primitive',{});assert.equal(client.releaseIfIdle(),false);
 workers[0].emit({type:'result',taskId:workers[0].requests[0].taskId,result:mesh()});await a;assert.equal(client.releaseIfIdle(),false);
 const oldId=workers[0].requests[1].taskId;workers[0].emit({type:'result',taskId:oldId,result:mesh()});await b;
 assert.equal(client.releaseIfIdle(),true);assert.equal(workers[0].terminated,true);assert.equal(client.releaseIfIdle(),false);
 const c=client.request('primitive',{});assert.equal(workers.length,2);assert.ok(workers[1].requests[0].taskId>oldId);
 workers[1].emit({type:'result',taskId:workers[1].requests[0].taskId,result:mesh()});await c;
});

test('aborting a view cannot cancel an active document task; queued view is dropped',async()=>{
 const worker=new FakeWorker(),client=new KernelWorkerClient(()=>worker),scope=new AbortController();
 const doc=client.request('primitive',{}),view=client.request('primitive',{}, {signal:scope.signal});const rejected=assert.rejects(view,KernelCancelledError);scope.abort();await rejected;assert.equal(worker.terminated,false);
 worker.emit({type:'result',taskId:worker.requests[0].taskId,result:mesh()});await doc;assert.equal(worker.requests.length,1);
});
test('aborting an active view restarts the queued document task; stale worker results are ignored',async()=>{
 const workers:FakeWorker[]=[],client=new KernelWorkerClient(()=>{const w=new FakeWorker();workers.push(w);return w;}),scope=new AbortController();
 const view=client.request('primitive',{}, {signal:scope.signal}),doc=client.request('primitive',{}),rejected=assert.rejects(view,KernelCancelledError);scope.abort();await rejected;assert.equal(workers[0].terminated,true);assert.equal(workers.length,2);
 workers[0].emit({type:'result',taskId:1,result:mesh()});workers[1].emit({type:'result',taskId:workers[1].requests[0].taskId,result:mesh()});await doc;
});

test('one scope abort drops the full queued view burst without spawning throwaway Workers',async()=>{
 const workers:FakeWorker[]=[],client=new KernelWorkerClient(()=>{const w=new FakeWorker();workers.push(w);return w;}),scope=new AbortController();
 const views=Array.from({length:8},()=>assert.rejects(client.request('primitive',{}, {signal:scope.signal}),KernelCancelledError));
 const doc=client.request('primitive',{});scope.abort();await Promise.all(views);assert.equal(workers.length,2);
 workers[1].emit({type:'result',taskId:workers[1].requests[0].taskId,result:mesh()});await doc;
});
