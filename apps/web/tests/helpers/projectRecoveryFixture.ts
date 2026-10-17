import { enqueueDocumentCommand } from "../../src/state/documentCommandQueue";

// Fault fixture installed only by projectRecovery.browser.tsx, never by the editor.
let release: (() => void) | undefined;
(window as unknown as { projectRecoveryFixture: { hold: () => void; release: () => void } }).projectRecoveryFixture = {
  hold() { void enqueueDocumentCommand(() => new Promise<void>(resolve => { release = resolve; })); },
  release() { release?.(); release = undefined; },
};
