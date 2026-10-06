import type {
  CadDocument,
} from "@agent-webcad/cad-document";
import { assertDocumentIdle, isDocumentCommandPending } from "./documentCommandQueue";
import { notifyDocumentChanged } from "./documentSession";

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
  assertDocumentIdle();
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

  cadDocument.sketches = structuredClone(snapshot.sketches);
  if(snapshot.blocks) cadDocument.blocks = structuredClone(snapshot.blocks); else delete cadDocument.blocks;
  if(snapshot.variables) cadDocument.variables = structuredClone(snapshot.variables); else delete cadDocument.variables;
  if(snapshot.parameterBindings) cadDocument.parameterBindings = structuredClone(snapshot.parameterBindings); else delete cadDocument.parameterBindings;
  if(snapshot.artboards) cadDocument.artboards = structuredClone(snapshot.artboards); else delete cadDocument.artboards;
  if(snapshot.scenes) cadDocument.scenes = structuredClone(snapshot.scenes); else delete cadDocument.scenes;
  if(snapshot.rasterAssets) cadDocument.rasterAssets = structuredClone(snapshot.rasterAssets); else delete cadDocument.rasterAssets;

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
  notifyDocumentChanged();
}

export function undoDocument() {
  if (isDocumentCommandPending()) return false;
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
  if (isDocumentCommandPending()) return false;
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
