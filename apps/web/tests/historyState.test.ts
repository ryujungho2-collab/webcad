import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { HistoryStack, type HistoryStateToken } from "@agent-webcad/cad-history";
import { serializeDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../src/state/documentPlans";
import { openDocumentFile } from "../src/state/documentFile";
import { resetTestDocument, documentState } from "./helpers/documentHarness";

describe("history state identity", () => {
  test("105 commits retain the last 100 predecessors and restore their identity both ways", () => {
    const history = new HistoryStack<number>(v => v), tokens = [history.getStateToken()];
    const selections = new WeakMap<HistoryStateToken, string>();
    for (let value = 0; value <= 105; value++) {
      if (value) { history.push(`edit ${value}`, value - 1); tokens.push(history.getStateToken()); }
      selections.set(history.getStateToken(), `selected ${value}`);
    }
    assert.equal(new Set(tokens).size, 106);
    assert.equal(history.getPastLabels().length, 100);
    for (let value = 105; value > 5; value--) {
      assert.deepEqual(history.undo(value), { label: `edit ${value}`, value: value - 1 });
      assert.equal(history.getStateToken(), tokens[value - 1]);
      assert.equal(selections.get(history.getStateToken()), `selected ${value - 1}`);
    }
    assert.equal(history.undo(5), null);
    assert.equal(history.getStateToken(), tokens[5]);
    for (let value = 5; value < 105; value++) {
      assert.deepEqual(history.redo(value), { label: `edit ${value + 1}`, value: value + 1 });
      assert.equal(history.getStateToken(), tokens[value + 1]);
    }
    assert.equal(history.redo(105), null);
    assert.equal(history.getStateToken(), tokens[105]);
  });

  test("a branch at the same depth and with equal values never adopts discarded state metadata", () => {
    const history = new HistoryStack<number>(v => v);
    history.push("first", 0); const first = history.getStateToken();
    history.push("old branch", 1); const discarded = history.getStateToken();
    const metadata = new WeakMap([[discarded, "old selection"]]);
    assert.equal(history.undo(2)?.value, 1); assert.equal(history.getStateToken(), first);
    history.push("new branch", 1); const branch = history.getStateToken();
    assert.notEqual(branch, discarded); assert.equal(metadata.get(branch), undefined);
    assert.equal(history.canRedo(), false);
    assert.equal(history.undo(2)?.value, 1); assert.equal(history.getStateToken(), first);
    assert.equal(history.redo(1)?.value, 2); assert.equal(history.getStateToken(), branch);
    assert.deepEqual(history.getPastLabels(), ["first", "new branch"]);
  });

  test("clearing a session does not reuse initial tokens, even for the same document", () => {
    const history = new HistoryStack<object>(structuredClone), initial = history.getStateToken();
    history.push("edit", { id: "same" }); const edited = history.getStateToken();
    history.clear(); const reopened = history.getStateToken();
    assert.notEqual(reopened, initial); assert.notEqual(reopened, edited);
    assert.equal(history.canUndo(), false); assert.equal(history.canRedo(), false);
    assert.equal(history.undo({ id: "same" }), null); assert.equal(history.getStateToken(), reopened);
    history.push("new edit", { id: "same" }); history.undo({ id: "same" });
    assert.equal(history.getStateToken(), reopened);
    assert.ok(Object.isFrozen(reopened));
  });

  test("state tokens preserve snapshot clone and ownership contracts without leaking into values", () => {
    let clones = 0;
    const history = new HistoryStack<{ value: number }>(value => { clones++; return { ...value }; }, 2);
    const source = { value: 0 }; history.push("edit", source); const after = history.getStateToken();
    source.value = 99; assert.equal(clones, 1);
    const previous = history.undo({ value: 1 })!;
    assert.deepEqual(previous, { label: "edit", value: { value: 0 } });
    previous.value.value = 77;
    assert.deepEqual(history.redo({ value: 0 }), { label: "edit", value: { value: 1 } });
    assert.equal(history.getStateToken(), after);
    const count = clones; history.pushSnapshot("owned", { value: 1 }); assert.equal(clones, count);
    assert.deepEqual(history.undo({ value: 2 }), { label: "owned", value: { value: 1 } });
  });
});

describe("document history identity integration", () => {
  const drawing = { type: "create-drawing", id: "line", drawing: "line", params: { points: [[0, 0, 0], [50, 0, 0]], workPlane: "XY" } } as const;
  const state = () => ({ document: structuredClone(cadDocument), token: cadHistory.getStateToken(), past: cadHistory.getPastLabels(), future: cadHistory.getFutureLabels() });
  const unchanged = (before: ReturnType<typeof state>) => {
    assert.deepEqual(cadDocument, before.document); assert.equal(cadHistory.getStateToken(), before.token);
    assert.deepEqual(cadHistory.getPastLabels(), before.past); assert.deepEqual(cadHistory.getFutureLabels(), before.future);
  };

  test("preview, rejection, no-op and stale Apply keep the document, token and both stacks intact", async () => {
    resetTestDocument(); assert.equal((await dispatchCadCommand(drawing)).ok, true);
    await dispatchCadCommand({ type: "rename-object", objectId: "line", name: "Edited" }); undoDocument();
    const before = state();
    const preview = await previewCadCommand({ type: "rename-object", objectId: "line", name: "Reviewed" });
    assert.equal(preview.result.ok, true); unchanged(before); discardCadPlan(preview.planId); unchanged(before);
    assert.equal((await dispatchCadCommand({ type: "delete-object", objectId: "missing" })).ok, false); unchanged(before);
    const noop = await dispatchCadCommand({ type: "rename-object", objectId: "line", name: cadDocument.objects.line.name });
    // The existing rename adapter rejects unchanged names; it must not consume history.
    assert.equal(noop.ok, false); assert.equal(noop.changed, false); unchanged(before);
    const stale = await previewCadCommand({ type: "rename-object", objectId: "line", name: "Stale" });
    redoDocument(); undoDocument(); const roundTrip = state();
    assert.equal(roundTrip.token, before.token);
    const rejected = await applyCadPlan(stale.planId);
    assert.equal(rejected.ok, false); assert.match(rejected.reason!, /document changed/i); unchanged(roundTrip); discardCadPlan(stale.planId);
  });

  test("reviewed batch publishes one state and idempotent Apply preserves its identity", async () => {
    resetTestDocument(); const initial = cadHistory.getStateToken(), before = documentState();
    const preview = await previewCadCommand({ type: "batch", label: "Draw pair", commands: [drawing, { ...drawing, id: "other" }] });
    assert.equal(preview.result.ok, true); assert.equal(cadHistory.getStateToken(), initial);
    assert.equal((await applyCadPlan(preview.planId)).ok, true);
    const committed = cadHistory.getStateToken(), after = documentState(); assert.notEqual(committed, initial);
    assert.equal(cadHistory.getPastLabels().length, 1); assert.equal(cadDocument.rootObjects.length, 2);
    const applied = state(); assert.equal((await applyCadPlan(preview.planId)).changed, false); unchanged(applied);
    assert.ok(undoDocument()); assert.equal(cadHistory.getStateToken(), initial); assert.deepEqual(documentState(), before);
    assert.ok(redoDocument()); assert.equal(cadHistory.getStateToken(), committed); assert.deepEqual(documentState(), after);
    discardCadPlan(preview.planId);
  });

  test("file open with the same document ID starts a fresh state without serializing UI identity", async () => {
    resetTestDocument(); await dispatchCadCommand(drawing);
    const saved = serializeDocument(cadDocument), expected = documentState(), previous = cadHistory.getStateToken();
    // File contents remain exactly the document format; session/UI tokens do not enter it.
    const file = JSON.parse(saved); assert.deepEqual(file.document, cadDocument);
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) } });
    try {
      await openDocumentFile(new File([saved], "same.webcad.json"));
      const reopened = cadHistory.getStateToken(); assert.notEqual(reopened, previous);
      assert.deepEqual(documentState(), expected); assert.equal(cadHistory.canUndo(), false); assert.equal(cadHistory.canRedo(), false);
      await dispatchCadCommand({ type: "rename-object", objectId: "line", name: "New session" });
      assert.ok(undoDocument()); assert.equal(cadHistory.getStateToken(), reopened); assert.deepEqual(documentState(), expected);
      const beforeFailure = state(); await assert.rejects(openDocumentFile(new File(["bad json"], "invalid.json"))); unchanged(beforeFailure);
    } finally { if (original) Object.defineProperty(globalThis, "localStorage", original); else Reflect.deleteProperty(globalThis, "localStorage"); }
  });
});
