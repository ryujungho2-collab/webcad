import type { CadDocument } from "@agent-webcad/cad-document";
import { getObjectTransform } from "./objectTransform";

export type DuplicateSeries = { sourceIds: string[]; copyIds: string[] };

/** Reuse a copy's edited spacing only while the complete resulting set is selected. */
export function repeatDuplicateOffset(
  document: CadDocument,
  series: DuplicateSeries | null,
  selectedIds: readonly string[],
): [number, number, number] | null {
  if (!series || !series.copyIds.length || series.copyIds.length !== series.sourceIds.length ||
      selectedIds.length !== series.copyIds.length ||
      !selectedIds.every((id) => series.copyIds.includes(id))) return null;

  let common: [number, number, number] | null = null;
  for (let index = 0; index < series.copyIds.length; index += 1) {
    const source = document.objects[series.sourceIds[index]];
    const copy = document.objects[series.copyIds[index]];
    if (!source || !copy) return null;
    const sourcePosition = getObjectTransform(source).translation;
    const copyPosition = getObjectTransform(copy).translation;
    const displacement = copyPosition.map((value, axis) => value - sourcePosition[axis]) as [number, number, number];
    if (!displacement.every(Number.isFinite)) return null;
    if (common && displacement.some((value, axis) => Math.abs(value - common![axis]) > 1e-6)) return null;
    common = displacement;
  }
  return common;
}
