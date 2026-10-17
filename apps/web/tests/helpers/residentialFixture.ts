/** Residential master-plan source (millimetres, declared via $INSUNITS 4).
 *  Korean layer names drive the WF-Q1 round-trip: wall centerlines, door/window
 *  reference symbols, furniture outline, one clean slab footprint with a
 *  courtyard hole, a broken terrace ring for bounded gap repair and a far
 *  cleanup group with intentional duplicate/T-junction diagnostics. */
export type ResidentialRefs = {
  wallS: string; wallE: string; wallN: string; wallW: string; wallI: string;
  windowSymbol: string; doorSymbol: string;
  furniture: string; slabRect: string; slabHole: string; terrace: string;
  dup1: string; dup2: string; gapA: string; gapB: string; junction1: string; junction2: string;
};
export const RESIDENTIAL_TAG = "resq1";
const pair = (code: number, value: string | number): [string, string] => [String(code), String(value)];
const entity = (type: string, ...values: string[]): string => [0, type, ...values].join("\n");
const line = (layer: string, a: [number, number], b: [number, number]): string =>
  entity("LINE", ...pair(8, layer), ...pair(10, a[0]), ...pair(20, a[1]), ...pair(11, b[0]), ...pair(21, b[1]));
const circle = (layer: string, center: [number, number], radius: number): string =>
  entity("CIRCLE", ...pair(8, layer), ...pair(10, center[0]), ...pair(20, center[1]), ...pair(40, radius));
const text = (layer: string, value: string, point: [number, number], height: number): string =>
  entity("TEXT", ...pair(8, layer), ...pair(1, value), ...pair(40, height), ...pair(10, point[0]), ...pair(20, point[1]));
const insert = (layer: string, block: string, position: [number, number]): string =>
  entity("INSERT", ...pair(8, layer), ...pair(2, block), ...pair(10, position[0]), ...pair(20, position[1]));
const polyline = (layer: string, points: [number, number][], flags: number): string =>
  entity("LWPOLYLINE", ...pair(8, layer), ...pair(90, points.length), ...pair(70, flags),
    ...points.flatMap(point => [...pair(10, point[0]), ...pair(20, point[1])]));
const layer = (name: string, extra: string[] = []): string =>
  entity("LAYER", ...pair(2, name), ...extra);
const block = (name: string, members: string[]): string =>
  [entity("BLOCK", ...pair(2, name), ...pair(10, 0), ...pair(20, 0), ...pair(30, 0)), ...members, entity("ENDBLK")].join("\n");
export const residentialDxf = [
  entity("SECTION", ...pair(2, "HEADER"), ...pair(9, "$INSUNITS"), ...pair(70, 4)),
  entity("ENDSEC"),
  entity("SECTION", ...pair(2, "TABLES"),
    layer("A-벽체", pair(62, 7)),
    layer("B-내벽", pair(62, 7)),
    layer("C-문창기준", ...pair(62, 3), ...pair(6, "DASHED")),
    layer("D-가구", pair(62, 8)),
    layer("E-바닥", pair(62, 8)),
    layer("F-주석", pair(62, 7)),
    layer("G-진단경계", pair(62, 1))),
  entity("ENDSEC"),
  entity("SECTION", ...pair(2, "BLOCKS"),
    block("기준-심벌", [
      line("C-개구심벌", [0, 0], [400, 0]),
      text("C-개구심벌", "심벌", [100, 60], 80),
    ].join("\n")),
    block("기준-문", [
      insert("C-개구심벌", "기준-심벌", [0, 100]),
      line("C-문창기준", [0, 160], [400, 160]),
    ].join("\n")),
    block("기준-창", [
      insert("C-개구심벌", "기준-심벌", [0, 0]),
      line("C-문창기준", [0, 120], [750, 120]),
    ].join("\n")),
    block("가구-미지정", line("D-가구", [0, 0], [200, 0]))),
  entity("ENDSEC"),
  entity("SECTION", ...pair(2, "ENTITIES"),
    line("A-벽체", [0, 0], [6000, 0]),
    line("A-벽체", [6000, 0], [6000, 4000]),
    line("A-벽체", [6000, 4000], [0, 4000]),
    line("A-벽체", [0, 4000], [0, 0]),
    line("B-내벽", [3000, 0], [3000, 4000]),
    insert("C-문창기준", "기준-창", [1500, 0]),
    insert("C-문창기준", "기준-문", [3000, 1500]),
    polyline("D-가구", [[400, 400], [1300, 400], [1300, 1000], [400, 1000]], 1),
    polyline("E-바닥", [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], 1),
    circle("E-바닥", [4500, 3000], 500),
    polyline("E-바닥", [[6000, 4000], [8000, 4000], [8000, 5000], [6000.05, 4000]], 0),
    text("F-주석", " WF-Q1 주거 과제", [2000, 2000], 200),
    text("F-주석", "주방", [800, 1100], 150),
    line("G-진단경계", [80000, 80000], [81000, 80000]),
    line("G-진단경계", [80000, 80000], [81000, 80000]),
    line("G-진단경계", [80000, 82000], [80600, 82000]),
    line("G-진단경계", [80600.1, 82000], [81200, 82000]),
    line("G-진단경계", [80000, 84000], [81400, 84000]),
    line("G-진단경계", [80900, 84000], [80900, 88000])),
  entity("ENDSEC"),
  entity("EOF"),
].join("\n") + "\n";
/** Prepared import order: excluded annotation layers shift entity indices. */
export const residentialRefs = (tag = RESIDENTIAL_TAG): ResidentialRefs => ({
  wallS: `dxf-${tag}-entity-0`, wallE: `dxf-${tag}-entity-1`, wallN: `dxf-${tag}-entity-2`,
  wallW: `dxf-${tag}-entity-3`, wallI: `dxf-${tag}-entity-4`,
  windowSymbol: `dxf-${tag}-5`, doorSymbol: `dxf-${tag}-6`,
  furniture: `dxf-${tag}-entity-7`, slabRect: `dxf-${tag}-entity-8`,
  slabHole: `dxf-${tag}-entity-9`, terrace: `dxf-${tag}-entity-10`,
  dup1: `dxf-${tag}-entity-11`, dup2: `dxf-${tag}-entity-12`,
  gapA: `dxf-${tag}-entity-13`, gapB: `dxf-${tag}-entity-14`,
  junction1: `dxf-${tag}-entity-15`, junction2: `dxf-${tag}-entity-16`,
});
