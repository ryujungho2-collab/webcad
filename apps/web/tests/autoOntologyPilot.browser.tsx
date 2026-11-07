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
import { documentSessionIdentity, notifyDocumentChanged } from "../src/state/documentSession";
import { buildProfileExtrudeRelationFixture } from "./helpers/profileExtrudeRelationFixture";
import { click, input, physical, waitFor } from "./helpers/physicalInput";
import { installBrowserChecks } from "./helpers/browserChecks";

let olderFile = await buildProfileExtrudeRelationFixture();
createRoot(document.getElementById("root")!).render(<App recoveryReady />);
const live = location.pathname.includes("PilotLive");
const button = document.getElementById("run-auto-ontology-pilot") as HTMLButtonElement;
const output = document.getElementById("auto-ontology-pilot-result")!;
const pilot = () => document.querySelector<HTMLElement>('[aria-label="Auto Ontology relation pilot"]');
const native = () => document.querySelector<HTMLElement>('[aria-label="Profile and Extrude relations"]');
const consent = () => document.querySelector<HTMLInputElement>('[aria-label="Allow external relation lookup for this session"]');
async function inspect(id: string) {
  const row = () => document.querySelector<HTMLElement>(`[data-model-object-id="${id}"]`);
  await waitFor(() => !!row()?.getBoundingClientRect().width);
  await physical(row()!);
  const section = () => document.querySelector<HTMLButtonElement>('[data-inspector-section="Dependencies"] .property-section-trigger');
  await waitFor(() => !!section());
  if (section()!.getAttribute("aria-expanded") !== "true") await physical(section()!);
  await waitFor(() => !!pilot());
}
async function waitExternal() {
  const deadline = Date.now() + (live ? 55000 : 10000);
  while (pilot()?.dataset.pilotState === "loading") {
    if (Date.now() > deadline) throw Error("External request exceeded the browser test budget");
    await new Promise(resolve => setTimeout(resolve, 40));
  }
}
async function mode(value: string) { await fetch(`/__ontology_fixture?mode=${value}`, { method: "POST" }); }

button.onclick = async () => {
  button.style.display = "none";
  const checks: string[] = [];
  const check = (ok: unknown, message: string) => { if (!ok) throw Error(message); checks.push(`PASS: ${message}`); };
  try {
    await waitFor(() => !!document.querySelector("canvas"));
    await click("Fit all geometry");
    await inspect("profile");
    await waitFor(() => !!consent());
    const saved = serializeDocument(cadDocument), history = cadHistory.getStateToken();
    check(native()?.textContent?.includes("Uses this profile") && native()?.textContent?.includes("(profile) → Extrude (solid)"),
      "The Inspector shows native relations before external consent or a request");
    const explain = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Explain with Auto Ontology");
    check(!consent()!.checked && explain()?.disabled, "External lookup requires explicit session consent");
    if (!live) check((await (await fetch("/__ontology_fixture")).json()).calls === 0, "No external request occurs on selection");
    await physical(consent()!);
    await click("Explain with Auto Ontology");
    check(native()?.textContent?.includes("Uses this profile"), "Native relations remain visible while explanation loads");
    await waitExternal();
    check(pilot()?.dataset.pilotState === "verified" && pilot()?.textContent?.includes("profile → solid · live · resolved"),
      "Forward selection displays an explanation only after external rows match native facts");
    check(!pilot()?.textContent?.includes("Unverified model prose"), "The explanation uses verified facts");
    const screenshot = (await (await input({ type: "screenshot" })).json() as { data: string }).data;
    await inspect("solid");
    await click("Explain with Auto Ontology");
    await waitExternal();
    check(pilot()?.dataset.pilotState === "verified" && native()?.textContent?.includes("Source for this extrusion"),
      "Reverse selection verifies the same canonical relationship");
    if (!live) {
      for (const value of ["wrong-revision", "malformed", "timeout"]) {
        await mode(value); await click("Explain with Auto Ontology"); await waitExternal();
        check(pilot()?.dataset.pilotState === "fallback" && native()?.textContent?.includes("Source for this extrusion"),
          `${value} falls back to the existing native relation report`);
      }
    }
    check(serializeDocument(cadDocument) === saved && cadHistory.getStateToken() === history,
      "External reads and failure handling leave the document and Undo history unchanged");
    if (!live) {
      await inspect("profile"); await mode("delayed");
      await click("Explain with Auto Ontology");
      await click("Undo");
      await waitFor(() => !cadDocument.objects.solid);
      await inspect("profile");
      await new Promise(resolve => setTimeout(resolve, 1700));
      check(native()?.textContent?.includes("No recorded direct") && pilot()?.dataset.pilotState !== "verified",
        "A delayed response after Undo is discarded and the current native report wins");
      await click("Redo");
      await waitFor(() => !!cadDocument.objects.solid);
      await inspect("profile");
      check(explain()?.disabled && pilot()?.textContent?.includes("no registered external snapshot"),
        "Redo's new revision requires a newly registered external snapshot");

      olderFile = await buildProfileExtrudeRelationFixture(); notifyDocumentChanged(true);
      await inspect("profile"); await waitFor(() => !!consent());
      await physical(consent()!); await click("Explain with Auto Ontology");
      const session = documentSessionIdentity();
      const bytes = new TextEncoder().encode(olderFile);
      await input({ type: "fileInput", selector: 'input[accept=".json,.webcad.json"]', name: "prepared.webcad.json",
        base64: btoa(String.fromCharCode(...bytes)) });
      await waitFor(() => documentSessionIdentity() !== session);
      await inspect("profile");
      await new Promise(resolve => setTimeout(resolve, 1700));
      check(native()?.textContent?.includes("No recorded direct") && pilot()?.dataset.pilotState !== "verified",
        "Same-ID native file reopen discards the previous session's delayed response");
    }
    (globalThis as typeof globalThis & { cadTestArtifacts?: Record<string, string> }).cadTestArtifacts = {
      "verified-inspector.png": screenshot,
      "external-trace.json": JSON.stringify({ live, checks, fixture: live ? null : await (await fetch("/__ontology_fixture")).json() }, null, 2),
    };
    output.textContent = [...checks, `ALL ${checks.length} CHECKS PASSED`].join("\n");
  } catch (error) { output.textContent = [...checks, `FAIL: ${error instanceof Error ? error.stack : String(error)}`].join("\n"); }
};
installBrowserChecks(button, output);
