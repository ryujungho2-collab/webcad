import React from "react";
import ReactDOM from "react-dom/client";
import { DocumentRecoveryGate } from "./app/DocumentRecoveryGate";
import { ProjectWorkspace } from "./app/ProjectWorkspace";
import { embeddedProjectId } from "./app/projectSession";
import "./styles.css";
import "./ui/tokens.css";
import "./ui/workstation.css";
import "./ui/commands.css";
import "./ui/menu.css";
import "./ui/explorer.css";
import "./ui/inspector.css";

const bootstrapStartedAt = performance.now();

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    {embeddedProjectId() ? <DocumentRecoveryGate /> : <ProjectWorkspace />}
  </React.StrictMode>
);

requestAnimationFrame(() => {
  performance.measure("agent-webcad:shell-ready", {
    start: bootstrapStartedAt,
    end: performance.now(),
  });
  if (import.meta.env.DEV) {
    console.info("[agent-webcad:perf]", JSON.stringify({
      shellReadyMs: Number((performance.now() - bootstrapStartedAt).toFixed(1)),
    }));
  }
});
