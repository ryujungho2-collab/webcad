import {
  serializeDocument,
  deserializeDocument,
  type CadDocument,
} from "@agent-webcad/cad-document";

import {
  cadDocument,
} from "./cadDocument";

import {
  cadHistory,
} from "./history";

const CACHE_KEY =
  "agent-webcad-working-document";

export function saveDocumentToCache() {
  const data =
    serializeDocument(
      cadDocument
    );

  localStorage.setItem(
    CACHE_KEY,
    data
  );
}

export function loadDocumentFromCache():
  boolean {
  const data =
    localStorage.getItem(
      CACHE_KEY
    );

  if (!data) {
    return false;
  }

  const loaded =
    deserializeDocument(
      data
    );

  restoreLoadedDocument(
    loaded
  );

  return true;
}

export function saveDocumentAsFile() {
  const data =
    serializeDocument(
      cadDocument
    );

  const blob =
    new Blob(
      [data],
      {
        type:
          "application/json",
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  anchor.href =
    url;

  anchor.download =
    `${cadDocument.id}.webcad.json`;

  document.body.appendChild(
    anchor
  );

  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(
    url
  );
}

export async function openDocumentFile(
  file: File
) {
  const text =
    await file.text();

  const loaded =
    deserializeDocument(
      text
    );

  restoreLoadedDocument(
    loaded
  );
}

export function newDocument() {
  const fresh: CadDocument = {
    id:
      `document-${crypto.randomUUID()}`,

    revision: 0,

    objects: {},

    features: {},

    layers: {
      "layer-default": {
        id:
          "layer-default",
        name:
          "Default",
        visible:
          true,
        locked:
          false,
        objectIds:
          [],
      },
    },

    rootObjects: [],

    rootLayers: [
      "layer-default",
    ],
  };

  restoreLoadedDocument(
    fresh
  );
}

function restoreLoadedDocument(
  loaded: CadDocument
) {
  cadDocument.id =
    loaded.id;

  cadDocument.objects =
    structuredClone(
      loaded.objects
    );

  cadDocument.features =
    structuredClone(
      loaded.features
    );

  cadDocument.layers =
    structuredClone(
      loaded.layers
    );

  cadDocument.rootObjects =
    [...loaded.rootObjects];

  cadDocument.rootLayers =
    [...loaded.rootLayers];

  /*
   * Force UI + viewport sync.
   */
  cadDocument.revision += 1;

  /*
   * Opening/New starts a fresh
   * editing history session.
   */
  cadHistory.clear();

  saveDocumentToCache();
}