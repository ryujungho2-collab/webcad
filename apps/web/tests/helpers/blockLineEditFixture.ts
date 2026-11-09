import type { CadCommand } from "@agent-webcad/cad-commands";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { resetTestDocument } from "./documentHarness";

export async function buildBlockLineEditFixture() {
  resetTestDocument();
  async function run(command: CadCommand) {
    const result = await dispatchCadCommand(command);
    if (!result.ok) throw Error(result.reason);
    return result;
  }
  await run({ type: "create-drawing", id: "source-line", drawing: "line",
    params: { workPlane: "XY", points: [[10, 10, 0], [30, 10, 0]] } });
  await run({ type: "define-block", id: "fixture-block", name: "Line fixture", objectIds: ["source-line"], base: [10, 10, 0] });
  await run({ type: "set-block-override", blockId: "fixture-block", objectId: "source-line",
    vectorStyle: { stroke: "#d1662c", strokeWidth: 1, opacity: 1, fill: null, fillGradient: null } });
  await run({ type: "insert-block", id: "linked-a", blockId: "fixture-block", position: [100, 0, 0] });
  await run({ type: "insert-block", id: "linked-b", blockId: "fixture-block", position: [200, 10, 0], angle: 90 });
  await run({ type: "insert-block", id: "to-disband", blockId: "fixture-block", position: [260, 0, 0] });
  const independent = await run({ type: "explode-block", objectId: "to-disband" });
  if (independent.createdIds.length !== 1) throw Error("Expected one independent line.");
  return independent.createdIds[0];
}
