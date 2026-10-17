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
import { documentVersion, sameDocumentVersion, notifyDocumentChanged, subscribeDocumentChanges } from "./documentSession";
import { readRecoveryCheckpoint,writeRecoveryCheckpoint,reportRecoveryStatus,recoveryStatus } from "./documentRecovery";
import { assertConstructionEvaluation } from "../precision/constructionGeometry";
import { assertAngularEvaluation } from "../precision/angularDimensionSource";
import { embeddedProjectId, projectErrorMessage, projectStorage } from "../app/projectSession";
import { DURABLE_KEY, LARGE_DOCUMENT_CHARS, isDurableProject, loadProjectCheckpoint, writeDurableCheckpoint } from "../app/durableRecovery";
let recoveryLoadBlocked = false;
let durableSaveQueue: Promise<unknown> = Promise.resolve();

/** Resolve only after the actual durable transaction; capture the reviewed revision now. */
export function saveDocumentRecovery(): Promise<ReturnType<typeof documentVersion>> {
  const version = documentVersion(), snapshot = structuredClone(cadDocument), fingerprint = documentFingerprint(snapshot);
  try { assertDocumentIdle(); if (recoveryLoadBlocked) throw Error("Recovery source is unreadable. Open a valid document first."); }
  catch(error) { return Promise.reject(error); }
  let durable:boolean;
  try { durable = serializeDocument(snapshot).length >= LARGE_DOCUMENT_CHARS || isDurableProject(embeddedProjectId()??"legacy") || !!projectStorage(localStorage).getItem(DURABLE_KEY); }
  catch(error) { return Promise.reject(error); }
  if (!durable) { try { return Promise.resolve(saveDocumentToCache()); } catch(error) { return Promise.reject(error); } }
  reportRecoveryStatus({state:"pending"});
  const task = durableSaveQueue.catch(()=>{}).then(async () => {
    try {
      if (!sameDocumentVersion(version)) throw Error("The document changed before saving. Save the latest revision again.");
      await writeDurableCheckpoint(localStorage, embeddedProjectId() ?? "legacy", snapshot);
      if (!sameDocumentVersion(version)) throw Error("The document changed while saving. Save the latest revision again.");
      reportRecoveryStatus({state:"saved",fingerprint,revision:version.revision,documentId:version.documentId});return version;
    } catch(error) { reportRecoveryStatus({state:"failed",message:projectErrorMessage(error,"Recovery save failed.")});throw error; }
  });
  durableSaveQueue = task; return task;
}

export async function loadDocumentRecovery() {
  try {
    const checkpoint = await loadProjectCheckpoint(localStorage, embeddedProjectId() ?? "legacy");
    if (!checkpoint) return false;
    restoreLoadedDocument(checkpoint.document, false);
    if (checkpoint.recovered) reportRecoveryStatus({state:"recovered",message:"Recovered the previous valid checkpoint.",fingerprint:documentFingerprint(),revision:checkpoint.document.revision,documentId:checkpoint.document.id});
    else reportRecoveryStatus({state:"saved",fingerprint:documentFingerprint(),revision:checkpoint.document.revision,documentId:checkpoint.document.id});
    return true;
  } catch(error) { recoveryLoadBlocked=true; throw error; }
}

export function documentFingerprint(document: CadDocument = cadDocument) {
  const { revision: _revision, ...state } = document;
  return JSON.stringify(state);
}

export function saveDocumentToCache() {
  const startedAt = performance.now();
  const version = documentVersion();
  let serializedCharacters = 0;
  try {
    assertDocumentIdle();
    if (recoveryLoadBlocked) throw Error("Recovery source is unreadable. Open a saved WebCAD file or create a new project. Existing recovery data has been kept.");
    const snapshot = structuredClone(cadDocument), fingerprint = documentFingerprint(snapshot);
    serializedCharacters = serializeDocument(snapshot).length;
    writeRecoveryCheckpoint(projectStorage(localStorage), snapshot);
    if (!sameDocumentVersion(version)) throw Error("The document changed while saving. Save the latest revision again.");
    reportRecoveryStatus({state:"saved",fingerprint,revision:version.revision,documentId:version.documentId});
  }
  catch(error){reportRecoveryStatus({state:"failed",message:projectErrorMessage(error,"Could not save recovery checkpoint.")});throw error;}

  performance.measure("agent-webcad:document-save-cache", {
    start: startedAt,
    end: performance.now(),
    detail: { serializedCharacters },
  });
  return version;
}

