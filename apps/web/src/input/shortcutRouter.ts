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

export function numericShortcutCharacter(key: string): boolean {
  return /^[0-9.,+\-]$/.test(key);
}

export type CadShortcutAction =
  | "line" | "polyline" | "rectangle" | "circle" | "arc"
  | "move" | "rotate" | "scale" | "offset" | "trim"
  | "measure" | "extrude" | "fit" | "hide";

export type CadShortcutContext = {
  workspaceMode: "2d" | "3d";
  hasSelection: boolean;
  selectionEditable: boolean;
  activeLayerLocked: boolean;
  canOffset: boolean;
  canTrim: boolean;
  canExtrude: boolean;
};

/** Resolve the CAD meaning before handling a key. A selected object gives R
 * its transform meaning; an empty 2D workspace gives R its drawing meaning. */
export function routeCadShortcut(key: string, context: CadShortcutContext): CadShortcutAction | null {
  const drawingAvailable = context.workspaceMode === "2d" && !context.activeLayerLocked;
  switch (key.toLowerCase()) {
    case "l": return drawingAvailable ? "line" : null;
    case "p": return drawingAvailable ? "polyline" : null;
    case "c": return drawingAvailable ? "circle" : null;
    case "a": return drawingAvailable ? "arc" : null;
    case "r": return context.hasSelection && context.selectionEditable ? "rotate" : !context.hasSelection && drawingAvailable ? "rectangle" : null;
    case "g":
    case "m": return context.hasSelection && context.selectionEditable ? "move" : null;
    case "s": return context.hasSelection && context.selectionEditable ? "scale" : null;
    case "o": return context.canOffset ? "offset" : null;
    case "t": return context.canTrim ? "trim" : null;
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
