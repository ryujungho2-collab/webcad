import type { CadCommand } from "@agent-webcad/cad-commands";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { resetTestDocument } from "./documentHarness";

export async function buildDrawOrderFixture() {
  resetTestDocument();
  async function apply(command: CadCommand) {
    const result = await dispatchCadCommand(command);
    if (!result.ok) throw Error(result.reason);
  }
  await apply({ type: "create-layer", id: "hatch-layer", name: "Hatches" });
  await apply({ type: "set-layer-style", layerId: "hatch-layer", style: { color: "#00bb00", lineType: "continuous", lineWeight: 0.8 } });
  for (const [id, x, color] of [["red", 0, "#dd2222"], ["blue", 20, "#2222dd"]] as const) {
    await apply({
      type: "create-drawing", id, drawing: "rectangle",
      params: { workPlane: "XY", points: [[x, 0, 0], [x + 80, 0, 0], [x + 80, 40, 0], [x, 40, 0]] },
    });
    await apply({ type: "set-vector-style", objectId: id, style: { stroke: color, fill: color }, merge: true });
  }
  await apply({ type: "create-drafting", id: "hatch", layerId: "hatch-layer", params: {
    kind: "hatch", workPlane: "XY", sourceObjectIds: ["red"], spacing: 5, angle: 0,
  } });
}
