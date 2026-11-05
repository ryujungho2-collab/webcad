import assert from "node:assert/strict";
import { test } from "node:test";
import { FIT_MARGINS, FIT_PADDING, getFitMargin, setFitMargin, subscribeFitMargin } from "../src/state/fitMargin";

test("fit margin defaults to roomy, notifies listeners, and orders padding from roomy to tight", () => {
  assert.equal(getFitMargin(), "roomy");
  assert.deepEqual(FIT_MARGINS.map(m => m.id), ["roomy", "balanced", "tight"]);
  let calls = 0; const stop = subscribeFitMargin(() => calls++);
  setFitMargin("tight"); setFitMargin("tight");
  assert.equal(getFitMargin(), "tight"); assert.equal(calls, 1);
  setFitMargin("roomy"); stop(); setFitMargin("balanced");
  assert.equal(calls, 2); setFitMargin("roomy");
  for (const side of ["x", "top", "bottom"] as const) assert.ok(FIT_PADDING.roomy[side] > FIT_PADDING.balanced[side] && FIT_PADDING.balanced[side] > FIT_PADDING.tight[side]);
});
