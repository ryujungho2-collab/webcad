/** WF-Q1 expansion fixture (millimetres, $INSUNITS 4). Korean layers for
 *  outer/inner walls, opening symbol blocks with one nested block level,
 *  furniture, slab footprint with courtyard hole, plus DIMENSION and HATCH
 *  annotation layers, Windows-styled annotation text and an upstream
 *  diagnostics group with duplicate pair, 0.1 mm and 1 mm gaps, interior
 *  T junction, mixed Z elevation pair and a detached far-coordinate square.
 *  The wrong-unit variant declares metres for the explicit unit check. */
export type ExtendedRefs = {
  wallS: string; wallE: string; wallN: string; wallW: string; wallI: string;
  windowSymbol: string; doorSymbol: string;
  furniture: string; slabRect: string; slabHole: string; annotation: string;
  dupA: string; dupB: string;
  gap01A: string; gap01B: string; gap01CapW: string; gap01CapN: string; gap01CapE: string;
  gap1A: string; gap1B: string; gap1CapW: string; gap1CapN: string; gap1CapE: string;
  junctionMain: string; junctionBranch: string;
  zTop: string; zBottom: string; ambiguous: string;
  farN: string; farE: string; farS: string; farW: string;
};
export const EXTENDED_TAG = "resqx";
const pair = (code: number, value: string | number): [string, string] => [String(code), String(value)];
const entity = (type: string, ...values: string[]): string => [0, type, ...values].join("\n");
const line = (layer: string, a: [number, number], b: [number, number], z = 0): string =>
  entity("LINE", ...pair(8, layer), ...(z ? [...pair(30, z), ...pair(31, z)] : []), ...pair(10, a[0]), ...pair(20, a[1]), ...pair(11, b[0]), ...pair(21, b[1]));
const circle = (layer: string, center: [number, number], radius: number): string =>
  entity("CIRCLE", ...pair(8, layer), ...pair(10, center[0]), ...pair(20, center[1]), ...pair(40, radius));
const text = (layer: string, value: string, point: [number, number], height: number): string =>
  entity("TEXT", ...pair(8, layer), ...pair(1, value), ...pair(40, height), ...pair(10, point[0]), ...pair(20, point[1]));
const insert = (layer: string, block: string, position: [number, number]): string =>
  entity("INSERT", ...pair(8, layer), ...pair(2, block), ...pair(10, position[0]), ...pair(20, position[1]));
const polyline = (layer: string, points: [number, number][], flags: number): string =>
  entity("LWPOLYLINE", ...pair(8, layer), ...pair(90, points.length), ...pair(70, flags),
    ...points.flatMap(point => [...pair(10, point[0]), ...pair(20, point[1])]));
const layer = (name: string, extra: string[] = []): string => entity("LAYER", ...pair(2, name), ...extra);
const block = (name: string, members: string[]): string =>
  [entity("BLOCK", ...pair(2, name), ...pair(10, 0), ...pair(20, 0), ...pair(30, 0)), ...members, entity("ENDBLK")].join("\n");
