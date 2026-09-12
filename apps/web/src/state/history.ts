import type {
  CadDocument,
} from "@agent-webcad/cad-document";

import {
  HistoryStack,
} from "@agent-webcad/cad-history";

import {
  cadDocument,
} from "./cadDocument";

function cloneDocument(
  document: CadDocument
): CadDocument {
  return structuredClone(
    document
  );
}

export const cadHistory =
  new HistoryStack<CadDocument>(
    cloneDocument
  );

export function restoreDocument(
  snapshot: CadDocument
) {
  /*
   * Keep the same object reference.
   * Other modules already import
   * cadDocument directly.
   */
  cadDocument.id =
    snapshot.id;

  cadDocument.objects =
    structuredClone(
      snapshot.objects
    );

  cadDocument.features =
    structuredClone(
      snapshot.features
    );

  cadDocument.layers =
    structuredClone(
      snapshot.layers
    );

  cadDocument.rootObjects =
    [...snapshot.rootObjects];

  cadDocument.rootLayers =
    [...snapshot.rootLayers];

  /*
   * Revision must always change so
   * React/viewport resynchronizes.
   */
  cadDocument.revision += 1;
}

export function undoDocument() {
  const snapshot =
    cadHistory.undo(
      cadDocument
    );

  if (!snapshot) {
    return false;
  }

  restoreDocument(
    snapshot.value
  );

  return true;
}

export function redoDocument() {
  const snapshot =
    cadHistory.redo(
      cadDocument
    );

  if (!snapshot) {
    return false;
  }

  restoreDocument(
    snapshot.value
  );

  return true;
}