import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { brepFaceKeyAtOrdinal, nearestBrepEdgeHit } from "../src/viewport/brepPicking";

const project = (point: [number, number, number]) => ({ x: point[0], y: point[1] });

describe("brep edge proximity picking", () => {
  const edges = [
    { objectId: "box", key: "edge:line:a", points: [[0, 0, 0], [10, 0, 0]] as [number, number, number][] },
    { objectId: "box", key: "edge:line:b", points: [[0, 5, 0], [10, 5, 0]] as [number, number, number][] },
  ];

  test("selects the nearest edge and interpolates the pick point", () => {
    const hit = nearestBrepEdgeHit(edges, project, { x: 5, y: 1 }, 12);
    assert.equal(hit?.key, "edge:line:a");
    assert.deepEqual(hit?.worldPoint, [5, 0, 0]);
    assert.equal(hit?.objectId, "box");
  });

  test("rejects cursors beyond the threshold", () => {
    assert.equal(nearestBrepEdgeHit(edges, project, { x: 5, y: 50 }, 12), null);
    assert.equal(nearestBrepEdgeHit([], project, { x: 5, y: 1 }, 12), null);
  });

  test("skips degenerate single-point edges", () => {
    const degenerate = [{ objectId: "box", key: "edge:point", points: [[5, 1, 0]] as [number, number, number][] }];
    assert.equal(nearestBrepEdgeHit(degenerate, project, { x: 5, y: 1 }, 12), null);
  });
});

describe("brep face ordinal mapping", () => {
  const ranges = [
    { key: "face:a", start: 0, count: 4 },
    { key: "face:b", start: 4, count: 2 },
  ];

  test("maps ordinals within ranges and rejects the rest", () => {
    assert.equal(brepFaceKeyAtOrdinal(ranges, 0), "face:a");
    assert.equal(brepFaceKeyAtOrdinal(ranges, 3), "face:a");
    assert.equal(brepFaceKeyAtOrdinal(ranges, 4), "face:b");
    assert.equal(brepFaceKeyAtOrdinal(ranges, 5), "face:b");
    assert.equal(brepFaceKeyAtOrdinal(ranges, 6), null);
    assert.equal(brepFaceKeyAtOrdinal(ranges, -1), null);
    assert.equal(brepFaceKeyAtOrdinal(ranges, 1.5), null);
    assert.equal(brepFaceKeyAtOrdinal(ranges, null), null);
    assert.equal(brepFaceKeyAtOrdinal(ranges, undefined), null);
    assert.equal(brepFaceKeyAtOrdinal([], 0), null);
  });
});
