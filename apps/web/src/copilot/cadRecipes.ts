import type { CadCommand } from "@agent-webcad/cad-commands";
import type { CopilotPlan } from "./copilotPlan";
import { mountingPlatePlan } from "./mountingPlate";

const length = (label: string) => ({ label, type: "number" as const, minimum: 0.01, maximum: 10000, unit: "mm" });
const count = (label: string) => ({ label, type: "integer" as const, minimum: 1, maximum: 16, unit: "count" });
export const CAD_RECIPES = {
  "mounting-plate": { label: "4홀 플레이트", description: "Rectangular plate with exactly four circular through holes; margin is hole-center distance from adjacent edges.", fields: { width: length("가로"), depth: length("세로"), thickness: length("두께"), margin: length("중심 여백"), holeDiameter: length("구멍 지름") } },
  "pin": { label: "원통 핀", description: "Plain solid cylindrical pin without head, threads, taper or chamfer; base center at origin, axis +Z.", fields: { diameter: length("지름"), length: length("길이") } },
  "vented-lid": { label: "통풍 덮개", description: "Flat rectangular lid with an evenly spaced rectangular grid of circular through vents, at most 64 holes. No rim, lip, slots or fasteners. Margin is outermost hole-center distance from each edge; a single row/column is centered.", fields: { width: length("가로"), depth: length("세로"), thickness: length("두께"), margin: length("중심 여백"), holeDiameter: length("구멍 지름"), rows: count("행"), columns: count("열") } },
} as const;
export type RecipeId = keyof typeof CAD_RECIPES;
export type RecipeRequest = { id: RecipeId; parameters: Record<string, number> };
export function recipeCatalog() {
  return Object.entries(CAD_RECIPES).map(([id, recipe]) => ({ id, version: 1, label: recipe.label, description: recipe.description,
    placement: "World XY at origin, extrusion along +Z. Independent new object; never attaches to a selected face.",
    inputSchema: { type: "object", additionalProperties: false, required: Object.keys(recipe.fields), properties: Object.fromEntries(Object.entries(recipe.fields).map(([key, field]) => [key, { type: field.type, minimum: field.minimum, maximum: field.maximum, description: `${field.label} (${field.unit})` }])) } }));
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Validate before allocating IDs or building commands. Missing fields may only enter the question path. */
export function parseRecipe(value: unknown, partial = false): RecipeRequest {
  if (!record(value) || Object.keys(value).some(k => !["id", "parameters"].includes(k)) || typeof value.id !== "string" || !Object.hasOwn(CAD_RECIPES, value.id) || !record(value.parameters)) throw Error("Use a registered CAD recipe ID and numeric parameters only.");
  const id = value.id as RecipeId, fields = CAD_RECIPES[id].fields;
  for (const [key, v] of Object.entries(value.parameters)) {
    const field = Object.entries(fields).find(([name]) => name === key)?.[1];
    if (!field || typeof v !== "number" || !Number.isFinite(v) || v < field.minimum || v > field.maximum || field.type === "integer" && !Number.isInteger(v)) throw Error(`Invalid recipe parameter '${key}'. Use the advertised range and units.`);
  }
  if (!partial && Object.keys(fields).some(key => !Object.hasOwn(value.parameters!, key))) throw Error("Recipe is missing required dimensions or pattern counts. Ask before creating geometry.");
  return { id, parameters: { ...value.parameters } as Record<string, number> };
}
export function compileRecipe(value: unknown): CopilotPlan {
  const request = parseRecipe(value), p = request.parameters;
  let plan: CopilotPlan;
  if (request.id === "mounting-plate") plan = mountingPlatePlan({ width: p.width, depth: p.depth, thickness: p.thickness, margin: p.margin, holeDiameter: p.holeDiameter });
  else if (request.id === "pin") {
    const id = `pin_${crypto.randomUUID()}`;
    plan = { command: { type: "create-primitive", id, primitive: "cylinder", params: { radius: p.diameter / 2, height: p.length } }, ghosts: [], resultObjectIds: [id], summary: [`원통 핀 Ø${p.diameter} × ${p.length} mm. 머리·나사산 없음.`] };
  } else plan = ventedLid(p);
  return { ...plan, recipe: request, summary: [
    `템플릿 v1 · ${CAD_RECIPES[request.id].label}`,
    ...Object.entries(p).map(([key, value]) => `${key}: ${value}${key === "rows" || key === "columns" ? "" : " mm"}`),
    "배치 기본값: 월드 XY 원점, +Z 방향. 선택한 면에 부착하지 않는 새 부품입니다.", ...plan.summary,
  ], toolSteps: ["의도: 등록된 부품 템플릿", "파라미터: 필수값·단위·범위 확인", "제약: 구멍 간격·경계 검사", "연산: 기본 CAD 명령으로 확장", "다음 단계: 실제 커널 미리보기 → 검토 → Apply"] };
}
/** Independent analytic oracle for the newly created recipe result, after native preview. */
export function verifyRecipeMeasurement(recipe: RecipeRequest, measurement?: { volume?: number; validity?: string }): string {
  const { id, parameters: p } = parseRecipe(recipe);
  const expected = id === "pin" ? Math.PI * (p.diameter / 2) ** 2 * p.length :
    (p.width * p.depth - (id === "mounting-plate" ? 4 : p.rows * p.columns) * Math.PI * (p.holeDiameter / 2) ** 2) * p.thickness;
  if (!measurement || measurement.validity !== "valid" || !Number.isFinite(measurement.volume) || Math.abs(measurement.volume! - expected) > Math.max(.01, expected * 1e-7)) throw Error("Recipe verification failed: native solid volume does not match the requested hole pattern/dimensions. Apply is blocked.");
  return `템플릿 체적 검증 통과: ${measurement.volume!.toFixed(4)} mm³ (독립 계산식 대조).`;
}
function ventedLid(p: Record<string, number>): CopilotPlan {
  const { width, depth, thickness, margin, holeDiameter, rows, columns } = p;
  if (rows * columns > 64 || holeDiameter >= 2 * margin || 2 * margin >= Math.min(width, depth) ||
      columns > 1 && (width - 2 * margin) / (columns - 1) <= holeDiameter || rows > 1 && (depth - 2 * margin) / (rows - 1) <= holeDiameter)
    throw Error("Vent holes must stay inside the lid without touching. Adjust diameter, center margin or row/column counts (maximum 64 holes).");
  const prefix = `vent_${crypto.randomUUID().replaceAll("-", "")}`, sketchId = `${prefix}_sketch`, outline = `${prefix}_outline`, solid = `${prefix}_solid`;
  const commands: Exclude<CadCommand, { type: "batch" }>[] = [
    { type: "create-sketch", id: sketchId, workPlane: "XY" },
    { type: "add-sketch-geometry", sketchId, geometry: { id: outline, kind: "rectangle", origin: [0, 0], width, height: depth, cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"] }, constraints: [
      { id: "origin", kind: "fixed-point", point: { geometryId: outline, pointId: "a" }, value: [0, 0] },
      { id: "width", kind: "distance", first: { geometryId: outline, pointId: "a" }, second: { geometryId: outline, pointId: "b" }, value: width },
      { id: "depth", kind: "distance", first: { geometryId: outline, pointId: "b" }, second: { geometryId: outline, pointId: "c" }, value: depth },
    ] },
  ];
  const variable = (key: string) => `${prefix}_${key}`;
  const bind = (constraintId: string, expression: string, component?: "x" | "y") => commands.push({ type: "set-parameter-binding", target: { kind: "sketch-constraint", sketchId, constraintId, ...component ? { component } : {} }, expression });
  for (const key of ["width", "depth", "thickness", "margin", "holeDiameter"]) commands.push({ type: "set-variable", name: variable(key), quantity: "length", expression: `${p[key]}mm` });
  bind("width", variable("width")); bind("depth", variable("depth"));
  const holes: string[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const i = holes.length, id = `${prefix}_hole${i}`;
    holes.push(id);
    const center: [number, number] = [columns === 1 ? width / 2 : margin + column * (width - 2 * margin) / (columns - 1), rows === 1 ? depth / 2 : margin + row * (depth - 2 * margin) / (rows - 1)];
    commands.push({ type: "add-sketch-geometry", sketchId, geometry: { id, kind: "circle", center, radius: holeDiameter / 2, centerId: "center", curveId: "curve" }, constraints: [
      { id: `center${i}`, kind: "fixed-point", point: { geometryId: id, pointId: "center" }, value: center },
      { id: `diameter${i}`, kind: "diameter", geometryId: id, value: holeDiameter },
    ] });
    const axisExpression = (key: string, n: number, index: number) => n === 1 ? `${variable(key)} / 2` : `${variable("margin")} + ${index} * (${variable(key)} - 2 * ${variable("margin")}) / ${n - 1}`;
    bind(`center${i}`, axisExpression("width", columns, column), "x"); bind(`center${i}`, axisExpression("depth", rows, row), "y"); bind(`diameter${i}`, variable("holeDiameter"));
  }
  commands.push({ type: "create-extrude", id: solid, profileObjectIds: [outline, ...holes], distance: thickness }, { type: "set-parameter-binding", target: { kind: "feature", objectId: solid, parameter: "distance" }, expression: variable("thickness") });
  return { command: { type: "batch", label: "Copilot: vented lid", commands }, ghosts: [], resultObjectIds: [solid], summary: [`원형 관통 통풍구 ${rows}행 × ${columns}열. 중심 여백 ${margin} mm; 한 행/열이면 해당 축 중앙 배치. 테두리 턱·체결부 없음.`] };
}
