export type WorkspaceMode = "2d" | "3d";

export const WORKSPACE_TRANSITION_MS = 280;

export function workspaceTransitionDuration() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : WORKSPACE_TRANSITION_MS;
}

export function easeWorkspaceTransition(progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped * clamped * (3 - 2 * clamped);
}