/** DIMENSION/HATCH are deliberately outside the supported entity subset; the parser must skip each with a counted warning. */
const dimension = (layer: string): string => entity("DIMENSION", ...pair(8, layer), ...pair(1, "6000"), ...pair(10, 0), ...pair(20, 3600), ...pair(11, 3000), ...pair(21, 400), ...pair(13, 0), ...pair(23, 3500), ...pair(14, 6000), ...pair(24, 3500));
const hatch = (layer: string): string => entity("HATCH", ...pair(8, layer), ...pair(2, "SOLID"), ...pair(70, 1), ...pair(91, 1), ...pair(92, 1), ...pair(72, 3), ...pair(73, 1), ...pair(97, 0), ...pair(10, 0), ...pair(20, 0), ...pair(75, 0));
const header = (units: number): string => entity("SECTION", ...pair(2, "HEADER"), ...pair(9, "$INSUNITS"), ...pair(70, units));
const entities = (extra: string[]): string => [
  line("A-외곽벽", [0, 0], [6000, 0]),
  line("A-외곽벽", [6000, 0], [6000, 4000]),
  line("A-외곽벽", [6000, 4000], [0, 4000]),
  line("A-외곽벽", [0, 4000], [0, 0]),
  line("B-내벽", [3000, 0], [3000, 4000]),
  insert("C-문창기준", "기준-창", [1500, 0]),
  insert("C-문창기준", "기준-문", [3000, 1500]),
  polyline("D-가구", [[400, 400], [1300, 400], [1300, 1000], [400, 1000]], 1),
  polyline("E-바닥", [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], 1),
  circle("E-바닥", [4500, 3000], 500),
  dimension("F-치수"),
  hatch("G-해치"),
  text("H-주석", " WF-Q1 확장 진단 과제", [2000, 2200], 200),
  text("H-주석", "서재", [800, 1100], 150),
  line("J-진단경계", [20000, 0], [21000, 0]),
  line("J-진단경계", [20000, 0], [21000, 0]),
  line("J-진단경계", [20000, 1000], [20600, 1000]),
  line("J-진단경계", [20600.1, 1000], [21200, 1000]),
  line("J-진단경계", [20000, 1000], [20000, 1300]),
  line("J-진단경계", [20000, 1300], [21200, 1300]),
  line("J-진단경계", [21200, 1000], [21200, 1300]),
  line("J-진단경계", [20000, 2000], [20600, 2000]),
  line("J-진단경계", [20601, 2000], [21200, 2000]),
  line("J-진단경계", [20000, 2000], [20000, 2300]),
  line("J-진단경계", [20000, 2300], [21200, 2300]),
  line("J-진단경계", [21200, 2000], [21200, 2300]),
  line("J-진단경계", [20000, 3000], [21200, 3000]),
  line("J-진단경계", [20600, 2200], [20600, 3000]),
  line("J-진단경계", [20000, 3200], [21200, 3200], 50),
  line("J-진단경계", [20000, 3600], [21200, 3600], 0),
  line("J-진단경계", [20600.05, 1005], [21200, 1005]),
  line("K-원격테두리", [1000000, 1000000], [1001000, 1000000]),
  line("K-원격테두리", [1001000, 1000000], [1001000, 1001000]),
  line("K-원격테두리", [1001000, 1001000], [1000000, 1001000]),
  line("K-원격테두리", [1000000, 1001000], [1000000, 1000000]),
  ...extra,
].join("\n");
export const residentialExtendedDxf = (units = 4, extra: string[] = []): string => [
  header(units),
  entity("ENDSEC"),
  entity("SECTION", ...pair(2, "TABLES"),
    layer("A-외곽벽", pair(62, 7)),
    layer("B-내벽", pair(62, 7)),
    layer("C-문창기준", [...pair(62, 3), ...pair(6, "DASHED")]),
    layer("C-개구심벌", pair(62, 3)),
    layer("D-가구", pair(62, 8)),
    layer("E-바닥", pair(62, 8)),
    layer("F-치수", pair(62, 6)),
    layer("G-해치", pair(62, 5)),
    layer("H-주석", pair(62, 7)),
    layer("J-진단경계", pair(62, 1)),
    layer("K-원격테두리", pair(62, 2))),
  entity("ENDSEC"),
  entity("SECTION", ...pair(2, "BLOCKS"),
    block("기준-심벌", [
      line("C-개구심벌", [0, 0], [400, 0]),
      text("C-개구심벌", "심벌", [100, 60], 80),
    ]),
    block("기준-창", [
      insert("C-개구심벌", "기준-심벌", [0, 0]),
      line("C-문창기준", [0, 120], [750, 120]),
    ]),
    block("기준-문", [
      insert("C-개구심벌", "기준-심벌", [0, 100]),
      line("C-문창기준", [0, 160], [400, 160]),
    ])),
  entity("ENDSEC"),
  entity("SECTION", ...pair(2, "ENTITIES"), entities(extra)),
  entity("ENDSEC"),
  entity("EOF"),
].join("\n") + "\n";
/** Prepared entity indices: import numbering follows the role/text-filtered subset
 *  order (annotation texts and skipped DIMENSION/HATCH entities are excluded first). */
export const extendedRefs = (tag = EXTENDED_TAG): ExtendedRefs => ({
  wallS: `dxf-${tag}-entity-0`, wallE: `dxf-${tag}-entity-1`, wallN: `dxf-${tag}-entity-2`, wallW: `dxf-${tag}-entity-3`, wallI: `dxf-${tag}-entity-4`,
  windowSymbol: `dxf-${tag}-5`, doorSymbol: `dxf-${tag}-6`,
  furniture: `dxf-${tag}-entity-7`, slabRect: `dxf-${tag}-entity-8`, slabHole: `dxf-${tag}-entity-9`,
  dupA: `dxf-${tag}-entity-10`, dupB: `dxf-${tag}-entity-11`,
  gap01A: `dxf-${tag}-entity-12`, gap01B: `dxf-${tag}-entity-13`,
  gap01CapW: `dxf-${tag}-entity-14`, gap01CapN: `dxf-${tag}-entity-15`, gap01CapE: `dxf-${tag}-entity-16`,
  gap1A: `dxf-${tag}-entity-17`, gap1B: `dxf-${tag}-entity-18`,
  gap1CapW: `dxf-${tag}-entity-19`, gap1CapN: `dxf-${tag}-entity-20`, gap1CapE: `dxf-${tag}-entity-21`,
  junctionMain: `dxf-${tag}-entity-22`, junctionBranch: `dxf-${tag}-entity-23`,
  zTop: `dxf-${tag}-entity-24`, zBottom: `dxf-${tag}-entity-25`, ambiguous: `dxf-${tag}-entity-26`,
  farN: `dxf-${tag}-entity-27`, farE: `dxf-${tag}-entity-28`, farS: `dxf-${tag}-entity-29`, farW: `dxf-${tag}-entity-30`,
});
export const EXTENDED_ROLES = {
  "A-외곽벽": "wall", "B-내벽": "wall", "C-문창기준": "opening",
  "C-개구심벌": "exclude", "D-가구": "reference", "E-바닥": "reference",
  "F-치수": "exclude", "G-해치": "exclude", "H-주석": "exclude",
  "J-진단경계": "reference", "K-원격테두리": "reference",
} as const;
/** Root layers excluded from import roles, listed to keep dependency layers available through blocks. */
export const extendedIncludedLayers = (parsedLayers: readonly string[]): string[] =>
  parsedLayers.filter(name => name !== "C-개구심벌");
