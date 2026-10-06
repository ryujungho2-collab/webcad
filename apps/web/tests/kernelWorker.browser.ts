import { KernelWorkerClient } from "../src/cad/kernelWorkerClient";
import { meshPositionsBounds, buildPrimitiveMesh } from "../src/cad/kernelGeometryService";
import type { KernelTaskProgress } from "../src/cad/kernelProtocol";

const button = document.querySelector<HTMLButtonElement>("#run")!;
const output = document.querySelector<HTMLElement>("#result")!;
button.onclick = async () => {
  button.disabled = true;
  const events: KernelTaskProgress[] = [];
  const client = new KernelWorkerClient(() => new Worker(new URL("../src/cad/kernel.worker.ts", import.meta.url), { type: "module" }), (event) => {
    if (event) { events.push(event); output.textContent = `Task ${event.taskId}: ${event.phase} (${event.pendingCount} pending)`; }
  });
  let ticks = 0;
  const timer = window.setInterval(() => ticks++, 10);
  const lines: string[] = [];
  function check(value: unknown, label: string) {
    if (!value) throw new Error(label);
    lines.push(`PASS: ${label}`);
  }
  try {
    const params = { kind: "box", width: 10.0000000001, depth: 20, height: 30 };
    const boxPromise = client.request("primitive", params);
    const topologyPromise = client.request("topology", params);
    const [box, topology] = await Promise.all([boxPromise, topologyPromise]);
    check(box.positions instanceof Float64Array && box.indices instanceof Uint32Array, "Worker returns transferred typed mesh buffers");
    const bounds = meshPositionsBounds(box.positions);
    check(bounds && Math.abs(bounds.max[0] - 10.0000000001) < 1e-10, "Double-precision geometry is retained");
    check(topology.faces.length === 6 && topology.edges.length === 12, "Worker topology contains 6 faces and 12 edges");
    check(ticks > 0, `Main-thread timer kept running during cold kernel work (${ticks} ticks)`);
    check(events.some((event) => event.pendingCount === 2) && events.some((event) => event.phase === "meshing"), "Task IDs, queue count and phase progress are delivered");
    const cached = await buildPrimitiveMesh(params);
    check(await buildPrimitiveMesh(params) === cached && cached.positions.byteLength > 0, "Service cache retains usable buffers after repeated requests");
    let rejected = false;
    try { await client.request("solid", { kind: "fillet", radius: -1 }); } catch { rejected = true; }
    check(rejected, "Invalid operation rejects without hanging");
    check((await client.request("primitive", { kind: "sphere", radius: 4 })).indices.length > 0, "Worker remains usable after a rejected operation");
    output.textContent = lines.join("\n");
  } catch (error) { output.textContent = [...lines, `FAIL: ${String(error)}`].join("\n"); }
  finally { clearInterval(timer); client.reset(); button.disabled = false; }
};
