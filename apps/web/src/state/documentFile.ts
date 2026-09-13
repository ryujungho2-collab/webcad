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
  const startedAt = performance.now();
  const data =
    serializeDocument(
      cadDocument
    );

  localStorage.setItem(
    CACHE_KEY,
    data
  );

  performance.measure("agent-webcad:document-save-cache", {
    start: startedAt,
    end: performance.now(),
    detail: { serializedCharacters: data.length },
  });
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

  window.setTimeout(
    () => {
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    1_000
  );
}

export async function openDocumentFile(
  file: File
) {
  const startedAt = performance.now();
  const text =
    await file.text();

  const loaded =
    deserializeDocument(
      text
    );

  restoreLoadedDocument(
    loaded
  );

  performance.measure("agent-webcad:document-open", {
    start: startedAt,
    end: performance.now(),
    detail: { bytes: file.size },
  });
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
