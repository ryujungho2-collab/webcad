import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, restoreDocument, undoDocument } from "../src/state/history";
import { assertDocumentIdle, enqueueDocumentCommand, isDocumentCommandPending } from "../src/state/documentCommandQueue";

test("queued commands use separate Undo snapshots and guard document replacement while waiting", async () => {
  const before = structuredClone(cadDocument);
  cadHistory.clear();
  let release!: () => void;
  const blocker = enqueueDocumentCommand(() => new Promise<void>((resolve) => { release = resolve; }));
  await Promise.resolve();
  const first = dispatchCadCommand({ type: "create-box", id: "queued-a", width: 2, depth: 3, height: 4 });
  const second = dispatchCadCommand({ type: "create-box", id: "queued-b", width: 5, depth: 6, height: 7 });
  assert.equal(isDocumentCommandPending(), true);
  assert.equal(undoDocument(), false);
  assert.throws(() => restoreDocument(before), /still running/);
  assert.throws(() => assertDocumentIdle(), /still running/);
  assert.equal(cadDocument.objects["queued-a"], undefined);
  release();
  await blocker;
  assert.ok((await first).ok);
  assert.ok((await second).ok);
  assert.equal(isDocumentCommandPending(), false);
  assert.ok(undoDocument());
  assert.ok(cadDocument.objects["queued-a"]);
  assert.equal(cadDocument.objects["queued-b"], undefined);
  assert.ok(undoDocument());
  assert.deepEqual(cadDocument.objects, before.objects);
});

test("a failed task releases the document queue", async () => {
  const failed = enqueueDocumentCommand(async () => { throw new Error("test failure"); });
  const next = enqueueDocumentCommand(async () => 42);
  await assert.rejects(failed, /test failure/);
  assert.equal(await next, 42);
  assert.equal(isDocumentCommandPending(), false);
});
