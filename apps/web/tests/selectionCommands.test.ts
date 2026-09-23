import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import * as THREE from "three";
import { planAlignment, planBulkTransformEdit, planDistribution, planGroupTransform } from "../src/state/selectionCommands";
import { repeatDuplicateOffset } from "../src/state/duplicateWorkflow";

function documentWithBoxes(positions: number[]): CadDocument {
  const objects = Object.fromEntries(positions.map((x, index) => {
    const id = `box-${index}`;
    return [id, {
      id,
      geometryId: `geometry-${id}`,
      name: id,
      visible: true,
      layerId: "layer-default",
      transform: { translation: [x, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] },
    }];
  }));
  const features = Object.fromEntries(positions.map((_, index) => {
    const id = `box-${index}`;
    return [`feature-${id}`, { id: `feature-${id}`, type: "primitive" as const, inputs: [], output: id, params: { kind: "box", width: 10, depth: 10, height: 10 } }];
  }));
  return {
    id: "document",
    revision: 0,
    objects,
    features,
    layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: Object.keys(objects) } },
    rootObjects: Object.keys(objects),
    rootLayers: ["layer-default"],
  };
}

describe("selection command planning", () => {
  test("repeats edited spacing only for the complete copied set", () => {
    const document = documentWithBoxes([0, 20, 1200, 1220]);
    const series = { sourceIds: ["box-0", "box-1"], copyIds: ["box-2", "box-3"] };
    assert.deepEqual(repeatDuplicateOffset(document, series, ["box-2", "box-3"]), [1200, 0, 0]);
    assert.deepEqual(repeatDuplicateOffset(document, series, ["box-3", "box-2"]), [1200, 0, 0]);
    assert.equal(repeatDuplicateOffset(document, series, ["box-2"]), null);
    document.objects["box-3"].transform!.translation[0] = 1230;
    assert.equal(repeatDuplicateOffset(document, series, ["box-2", "box-3"]), null);
  });
  test("plans group movement as a shared world delta", () => {
    const document = documentWithBoxes([0, 20]);
    const commands = planGroupTransform(document, ["box-0", "box-1"], "translate", {
      translation: [25, 5, 5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
    const normalized = commands?.map((command) => command.type === "move-object"
      ? { ...command, translation: command.translation.map((value) => Math.round(value * 1e9) / 1e9) }
      : command);
    assert.deepEqual(normalized, [
      { type: "move-object", objectId: "box-0", translation: [10, 0, 0] },
      { type: "move-object", objectId: "box-1", translation: [30, 0, 0] },
    ]);
  });

  test("composes world group rotation with each member's existing orientation", () => {
    const document = documentWithBoxes([0, 20]);
    document.objects["box-0"].transform!.rotation = [45, 0, 0];
    const commands = planGroupTransform(document, ["box-0", "box-1"], "rotate", {
      translation: [15, 5, 5], rotation: [0, 0, 90], scale: [1, 1, 1],
    });
    const firstRotation = commands?.find((command) => command.type === "rotate-object" && command.objectId === "box-0");
    assert.ok(firstRotation && firstRotation.type === "rotate-object");
    const actual = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      ...firstRotation.rotation.map(THREE.MathUtils.degToRad) as [number, number, number],
    ));
    const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4));
    assert.ok(actual.angleTo(expected) < 1e-7);
  });

  test("rotates positions and object rotations around the group pivot", () => {
    const document = documentWithBoxes([0, 20]);
    const commands = planGroupTransform(document, ["box-0", "box-1"], "rotate", {
      translation: [15, 5, 5],
      rotation: [0, 0, 90],
      scale: [1, 1, 1],
    });
    const normalized = commands?.map((command) => command.type === "move-object"
      ? { ...command, translation: command.translation.map((value) => Math.round(value * 1e9) / 1e9) }
      : command.type === "rotate-object"
        ? { ...command, rotation: command.rotation.map((value) => Math.round(value * 1e9) / 1e9) }
        : command);
    assert.deepEqual(normalized, [
      { type: "move-object", objectId: "box-0", translation: [20, -10, 0] },
      { type: "rotate-object", objectId: "box-0", rotation: [0, 0, 90] },
      { type: "move-object", objectId: "box-1", translation: [20, 10, 0] },
      { type: "rotate-object", objectId: "box-1", rotation: [0, 0, 90] },
    ]);
  });

  test("aligns with world bounds and distributes deterministically", () => {
    const document = documentWithBoxes([0, 20, 70]);
    assert.deepEqual(planAlignment(document, ["box-0", "box-1"], "left", "XY"), [
      { type: "move-object", objectId: "box-1", translation: [0, 0, 0] },
    ]);
    assert.deepEqual(planDistribution(document, ["box-2", "box-0", "box-1"], "horizontal", "XY"), [
      { type: "move-object", objectId: "box-1", translation: [35, 0, 0] },
    ]);
  });

  test("rejects the whole operation when one selected layer is locked", () => {
    const document = documentWithBoxes([0, 20]);
    document.layers["layer-default"].locked = true;
    assert.equal(planAlignment(document, ["box-0", "box-1"], "left", "XY"), null);
    assert.equal(planGroupTransform(document, ["box-0", "box-1"], "translate", {
      translation: [20, 5, 5], rotation: [0, 0, 0], scale: [1, 1, 1],
    }), null);
  });

  test("plans mixed Inspector edits as absolute per-object properties", () => {
    const document = documentWithBoxes([0, 20]);
    document.objects["box-0"].transform!.translation[1] = 5;
    document.objects["box-1"].transform!.translation[1] = 15;
    assert.deepEqual(planBulkTransformEdit(document, ["box-0", "box-1"], "translate", [1200, null, 2700]), [
      { type: "move-object", objectId: "box-0", translation: [1200, 5, 2700] },
      { type: "move-object", objectId: "box-1", translation: [1200, 15, 2700] },
    ]);
    assert.equal(planBulkTransformEdit(document, ["box-0", "box-1"], "scale", [0, null, null]), null);
  });

  test("uses a drawing's actual transform pivot for mixed 2D/3D group rotation", () => {
    const document = documentWithBoxes([0]);
    document.objects.line = {
      id: "line",
      geometryId: "geometry-line",
      name: "Line",
      visible: true,
      layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    document.features["feature-line"] = {
      id: "feature-line",
      type: "drawing",
      inputs: [],
      output: "line",
      params: { kind: "line", workPlane: "XY", points: [[100, 0, 0], [110, 0, 0]] },
    };
    document.layers["layer-default"].objectIds.push("line");
    document.rootObjects.push("line");

    const commands = planGroupTransform(document, ["box-0", "line"], "rotate", {
      translation: [55, 5, 5], rotation: [0, 0, 180], scale: [1, 1, 1],
    });
    const lineMove = commands?.find((command) => command.type === "move-object" && command.objectId === "line");
    assert.ok(lineMove && lineMove.type === "move-object");
    assert.deepEqual(lineMove.translation.map((value) => Math.round(value * 1e9) / 1e9), [-100, 10, 0]);

    assert.deepEqual(planBulkTransformEdit(document, ["line"], "translate", [200, null, null]), [
      { type: "move-object", objectId: "line", translation: [95, 0, 0] },
    ]);
  });

  test("distributes unequal object bounds with equal edge gaps", () => {
    const document = documentWithBoxes([0, 30, 100]);
    document.features["feature-box-1"].params.width = 20;
    document.features["feature-box-2"].params.width = 30;
    assert.deepEqual(planDistribution(document, ["box-2", "box-0", "box-1"], "horizontal", "XY"), [
      { type: "move-object", objectId: "box-1", translation: [45, 0, 0] },
    ]);
  });
});
