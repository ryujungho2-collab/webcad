import type { CadArtboard } from "@agent-webcad/cad-document";
import { planeToWorld, WORK_PLANES, type Vec3, type WorkPlaneId } from "../precision/workPlane";

export type ArtboardWorkspaceMode = "2d" | "3d";

/** Artboards are document-space rectangles on their declared CAD work plane. */
export function artboardWorldCorners(board: CadArtboard): Vec3[] {
  const plane = WORK_PLANES[board.workPlane];
  const [x, y] = board.origin;
  const [width, height] = board.size;
  return [
    planeToWorld([x, y], plane),
    planeToWorld([x + width, y], plane),
    planeToWorld([x + width, y + height], plane),
    planeToWorld([x, y + height], plane),
  ];
}

/** In a 2D work-plane view show only coplanar boards; in 3D project each
 * board using its actual work-plane axes rather than flattening mixed planes. */
export function artboardsForCanvas(
  boards: Iterable<CadArtboard>,
  workspaceMode: ArtboardWorkspaceMode,
  activePlane: WorkPlaneId,
): CadArtboard[] {
  return Array.from(boards).filter(board => board.visible && (workspaceMode === "3d" || board.workPlane === activePlane));
}

/** Keep a workspace selection only while its board exists and is visible. */
export function resolveActiveArtboardId(
  activeId: string | null,
  boards: Iterable<CadArtboard>,
): string | null {
  const visible = Array.from(boards).filter(board => board.visible);
  return visible.some(board => board.id === activeId) ? activeId : visible[0]?.id ?? null;
}
