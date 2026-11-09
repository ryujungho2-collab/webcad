import type { CadCommand } from "@agent-webcad/cad-commands";
import type { LinearDimensionPresetStyle } from "@agent-webcad/cad-document";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { resetTestDocument } from "./documentHarness";

export const fixtureStyle: LinearDimensionPresetStyle = { lengthUnit: "cm", precision: 3, textHeight: 6, arrowSize: 5 };
export const fixturePresetName = "Shop drawing";

export async function buildDimensionStyleFixture() {
  resetTestDocument();
  async function execute(command: CadCommand) {
    const result = await dispatchCadCommand(command);
    if (!result.ok) throw Error(result.reason);
  }
  await execute({ type: "create-layer", id: "second-layer", name: "Second dimension" });
  for (const [id, y, length] of [["source", 0, 20], ["a", 24, 30.125], ["b", 48, 42]] as const) {
    const lineId = `line-${id}`;
    await execute({ type: "create-drawing", id: lineId, drawing: "line", params: {
      workPlane: "XY", points: [[0, y, 0], [length, y, 0]],
    } });
    await execute({ type: "create-dimension", dimension: "linear", id, layerId: id === "b" ? "second-layer" : "layer-default",
      params: { workPlane: "XY", points: [[0, y], [length, y]], orientation: "aligned", offset: 8, sourceObjectId: lineId,
        style: id === "source" ? { ...fixtureStyle, textGap: 7 } : { textGap: 2.25 },
      },
    });
  }
}
