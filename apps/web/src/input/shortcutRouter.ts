/** Shared keyboard-routing rules for the CAD shell.
 *
 * Viewport tools still own their transient pointer/keyboard lifecycles, but
 * the application-level router uses this helper so shortcuts never steal
 * keystrokes from text and numeric editors.
 */
export function isTextEditingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
    || Boolean(element?.isContentEditable);
}

/** Modal commands and editors own their keystrokes, even during a CAD tool. */
export function isCadKeyboardBlocked(target: EventTarget | null, key?: string): boolean {
  return isTextEditingTarget(target)
    || (target instanceof Element && (Boolean(target.closest('dialog[open], [data-cad-editor], .sketch-overlay'))
      // Keep native button/link/disclosure activation and role-button handlers.
      // Other CAD chords, including save/history, retain their existing scope.
      || (key === "Enter" || key === " ") && Boolean(target.closest('button, a[href], summary, [role="button"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"]'))));
}

/** History belongs to the document even when a tool control has focus.
 * Text/select editors and modal dialogs keep their own native keyboard scope. */
export function isCadHistoryBlocked(target: EventTarget | null): boolean {
  const input = target instanceof HTMLInputElement ? target : null;
  const nativeInputUndo = input && !["checkbox", "radio", "range", "button", "submit", "reset", "color", "file"].includes(input.type);
  return Boolean(nativeInputUndo)
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || Boolean((target as HTMLElement | null)?.isContentEditable)
    || (target instanceof Element && Boolean(target.closest('dialog[open], [role="dialog"]')));
}

export function routeHistoryShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; defaultPrevented: boolean }): "undo" | "redo" | null {
  if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  return key === "y" ? "redo" : null;
}

export function numericShortcutCharacter(key: string): boolean {
  return /^[0-9.,+\-]$/.test(key);
}

export type CadShortcutAction =
  | "line" | "polyline" | "rectangle" | "circle" | "arc"
  | "move" | "copy" | "rotate" | "scale" | "offset" | "trim"
  | "measure" | "extrude" | "fit" | "hide" | "text" | "extend" | "select";

export type CadShortcutContext = {
  workspaceMode: "2d" | "3d";
  hasSelection: boolean;
  selectionEditable: boolean;
  activeLayerLocked: boolean;
  canOffset: boolean;
  canTrim: boolean;
  canExtrude: boolean;
};

/** Drawing keys keep their meaning after a creation leaves objects selected.
 * Shift+R rotates; Shift+C copies by points in the 2D workspace. */
export function routeCadShortcut(key: string, context: CadShortcutContext, modifiers: { shiftKey?: boolean } = {}): CadShortcutAction | null {
  const drawingAvailable = context.workspaceMode === "2d" && !context.activeLayerLocked;
  if (modifiers.shiftKey) {
    if (key.toLowerCase() === "r") return context.hasSelection && context.selectionEditable ? "rotate" : null;
    if (key.toLowerCase() === "c") return context.workspaceMode === "2d" && context.hasSelection && context.selectionEditable ? "copy" : null;
    if (key.toLowerCase() === "x") return context.canTrim ? "extend" : null;
    return null;
  }
  switch (key.toLowerCase()) {
    case "v": return "select";
    case "l": return drawingAvailable ? "line" : null;
    case "p": return drawingAvailable ? "polyline" : null;
    case "c": return drawingAvailable ? "circle" : null;
    case "a": return drawingAvailable ? "arc" : null;
    case "r": return drawingAvailable ? "rectangle" : null;
    case "g":
    case "m": return context.hasSelection && context.selectionEditable ? "move" : null;
    case "s": return context.hasSelection && context.selectionEditable ? "scale" : null;
    case "o": return context.canOffset ? "offset" : null;
    case "t": return drawingAvailable ? "text" : null;
    case "x": return context.canTrim ? "trim" : null;
    case "i": return "measure";
    case "e": return context.canExtrude ? "extrude" : null;
    case "f": return "fit";
    case "h": return context.hasSelection && context.selectionEditable ? "hide" : null;
    default: return null;
  }
}

export function middleMouseNavigation(workspaceMode: "2d" | "3d", shiftKey: boolean): "pan" | "orbit" {
  return workspaceMode === "3d" && shiftKey ? "orbit" : "pan";
}
