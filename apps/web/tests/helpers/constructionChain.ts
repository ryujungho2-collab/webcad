import type { CadCommand } from "@agent-webcad/cad-commands";
import type { SketchWorkPlane } from "@agent-webcad/cad-document";
export async function createConstructionChain(apply: (command: CadCommand) => Promise<unknown>, workPlane: SketchWorkPlane = "XY", elevation = 0, offset = 0) {
  const p = (x: number, y: number): [number, number, number] => workPlane === "XY" ? [offset+x, offset+y, elevation] : workPlane === "XZ" ? [offset+x,elevation,offset+y] : [elevation,offset+x,offset+y];
  for (const [id, x] of [["A",0],["B",100]] as const) await apply({ type: "create-drawing", id, drawing: "point", params: { points: [p(x,0)], workPlane, construction: true } });
  await apply({ type: "create-drawing", id: "O", drawing: "circle", params: { center: p(50,0), radius: 80, workPlane, construction: true } });
  await apply({ type: "create-construction", id: "AB", name: "AB", workPlane, definition: { operation: "segment", firstId: "A", secondId: "B" } });
  await apply({ type: "create-construction", id: "M", name: "M", workPlane, definition: { operation: "midpoint", segmentId: "AB" } });
  await apply({ type: "create-construction", id: "L", name: "Bisector", workPlane, definition: { operation: "perpendicular-bisector", segmentId: "AB", midpointId: "M" } });
  for (const [id,branch] of [["P","positive"],["Q","negative"]] as const) await apply({ type: "create-construction", id, name: id, construction: false, workPlane, definition: { operation: "intersection", firstId: "L", secondId: "O", branch } });
}
