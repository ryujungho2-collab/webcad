import { CAD_RECIPES, compileRecipe, parseRecipe, type RecipeRequest } from "./cadRecipes";
import type { CopilotPlan } from "./copilotPlan";

export type PlanningQuestion = { id: string; prompt: string; options: string[] };
export type PlanningClarification = { summary: string; questions: PlanningQuestion[]; recipe?: RecipeRequest };
export class CopilotClarificationRequired extends Error {
  constructor(public readonly clarification: PlanningClarification) { super(clarification.summary); this.name = "CopilotClarificationRequired"; }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Questions are a terminal planning result, never a partial executable proposal. */
export function parsePlanningClarification(value: unknown): PlanningClarification {
  if (!record(value) || Object.keys(value).some(k => !["summary", "questions"].includes(k)) || typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 500 || !Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > 3) throw Error("Clarification needs a short summary and 1–3 questions.");
  const questions: PlanningQuestion[] = value.questions.map(q => {
    if (!record(q) || Object.keys(q).some(k => !["id", "prompt", "options"].includes(k)) || typeof q.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(q.id) || typeof q.prompt !== "string" || !q.prompt.trim() || q.prompt.length > 500 || !Array.isArray(q.options) || q.options.length > 3 || q.options.some(s => typeof s !== "string" || !s.trim() || s.length > 200)) throw Error("Invalid clarification question or options.");
    return { id: q.id, prompt: q.prompt, options: [...q.options] as string[] };
  });
  if (new Set(questions.map(q => q.id)).size !== questions.length) throw Error("Clarification question IDs must be unique.");
  return { summary: value.summary, questions };
}
export function prepareRecipe(value: unknown): CopilotPlan {
  const recipe = parseRecipe(value, true), fields = CAD_RECIPES[recipe.id].fields;
  const missing = Object.entries(fields).filter(([key]) => !Object.hasOwn(recipe.parameters, key));
  if (missing.length) throw new CopilotClarificationRequired({ summary: `${CAD_RECIPES[recipe.id].label}: 필요한 치수와 패턴을 확인합니다.`, recipe,
    questions: missing.slice(0, 3).map(([id, field]) => ({ id, prompt: `${field.label} (${field.unit}, ${field.minimum}–${field.maximum})`, options: [] })) });
  return compileRecipe(recipe);
}
/** Gateway response union: reads/modeling (handled by the caller), a recipe, OR questions. */
export function planningResponse(value: unknown): CopilotPlan | undefined {
  if (!record(value) || !Object.hasOwn(value, "recipe") && !Object.hasOwn(value, "clarification")) return;
  if (value.version !== 1 || Object.keys(value).some(k => !["version", "recipe", "clarification"].includes(k)) || Object.hasOwn(value, "recipe") === Object.hasOwn(value, "clarification")) throw Error("Return exactly one recipe or clarification, without executable calls or commands.");
  if (Object.hasOwn(value, "clarification")) throw new CopilotClarificationRequired(parsePlanningClarification(value.clarification));
  return prepareRecipe(value.recipe);
}
/** A bounded answer resumes with validated numeric slots, or explicit user Q/A for a model. */
export function answerPlanningQuestions(original: string, clarification: PlanningClarification, answers: Record<string, string>): string {
  if (clarification.questions.some(q => !answers[q.id]?.trim() || answers[q.id].length > 500)) throw Error("모든 질문에 1–500자로 답해주세요.");
  if (clarification.recipe) {
    const recipe = parseRecipe(clarification.recipe, true);
    for (const q of clarification.questions) {
      const field = Object.entries(CAD_RECIPES[recipe.id].fields).find(([key]) => key === q.id)?.[1];
      const match = /^([+]?(?:\d+(?:\.\d*)?|\.\d+))\s*(mm|cm|m)?$/i.exec(answers[q.id].trim());
      if (!field || !match || field.unit === "count" && match[2]) throw Error(`${q.prompt}: 숫자와 지원 단위(mm/cm/m)를 입력해주세요.`);
      recipe.parameters[q.id] = Number(match[1]) * (match[2]?.toLowerCase() === "cm" ? 10 : match[2]?.toLowerCase() === "m" ? 1000 : 1);
    }
    const checked = parseRecipe(recipe, true), definition = CAD_RECIPES[checked.id];
    return `템플릿 · ${definition.label} ${Object.entries(definition.fields).filter(([key]) => Object.hasOwn(checked.parameters, key)).map(([key, field]) => `${field.label} ${checked.parameters[key]}${field.unit === "mm" ? "mm" : ""}`).join(" ")}`;
  }
  const next = `${original}\n사용자 추가 답변:\n${clarification.questions.map(q => `${q.prompt}: ${answers[q.id].trim()}`).join("\n")}`;
  if (next.length > 4000) throw Error("요청과 답변은 총 4000자 이하여야 합니다.");
  return next;
}
/** Local grammar only recognizes complete named fields; unsupported modifiers never disappear. */
export function planRecipePrompt(input: string): CopilotPlan | undefined {
  if (input.trim().startsWith("{")) { let parsed: unknown; try { parsed = JSON.parse(input); } catch { return; } return planningResponse(parsed); }
  const text = input.trim().replace(/^템플릿 · /, "");
  const match = /^(원통\s*핀|핀|pin|4홀\s*플레이트|통풍\s*덮개|vented\s+lid)(?=\s|$)/i.exec(text);
  if (!match) return;
  const id = /^(원통\s*핀|핀|pin)$/i.test(match[1]) ? "pin" : /^4홀/.test(match[1]) ? "mounting-plate" : "vented-lid", parameters: Record<string, number> = {};
  let rest = text.slice(match[0].length).toLowerCase();
  const fields = CAD_RECIPES[id].fields;
  const aliases: Record<string, string> = { "구멍 지름": "holeDiameter", "중심 여백": "margin", "여백": "margin", "가로": "width", "세로": "depth", "두께": "thickness", "지름": "diameter", "길이": "length", "행": "rows", "열": "columns" };
  rest = rest.replace(/(구멍\s+지름|중심\s+여백|여백|가로|세로|두께|지름|길이|행|열)\s*([+]?(?:\d+(?:\.\d*)?|\.\d+))\s*(mm|cm|m)?/g, (_all, label: string, number: string, unit?: string) => {
    const key = aliases[label.replace(/\s+/g, " ")];
    if (!Object.hasOwn(fields, key) || Object.hasOwn(parameters, key) || ["rows", "columns"].includes(key) && unit) throw Error("지원하지 않는 필드·중복 치수·개수 단위입니다.");
    parameters[key] = Number(number) * (unit === "cm" ? 10 : unit === "m" ? 1000 : 1); return " ";
  });
  if (rest.replace(/만들어줘|생성|create|[,\s.!]/g, "")) throw Error("템플릿이 지원하지 않는 조건이 있습니다. 핀: 지름·길이. 통풍 덮개: 가로·세로·두께·중심 여백·구멍 지름·행·열. 추가 형상은 별도 도구로 검토해주세요.");
  return prepareRecipe({ id, parameters });
}
