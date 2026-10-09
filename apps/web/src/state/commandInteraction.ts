import type { CadPlanPreview } from "./documentPlans";
import { sameDocumentVersion } from "./documentSession";

export type InteractionStage = "idle" | "selecting" | "input" | "preview" | "invalid" | "ready" | "applying" | "completed";
export type InteractionReference = { name: string; kind: string; status: "preserved" | "remapped" | "unresolved"; objectId?: string };
export type InteractionInput = {
  command: string; draftKey: string; reviewedKey?: string; preview?: CadPlanPreview | null;
  targets: string[]; missing?: string[]; numericParameters?: Record<string, string>;
  references?: InteractionReference[]; inputError?: string; pending?: boolean;
  selecting?: boolean; visualReady?: boolean; completedIds?: string[]; idle?: boolean;
};

/** The same decision is consumed by buttons, form submit and canvas shortcuts.
 * A successful plan belongs to its exact input draft, never just the last effect.
 * The transaction layer rechecks the document again when applying. */
export function commandInteraction(input: InteractionInput) {
  const current = !!input.preview && input.draftKey === input.reviewedKey;
  const stale = current && (input.preview!.stale || !sameDocumentVersion(input.preview!.baseVersion));
  const unresolved = input.references?.filter(r => r.status === "unresolved") ?? [];
  const validationError = input.inputError || (stale ? "Document changed. Review the current input again." : current && !input.preview!.result.ok ? input.preview!.result.reason ?? "The edit could not be validated." : undefined);
  const canApply = !input.idle && input.completedIds === undefined && !input.pending && !input.selecting && !(input.missing?.length) && !unresolved.length && !validationError && current && !!input.preview!.result.ok && input.preview!.result.changed && input.visualReady !== false;
  const stage: InteractionStage = input.idle ? "idle" : input.pending ? "applying" : input.completedIds !== undefined ? "completed" : input.selecting || input.missing?.length ? "selecting" : validationError || unresolved.length ? "invalid" : canApply ? "ready" : current ? "preview" : "input";
  const diagnostic = current ? input.preview?.result.diagnostic : undefined;
  return { ...input, stage, canApply, validationError, diagnostic, preview: current && !stale ? input.preview : undefined,
    affectedObjectIds: current ? input.preview!.changes.map(c => c.objectId) : [],
    resultIds: input.completedIds ?? (current ? input.preview!.result.createdIds : []),
    next: stage === "completed" ? "Continue on the selected result or finish this tool." : input.missing?.[0] ?? (unresolved.length ? `Reconnect ${unresolved.length} unresolved relationship(s).` : validationError ? "Correct the highlighted input, then review again." : canApply ? "Review the canvas and apply. One Undo restores this edit." : "Edit the input to prepare and review its effect.") };
}
export type CommandInteraction = ReturnType<typeof commandInteraction>;

export function interactionRecovery(reason: string): string[] {
  if (/D[12].*consumes/i.test(reason)) return ["Reduce the named setback distance so part of its assigned edge remains, then review again."];
  if (/nonuniform.*scale|uniform.*scale/i.test(reason)) return ["Use equal scale magnitudes on both axes of the drawing plane, then review the world distances again."];
  if (/adjacent arcs/i.test(reason)) return ["Choose a corner between two straight edges. Other arcs in the contour are preserved."];
  if (/locked|unlock/i.test(reason)) return [/artboard/i.test(reason) ? "Unlock the selected board in Artboards, then review again." : "Unlock the named output layer in Layers, then review again."];
  if (/branch|intersection.*exist/i.test(reason)) return ["Choose the result edge containing the saved intersection, or select the other intersection branch."];
  if (/sketch.*conflict|constraint/i.test(reason)) return ["Choose points or edges that preserve the driving value. Inspect the named constraint in Edit Sketch."];
  if (/pattern|instance identities/i.test(reason)) return ["Keep distinct pattern sources. Generated references must use their owning pattern's chosen result."];
  if (/closed|profile/i.test(reason)) return ["Reconnect the contour ends before applying to a live solid profile."];
  if (/reference|result|edge|point|span/i.test(reason)) return ["Choose a new result and its required point, edge, or whole endpoint span."];
  if (/distance|numeric|number|unit|angle|value/i.test(reason)) return ["Enter a finite value with the displayed units and allowed range."];
  return ["Keep this tool open and correct the named target or input."];
}
