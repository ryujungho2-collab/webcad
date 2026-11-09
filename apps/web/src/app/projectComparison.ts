import type { Workspace } from "./projectWorkspaceStore";

export const COMPARISON_KEY = "agent-webcad-project-comparison-v1";
export type ProjectComparison = { version: 1; pair: [string, string] | null; ratio: number };
export const singleProjectLayout = (): ProjectComparison => ({ version: 1, pair: null, ratio: .5 });
export function comparisonRatio(ratio: number, width = 0) {
  const minimum = width >= 648 ? Math.max(.25, 324 / width) : .25;
  return Math.min(1 - minimum, Math.max(minimum, Number.isFinite(ratio) ? ratio : .5));
}
export function readProjectComparison(storage: Pick<Storage, "getItem">): ProjectComparison {
  try {
    const value = JSON.parse(storage.getItem(COMPARISON_KEY) ?? "null");
    if (!value || value.version !== 1 || !Number.isFinite(value.ratio)
      || value.pair !== null && (!Array.isArray(value.pair) || value.pair.length !== 2
        || value.pair.some((id: unknown) => typeof id !== "string" || !/^(legacy|[a-z0-9-]{1,80})$/.test(id as string)) || value.pair[0] === value.pair[1])) return singleProjectLayout();
    return { version: 1, pair: value.pair, ratio: comparisonRatio(value.ratio) };
  } catch { return singleProjectLayout(); }
}
/** A third tab replaces the active pane; selecting the other visible pane never swaps it. */
export function reconcileComparison(layout: ProjectComparison, workspace: Workspace, previousActive = workspace.active): ProjectComparison {
  if (!layout.pair) return layout;
  const open = new Set(workspace.projects.filter(p => !p.closed).map(p => p.id));
  if (layout.pair.some(id => !open.has(id))) return { ...layout, pair: null };
  if (layout.pair.includes(workspace.active)) return layout;
  const pair: [string, string] = [...layout.pair];
  pair[layout.pair[1] === previousActive ? 1 : 0] = workspace.active;
  return { ...layout, pair };
}
export function replaceComparisonPane(layout: ProjectComparison, side: number, id: string): ProjectComparison {
  if (!layout.pair || layout.pair[side] === id) return layout;
  const pair: [string, string] = [...layout.pair], opposite = side === 0 ? 1 : 0;
  if (pair[opposite] === id) pair[opposite] = pair[side];
  pair[side] = id;
  return { ...layout, pair };
}
