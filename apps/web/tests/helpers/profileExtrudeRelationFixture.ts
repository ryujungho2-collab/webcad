import { serializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../../src/state/cadDocument";
import { dispatchCadCommand } from "../../src/state/dispatchCadCommand";
import { resetTestDocument } from "./documentHarness";

export async function buildProfileExtrudeRelationFixture(sketchOwned = false) {
  resetTestDocument();
  async function run(command: CadCommand) {
    const result = await dispatchCadCommand(command);
    if (!result.ok) throw Error(result.reason);
  }
  if (sketchOwned) {
    await run({ type: "create-sketch", id: "owner", workPlane: "XY" });
    await run({ type: "add-sketch-geometry", sketchId: "owner", geometry: {
      id: "profile", kind: "rectangle", origin: [0, 0], width: 40, height: 24,
      cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"],
    } });
  } else {
    await run({ type: "create-drawing", id: "profile", drawing: "rectangle", params: {
      workPlane: "XY", points: [[0, 0, 0], [40, 0, 0], [40, 24, 0], [0, 24, 0]],
    } });
  }
  const beforeExtrude = serializeDocument(cadDocument);
  await run({ type: "create-extrude", id: "solid", profileObjectIds: ["profile"], distance: 15 });
  return beforeExtrude;
}
