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
import { assertDocumentIdle,isDocumentCommandPending } from "./documentCommandQueue";
import { notifyDocumentChanged, subscribeDocumentChanges } from "./documentSession";
import { readRecoveryCheckpoint,writeRecoveryCheckpoint,reportRecoveryStatus } from "./documentRecovery";
import { assertConstructionEvaluation } from "../precision/constructionGeometry";
import { assertAngularEvaluation } from "../precision/angularDimensionSource";

export function saveDocumentToCache() {
  assertDocumentIdle();
  const startedAt = performance.now();
  const data =
    serializeDocument(
      cadDocument
    );

  try {writeRecoveryCheckpoint(localStorage,cadDocument);reportRecoveryStatus({state:"saved"});}
  catch(error){reportRecoveryStatus({state:"failed",message:error instanceof Error?error.message:"Could not save recovery checkpoint."});throw error;}

  performance.measure("agent-webcad:document-save-cache", {
    start: startedAt,
    end: performance.now(),
    detail: { serializedCharacters: data.length },
  });
}

export function loadDocumentFromCache():
  boolean {
  const checkpoint=readRecoveryCheckpoint(localStorage);
  if (!checkpoint) {
    return false;
  }

  restoreLoadedDocument(
    checkpoint.document
  );
  if(checkpoint.recovered)reportRecoveryStatus({state:"recovered",message:"Recovered the previous valid checkpoint."});

  return true;
}

export function saveDocumentAsFile() {
  assertDocumentIdle();
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
    sketches: {},

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
  assertDocumentIdle();
  assertConstructionEvaluation(loaded);
  assertAngularEvaluation(loaded);
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

  cadDocument.sketches = structuredClone(loaded.sketches ?? {});
  if(loaded.blocks) cadDocument.blocks = structuredClone(loaded.blocks); else delete cadDocument.blocks;
  if(loaded.variables) cadDocument.variables = structuredClone(loaded.variables); else delete cadDocument.variables;
  if(loaded.parameterBindings) cadDocument.parameterBindings = structuredClone(loaded.parameterBindings); else delete cadDocument.parameterBindings;
  if(loaded.artboards) cadDocument.artboards = structuredClone(loaded.artboards); else delete cadDocument.artboards;
  if(loaded.scenes) cadDocument.scenes = structuredClone(loaded.scenes); else delete cadDocument.scenes;
  if(loaded.rasterAssets) cadDocument.rasterAssets = structuredClone(loaded.rasterAssets); else delete cadDocument.rasterAssets;

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
  notifyDocumentChanged();

  try{saveDocumentToCache();}catch{/* The loaded document is valid; surface storage failure through RecoveryStatus. */}
}

/** Debounced recovery writes are independent of the user's file-save state. */
export function startDocumentAutosave(){
  let timer:ReturnType<typeof setTimeout>|undefined;
  const saveWhenIdle=()=>{
    if(isDocumentCommandPending()){timer=setTimeout(saveWhenIdle,100);return;}
    timer=undefined;try{saveDocumentToCache();}catch{/* Displayed by RecoveryStatus. */}
  };
  const stop=subscribeDocumentChanges(()=>{
    if(timer)clearTimeout(timer);
    timer=setTimeout(saveWhenIdle,300);
  });
  const flush=()=>{if(timer){clearTimeout(timer);timer=undefined;try{saveDocumentToCache();}catch{/* Last valid checkpoint is retained. */}}};
  const hidden=()=>{if(document.visibilityState==="hidden")flush();};
  window.addEventListener("pagehide",flush);document.addEventListener("visibilitychange",hidden);
  return ()=>{stop();if(timer)clearTimeout(timer);window.removeEventListener("pagehide",flush);document.removeEventListener("visibilitychange",hidden);};
}
