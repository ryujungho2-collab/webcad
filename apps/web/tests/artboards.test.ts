import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { deserializeDocument, serializeDocument } from "../../../packages/cad-document/src/serialization";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { applyCadPlan, discardCadPlan, previewCadCommand } from "../src/state/documentPlans";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { assertDocumentIdle } from "../src/state/documentCommandQueue";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { loadDocumentFromCache, newDocument, openDocumentFile, saveDocumentToCache } from "../src/state/documentFile";
import { DOCUMENT_CACHE_KEY } from "../src/state/documentRecovery";
import type { CadCommand } from "@agent-webcad/cad-commands";

const completeState = () => ({ document: JSON.stringify(cadDocument), past: cadHistory.getPastLabels(), future: cadHistory.getFutureLabels() });
const createBoard = (id = "board") => dispatchCadCommand({ type: "create-artboard", id, name: id, workPlane: "XY", origin: [0, 0], size: [100, 80] });
const boardById = (id: string) => cadDocument.artboards?.[id];

describe("artboard documents", () => {
  test("creates, edits, locks, and deletes an artboard through CAD commands", async () => {
    resetTestDocument();
    const created = await dispatchCadCommand({ type: "create-artboard", id: "board-a", name: "Sheet A", workPlane: "XY", origin: [10, 20], size: [420, 297] });
    assert.equal(created.ok, true);
    assert.deepEqual(cadDocument.artboards?.["board-a"].size, [420, 297]);
    assert.equal((await dispatchCadCommand({ type: "update-artboard", artboardId: "board-a", name: "Sheet A revised", origin: [5, 6], size: [500, 300], background: "#f0f0f0" })).ok, true);
    assert.equal(cadDocument.artboards?.["board-a"].name, "Sheet A revised");
    assert.equal((await dispatchCadCommand({ type: "update-artboard", artboardId: "board-a", locked: true })).ok, true);
    const beforeLockedEdit = documentState();
    assert.equal((await dispatchCadCommand({ type: "update-artboard", artboardId: "board-a", size: [1, 1] })).ok, false);
    assert.deepEqual(documentState(), beforeLockedEdit);
    assert.equal((await dispatchCadCommand({ type: "delete-artboard", artboardId: "board-a" })).ok, false);
    assert.equal((await dispatchCadCommand({ type: "update-artboard", artboardId: "board-a", locked: false })).ok, true);
    assert.equal((await dispatchCadCommand({ type: "delete-artboard", artboardId: "board-a" })).ok, true);
    assert.equal(cadDocument.artboards, undefined);
  });

  test("vector appearance is reviewed, saved with the path, and restored through undo and redo", async () => {
    resetTestDocument();
    assert.equal((await dispatchCadCommand({ type: "create-drawing", id: "vector", drawing: "rectangle", params: { workPlane: "XY", points: [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]] } })).ok, true);
    cadHistory.clear();
    const before = documentState();
    const style = { stroke: "#164f42", fill: "#d9f4ea", opacity: 0.65, strokeWidth: 1.2 };
    const review = await previewCadCommand({ type: "set-vector-style", objectId: "vector", style });
    assert.equal(review.result.ok, true);
    assert.deepEqual(documentState(), before);
    assert.equal(review.impact?.find(row => row.kind === "Geometry")?.modified, 1);
    assert.equal((await applyCadPlan(review.planId)).ok, true);
    assert.deepEqual(cadDocument.features["feature-vector"].params.vectorStyle, style);
    const saved = serializeDocument(cadDocument);
    assert.deepEqual(deserializeDocument(saved).features["feature-vector"].params.vectorStyle, style);
    const after = documentState();
    assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
    assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  });

  test("round-trips format v7 and restores artboards through undo/redo", async () => {
    resetTestDocument();
    await dispatchCadCommand({ type: "create-artboard", id: "board-b", name: "Presentation", workPlane: "XZ", origin: [-50, 10], size: [800, 600], background: "#112233" });
    const snapshot = documentState();
    const encoded = serializeDocument(cadDocument);
    assert.equal(JSON.parse(encoded).version, 7);
    assert.deepEqual(documentState(deserializeDocument(encoded)), snapshot);
    assert.ok(undoDocument());
    assert.equal(cadDocument.artboards, undefined);
    assert.ok(redoDocument());
    assert.deepEqual(documentState(), snapshot);
    assertDocumentIdle();
    cadHistory.clear();
  });

  test("reviewed artboard edits report impact and publish optional collection deletion atomically", async () => {
    resetTestDocument();
    await dispatchCadCommand({ type: "create-artboard", id: "board-review", name: "Review", workPlane: "XY", origin: [0, 0], size: [100, 100] });
    cadHistory.clear();
    const before = documentState();
    const review = await previewCadCommand({ type: "update-artboard", artboardId: "board-review", origin: [20, 30], size: [200, 150] });
    assert.equal(review.result.ok, true);
    assert.deepEqual(documentState(), before);
    assert.deepEqual(review.impact?.find(change => change.kind === "Artboards"), { kind: "Artboards", before: 1, after: 1, created: 0, modified: 1, deleted: 0 });
    assert.equal((await applyCadPlan(review.planId)).ok, true);
    assert.deepEqual(cadDocument.artboards?.["board-review"].origin, [20, 30]);
    assert.deepEqual(boardById("board-review")?.size, [200, 150]);

    const deleteReview = await previewCadCommand({ type: "delete-artboard", artboardId: "board-review" });
    assert.equal(deleteReview.result.ok, true);
    assert.deepEqual(deleteReview.impact?.find(change => change.kind === "Artboards"), { kind: "Artboards", before: 1, after: 0, created: 0, modified: 0, deleted: 1 });
    assert.deepEqual(boardById("board-review")?.size, [200, 150]);
    assert.equal((await applyCadPlan(deleteReview.planId)).ok, true);
    assert.equal(cadDocument.artboards, undefined);
    const afterDelete = documentState();
    assert.equal(JSON.parse(serializeDocument(cadDocument)).version, 1);
    assert.deepEqual(documentState(deserializeDocument(serializeDocument(cadDocument))), afterDelete);
    assert.ok(undoDocument());
    assert.deepEqual(boardById("board-review")?.size, [200, 150]);
    assert.equal(JSON.parse(serializeDocument(cadDocument)).version, 7);
    assert.ok(redoDocument());
    assert.deepEqual(documentState(), afterDelete);
    assert.equal(cadDocument.artboards, undefined);
    assert.equal(cadHistory.getPastLabels().length, 2);
  });

  test("creation impact and public preview data cannot change the reviewed proposal", async () => {
    resetTestDocument();
    const before = completeState();
    const review = await previewCadCommand({ type: "create-artboard", id: "created", name: "New board", workPlane: "YZ", origin: [-5, 10], size: [100, 200] });
    assert.deepEqual(completeState(), before);
    assert.deepEqual(review.impact?.find(row => row.kind === "Artboards"), { kind: "Artboards", before: 0, after: 1, created: 1, modified: 0, deleted: 0 });
    review.result.createdIds.length = 0;
    review.impact![0].after = 99;
    const result = await applyCadPlan(review.planId);
    assert.equal(result.ok, true);
    assert.deepEqual(result.createdIds, ["created"]);
    assert.deepEqual(cadDocument.artboards?.created.origin, [-5, 10]);
    const applied = completeState();
    const repeated = await applyCadPlan(review.planId);
    assert.equal(repeated.alreadyApplied, true);
    assert.equal(repeated.changed, false);
    assert.deepEqual(completeState(), applied);
    assert.equal(cadHistory.getPastLabels().length, 1);
  });

  test("unchanged, missing, duplicate and locked commands preserve revision and both history stacks", async () => {
    resetTestDocument();
    await createBoard();
    await createBoard("future");
    assert.ok(undoDocument());
    for (const command of [
      { type: "update-artboard", artboardId: "board", size: [100, 80] },
      { type: "update-artboard", artboardId: "missing", name: "Missing" },
      { type: "delete-artboard", artboardId: "missing" },
      { type: "create-artboard", id: "board", workPlane: "XY", origin: [0, 0], size: [100, 80] },
    ] satisfies CadCommand[]) {
      const before = completeState();
      const review = await previewCadCommand(command);
      assert.equal(review.result.ok, false);
      assert.deepEqual(review.impact, []);
      assert.equal((await applyCadPlan(review.planId)).changed, false);
      assert.deepEqual(completeState(), before);
    }
    await dispatchCadCommand({ type: "update-artboard", artboardId: "board", locked: true });
    for (const command of [
      { type: "update-artboard", artboardId: "board", origin: [1, 1] },
      { type: "update-artboard", artboardId: "board", size: [200, 100] },
      { type: "update-artboard", artboardId: "board", workPlane: "XZ" },
      { type: "delete-artboard", artboardId: "board" },
    ] satisfies CadCommand[]) {
      const before = completeState();
      const failed = await dispatchCadCommand(command);
      assert.equal(failed.ok, false);
      assert.match(failed.reason!, /locked.*Unlock/);
      assert.deepEqual(completeState(), before);
    }
    assertDocumentIdle();
  });

  test("cancelled and aborted reviews leave the complete document and redo history intact", async () => {
    resetTestDocument(); await createBoard(); await createBoard("future"); undoDocument();
    const before = completeState();
    const review = await previewCadCommand({ type: "delete-artboard", artboardId: "board" });
    discardCadPlan(review.planId);
    await assert.rejects(applyCadPlan(review.planId), /expired/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(previewCadCommand({ type: "delete-artboard", artboardId: "board" }, { signal: controller.signal }), /abort/i);
    assert.deepEqual(completeState(), before);
  });

  test("locking, Undo and document replacement invalidate old artboard plans", async () => {
    resetTestDocument(); await createBoard();
    const review = await previewCadCommand({ type: "delete-artboard", artboardId: "board" });
    await dispatchCadCommand({ type: "update-artboard", artboardId: "board", locked: true });
    let before = completeState();
    assert.match((await applyCadPlan(review.planId)).reason!, /document changed/);
    assert.deepEqual(completeState(), before);
    undoDocument(); before = completeState();
    assert.match((await applyCadPlan(review.planId)).reason!, /document changed/);
    assert.deepEqual(completeState(), before);
    newDocument(); before = completeState();
    assert.match((await applyCadPlan(review.planId)).reason!, /document changed/);
    assert.deepEqual(completeState(), before);
  });

  test("failed batches roll back optional artboards and successful batches publish one undo", async () => {
    resetTestDocument(); await createBoard();
    const failedBatches: Exclude<CadCommand, { type: "batch" }>[][] = [
      [{ type: "delete-artboard", artboardId: "board" }, { type: "update-artboard", artboardId: "missing", name: "Missing" }],
      [{ type: "create-artboard", id: "new", workPlane: "XY", origin: [0, 0], size: [10, 10] }, { type: "delete-artboard", artboardId: "missing" }],
      [{ type: "update-artboard", artboardId: "board", locked: true }, { type: "delete-artboard", artboardId: "board" }],
    ];
    for (const commands of failedBatches) {
      const before = completeState();
      const review = await previewCadCommand({ type: "batch", commands });
      assert.equal(review.result.ok, false);
      assert.deepEqual(review.impact, []);
      assert.equal((await applyCadPlan(review.planId)).ok, false);
      assert.deepEqual(completeState(), before);
      assert.equal((await dispatchCadCommand({ type: "batch", commands })).ok, false);
      assert.deepEqual(completeState(), before);
    }
    const before = documentState(), past = cadHistory.getPastLabels().length;
    const review = await previewCadCommand({ type: "batch", label: "Replace artboard", commands: [{ type: "delete-artboard", artboardId: "board" }, { type: "create-artboard", id: "replacement", workPlane: "XZ", origin: [20, 30], size: [200, 150] }] });
    assert.deepEqual(review.impact?.find(row => row.kind === "Artboards"), { kind: "Artboards", before: 1, after: 1, created: 1, modified: 0, deleted: 1 });
    assert.equal((await applyCadPlan(review.planId)).ok, true);
    const after = documentState();
    assert.equal(cadHistory.getPastLabels().length, past + 1);
    assert.ok(undoDocument()); assert.deepEqual(documentState(), before);
    assert.ok(redoDocument()); assert.deepEqual(documentState(), after);
  });

  test("recovery, file open and New restore or remove artboards without old optional state", async () => {
    const values = new Map<string, string>();
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
    try {
      resetTestDocument(); await createBoard();
      const withBoard = documentState(), saved = serializeDocument(cadDocument);
      saveDocumentToCache();
      assert.equal(JSON.parse(values.get(DOCUMENT_CACHE_KEY)!).version, 7);
      await dispatchCadCommand({ type: "delete-artboard", artboardId: "board" });
      assert.ok(loadDocumentFromCache()); assert.deepEqual(documentState(), withBoard);
      await dispatchCadCommand({ type: "delete-artboard", artboardId: "board" });
      saveDocumentToCache();
      const withoutBoard = documentState(), legacy = values.get(DOCUMENT_CACHE_KEY)!;
      assert.equal(JSON.parse(legacy).version, 1);
      await createBoard("unrelated");
      assert.ok(loadDocumentFromCache()); assert.deepEqual(documentState(), withoutBoard);
      await openDocumentFile(new File([saved], "board.webcad.json"));
      assert.deepEqual(documentState(), withBoard);
      await openDocumentFile(new File([legacy], "legacy.webcad.json"));
      assert.deepEqual(documentState(), withoutBoard);
      assert.equal(cadHistory.getPastLabels().length, 0);
      await createBoard(); newDocument();
      assert.equal(cadDocument.artboards, undefined);
      assert.equal(JSON.parse(serializeDocument(cadDocument)).version, 1);
      assert.equal(cadHistory.getPastLabels().length, 0);
    } finally { if (original) Object.defineProperty(globalThis, "localStorage", original); else Reflect.deleteProperty(globalThis, "localStorage"); }
  });

  test("invalid dimensions and incompatible file versions are rejected without mutation", async () => {
    resetTestDocument(); await createBoard();
    for (const size of [[0, 10], [-1, 10], [NaN, 10], [10, Infinity]]) {
      const before = completeState();
      await assert.rejects(dispatchCadCommand({ type: "update-artboard", artboardId: "board", size: size as [number, number] }), /Invalid CAD/);
      assert.deepEqual(completeState(), before);
    }
    const saved = JSON.parse(serializeDocument(cadDocument));
    saved.version = 6;
    assert.throws(() => deserializeDocument(JSON.stringify(saved)), /version 7/);
    saved.version = 7; saved.document.artboards.board.size = [0, 10];
    assert.throws(() => deserializeDocument(JSON.stringify(saved)), /artboard/);
  });
});