export function loadDocumentFromCache():
  boolean {
  let checkpoint: ReturnType<typeof readRecoveryCheckpoint>;
  try { checkpoint=readRecoveryCheckpoint(projectStorage(localStorage)); }
  catch (reason) { recoveryLoadBlocked = true; throw reason; }
  if (!checkpoint) {
    return false;
  }

  restoreLoadedDocument(
    checkpoint.document
  );
  if(checkpoint.recovered && recoveryStatus().state !== "failed")reportRecoveryStatus({state:"recovered",message:"Recovered the previous valid checkpoint.",fingerprint:documentFingerprint(),revision:cadDocument.revision,documentId:cadDocument.id});

  return true;
}

export function documentExportSnapshot() {
  assertDocumentIdle();
  const version=documentVersion(),snapshot=structuredClone(cadDocument);
  const data=serializeDocument(snapshot),fingerprint=documentFingerprint(snapshot);
  if(!sameDocumentVersion(version))throw Error("The document changed while preparing its file. Export the latest revision again.");
  return {version,fingerprint,data};
}

export function saveDocumentAsFile() {
  const {version,fingerprint,data}=documentExportSnapshot();

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
  return { version, fingerprint };
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
  loaded: CadDocument, persist = true
) {
  assertDocumentIdle();
  assertConstructionEvaluation(loaded);
  assertAngularEvaluation(loaded);
  recoveryLoadBlocked = false;
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
  if(loaded.componentLibrary)cadDocument.componentLibrary=structuredClone(loaded.componentLibrary);else delete cadDocument.componentLibrary;
  if(loaded.blocks) cadDocument.blocks = structuredClone(loaded.blocks); else delete cadDocument.blocks;
  if(loaded.variables) cadDocument.variables = structuredClone(loaded.variables); else delete cadDocument.variables;
  if(loaded.parameterBindings) cadDocument.parameterBindings = structuredClone(loaded.parameterBindings); else delete cadDocument.parameterBindings;
  if(loaded.frameLinks) cadDocument.frameLinks = structuredClone(loaded.frameLinks); else delete cadDocument.frameLinks;
  if(loaded.workspaceSections) cadDocument.workspaceSections = structuredClone(loaded.workspaceSections); else delete cadDocument.workspaceSections;
  if(loaded.artboards) cadDocument.artboards = structuredClone(loaded.artboards); else delete cadDocument.artboards;
  if(loaded.scenes) cadDocument.scenes = structuredClone(loaded.scenes); else delete cadDocument.scenes;
  if(loaded.exchangeImports) cadDocument.exchangeImports = structuredClone(loaded.exchangeImports); else delete cadDocument.exchangeImports;
  if(loaded.modelViews) cadDocument.modelViews = structuredClone(loaded.modelViews); else delete cadDocument.modelViews;
  if(loaded.modelPresentation) cadDocument.modelPresentation=structuredClone(loaded.modelPresentation); else delete cadDocument.modelPresentation;
  if(loaded.workPlanes) cadDocument.workPlanes = structuredClone(loaded.workPlanes); else delete cadDocument.workPlanes;
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

  if(persist)void saveDocumentRecovery().catch(()=>{});
}

/** Debounced recovery writes are independent of the user's file-save state. */
export function startDocumentAutosave(){
  let timer:ReturnType<typeof setTimeout>|undefined;
  const saveWhenIdle=()=>{
    if(isDocumentCommandPending()){timer=setTimeout(saveWhenIdle,100);return;}
    timer=undefined;void saveDocumentRecovery().catch(()=>{});
  };
  const stop=subscribeDocumentChanges(()=>{
    reportRecoveryStatus({state:"pending"});
    if(timer)clearTimeout(timer);
    timer=setTimeout(saveWhenIdle,300);
  });
  const flush=()=>{if(timer){clearTimeout(timer);timer=undefined;void saveDocumentRecovery().catch(()=>{});}};
  const hidden=()=>{if(document.visibilityState==="hidden")flush();};
  window.addEventListener("pagehide",flush);document.addEventListener("visibilitychange",hidden);
  return ()=>{stop();if(timer)clearTimeout(timer);window.removeEventListener("pagehide",flush);document.removeEventListener("visibilitychange",hidden);};
}

