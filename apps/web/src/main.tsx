import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const bootstrapStartedAt = performance.now();

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <App />
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
