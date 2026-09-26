export type SelectionPointerOwner =
  | "navigation"
  | "drawing"
  | "direct-select"
  | "transform"
  | "object-selection";

export function selectionPointerOwner(input: {
  button: number;
  drawingActive: boolean;
  directSelectActive: boolean;
  transformHandleActive: boolean;
}): SelectionPointerOwner {
  if (input.button !== 0) return "navigation";
  if (input.drawingActive) return "drawing";
  if (input.directSelectActive) return "direct-select";
  if (input.transformHandleActive) return "transform";
  return "object-selection";
}

export function hasSelectionToggleModifier(input: Pick<PointerEvent, "shiftKey" | "ctrlKey" | "metaKey">) {
  return input.shiftKey || input.ctrlKey || input.metaKey;
}

export function pointerBucketKey(clientX: number, clientY: number) {
  return `${Math.round(clientX / 4)}:${Math.round(clientY / 4)}`;
}

export function uniqueSelectionCandidates(ids: Array<string | undefined>) {
  return ids.filter((id, index, all): id is string => Boolean(id) && all.indexOf(id) === index);
}

export type SelectionDisplayTone = "primary" | "secondary" | "hover" | "default";

/**
 * Visual priority for one object: real selection always wins over hover
 * preselection so the two states can never be confused. Pure and
 * viewport-rendering only; never touches selection or document state.
 */
export function selectionDisplayTone(input: {
  objectId: string;
  primaryId: string | null;
  selectedIds: readonly string[];
  hoveredId: string | null;
}): SelectionDisplayTone {
  if (input.objectId === input.primaryId) return "primary";
  if (input.selectedIds.includes(input.objectId)) return "secondary";
  if (input.objectId === input.hoveredId) return "hover";
  return "default";
}

export function cycleSelectionCandidate(input: {
  candidates: string[];
  pointerKey: string;
  previousKey: string;
  previousIndex: number;
  toggleModifier: boolean;
}) {
  const index = input.pointerKey === input.previousKey && !input.toggleModifier
    ? (input.previousIndex + 1) % Math.max(1, input.candidates.length)
    : 0;
  return {
    objectId: input.candidates[index],
    nextKey: input.pointerKey,
    nextIndex: index,
  };
}
