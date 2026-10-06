import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inspectDocumentationLinks, inspectSourceTree, reviewModuleGraph } from "../scripts/checkArchitecture";

test("pure geometry rejects application and UI dependencies, including type-only imports", () => {
  const issues = reviewModuleGraph([
    { file: "src/precision/example.ts", dependencies: [{ module: "src/state/cadDocument.ts", typeOnly: true }] },
    { file: "src/features/drawing-editing/geometry/example.ts", dependencies: [{ module: "react", typeOnly: false }] },
    { file: "src/features/drawing-editing/commands/example.ts", dependencies: [{ module: "src/state/documentPlans.ts", typeOnly: false }] },
  ]);
  assert.deepEqual(issues.map(i => i.code), ["geometry-boundary", "geometry-boundary", "command-boundary"]);
});

test("geometry cycles are rejected while erased type relationships are allowed", () => {
  const modules = [
    { file: "src/precision/a.ts", dependencies: [{ module: "src/precision/b.ts", typeOnly: false }] },
    { file: "src/precision/b.ts", dependencies: [{ module: "src/precision/a.ts", typeOnly: false }] },
  ];
  assert.deepEqual(reviewModuleGraph(modules).map(i => i.code), ["geometry-cycle"]);
  modules[1].dependencies[0].typeOnly = true;
  assert.deepEqual(reviewModuleGraph(modules), []);
});

test("canvas contracts cannot pull runtime tools into a host", () => {
  assert.equal(reviewModuleGraph([{ file: "src/features/drawing-editing/contracts.ts", dependencies: [{ module: "src/features/drawing-editing/ui/CurveWorkbench.tsx", typeOnly: false }] }])[0].code, "runtime-contract");
  assert.deepEqual(reviewModuleGraph([{ file: "src/features/drawing-editing/contracts.ts", dependencies: [{ module: "three", typeOnly: true }] }]), []);
});

test("real source imports, module boundaries and documentation links remain valid", () => {
  const webRoot = fileURLToPath(new URL("..", import.meta.url)), workspace = fileURLToPath(new URL("../../..", import.meta.url));
  const result = inspectSourceTree(webRoot);
  assert.ok(result.modules.length > 100, "Inspect the source tree, not an empty fixture.");
  assert.deepEqual([...result.issues, ...inspectDocumentationLinks(workspace)], []);
});
