import { createRoot } from "react-dom/client";
import { serializeDocument } from "@agent-webcad/cad-document";
import { App } from "../src/App";
import "../src/ui/tokens.css";
import "../src/ui/workstation.css";
import "../src/ui/commands.css";
import "../src/ui/menu.css";
import "../src/ui/explorer.css";
import "../src/ui/inspector.css";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { documentSessionIdentity } from "../src/state/documentSession";
import { queryProfileExtrudeRelations, type ProfileExtrudeRelationReport } from "../src/state/profileExtrudeRelations";
import { installBrowserChecks } from "./helpers/browserChecks";
import { buildProfileExtrudeRelationFixture } from "./helpers/profileExtrudeRelationFixture";
import { click, input, physical, waitFor } from "./helpers/physicalInput";

const withoutExtrude = await buildProfileExtrudeRelationFixture();
createRoot(document.getElementById("root")!).render(<App recoveryReady />);
const button = document.getElementById("run-profile-extrude-relations") as HTMLButtonElement;
const output = document.getElementById("profile-extrude-relations-result")!;
const section = () => document.querySelector<HTMLElement>('[aria-label="Profile and Extrude relations"]');
const row = (id: string) => document.querySelector<HTMLElement>(`[data-model-object-id="${id}"]`);

async function inspect(id: string) {
  await waitFor(() => !!row(id)?.getBoundingClientRect().width);
  await physical(row(id)!);
  const disclosure = () => document.querySelector<HTMLButtonElement>('[data-inspector-section="Dependencies"] .property-section-trigger');
  await waitFor(() => !!disclosure());
  if (disclosure()!.getAttribute("aria-expanded") !== "true") await physical(disclosure()!);
  await waitFor(() => !!section()?.getBoundingClientRect().height);
}

button.onclick = async () => {
  button.style.display = "none";
  const checks: string[] = [];
  const check = (ok: unknown, label: string) => {
    if (!ok) throw Error(label);
    checks.push(`PASS: ${label}`);
  };
  let download: Promise<string> | undefined;
  const nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download === "profile-extrude-relations.json") download = fetch(this.href).then(response => response.text());
    else nativeClick.call(this);
  };
  const read = async () => {
    download = undefined;
    await click("Download relation JSON");
    await waitFor(() => !!download);
    const json = await download!;
    return { json, report: JSON.parse(json) as ProfileExtrudeRelationReport };
  };
  try {
    await waitFor(() => !!document.querySelector("canvas"));
    await click("Fit all geometry");
    const documentBefore = serializeDocument(cadDocument);
    const historyBefore = cadHistory.getStateToken();
    await inspect("profile");
    check(section()?.textContent?.includes("Uses this profile") && section()?.textContent?.includes("Live input") &&
      section()?.textContent?.includes("(profile) → Extrude (solid)"),
      "Selecting the 2D profile shows the live outgoing link with both endpoint IDs");
    const forward = await read();
    check(forward.report.relations[0]?.viewedFrom === "outgoing" &&
      JSON.stringify(forward.report) === JSON.stringify(queryProfileExtrudeRelations(cadDocument, "profile")),
      "Downloaded JSON uses the same document, revision and outgoing relation as the Inspector");
    await inspect("solid");
    check(section()?.textContent?.includes("Source for this extrusion") &&
      section()?.textContent?.includes("(profile) → Extrude (solid)"),
      "Selecting the Extrude reveals the same original profile in the opposite view");
    const reverse = await read();
    check(reverse.report.relations[0]?.viewedFrom === "incoming" &&
      JSON.stringify(reverse.report.relations[0]) === JSON.stringify({ ...forward.report.relations[0], viewedFrom: "incoming" }),
      "Reverse JSON preserves canonical edge direction, ownership and evidence");
    check(serializeDocument(cadDocument) === documentBefore && cadHistory.getStateToken() === historyBefore,
      "Inspecting and downloading both directions leaves document and History unchanged");
    const screenshot = (await (await input({ type: "screenshot" })).json() as { data: string }).data;

    await click("Undo");
    await waitFor(() => !cadDocument.objects.solid);
    await inspect("profile");
    check(section()?.textContent?.includes("No recorded direct") && (await read()).report.relations.length === 0,
      "Undo removes the relation from both the Inspector and JSON");
    await click("Redo");
    await waitFor(() => !!cadDocument.objects.solid);
    await inspect("profile");
    check(section()?.textContent?.includes("Uses this profile") && (await read()).report.relations[0]?.target.objectId === "solid",
      "Redo restores the live relation from the current document");

    // The older file has the same ID and profile but predates its extrusion.
    // The native loader advances the active session's revision.
    const identity = documentSessionIdentity(), currentRevision = cadDocument.revision;
    const bytes = new TextEncoder().encode(withoutExtrude);
    await input({ type: "fileInput", selector: 'input[accept=".json,.webcad.json"]', name: "prepared.webcad.json",
      base64: btoa(String.fromCharCode(...bytes)) });
    await waitFor(() => documentSessionIdentity() !== identity);
    check(cadDocument.id === forward.report.document.id && cadDocument.revision > currentRevision,
      "Native reopen keeps the document ID and advances the current revision");
    await inspect("profile");
    const reopened = await read();
    check(section()?.textContent?.includes("No recorded direct") && reopened.report.relations.length === 0 &&
      reopened.report.document.revision === cadDocument.revision,
      "Same-ID reopen displays the replacement relationships and current revision");
    (globalThis as typeof globalThis & { cadTestArtifacts?: Record<string, string> }).cadTestArtifacts = {
      "profile-extrude-inspector.png": screenshot, "profile-extrude-relations.json": reverse.json,
    };
    output.textContent = [...checks, `ALL ${checks.length} CHECKS PASSED`].join("\n");
  } catch (error) {
    output.textContent = [...checks, `FAIL: ${error instanceof Error ? error.stack : String(error)}`].join("\n");
  } finally {
    HTMLAnchorElement.prototype.click = nativeClick;
  }
};
installBrowserChecks(button, output);
