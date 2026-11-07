import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {localCopilotPlugin} from "./server/localCopilot";
import {cadMcpPlugin} from "./server/cadMcpBroker";
import {autoOntologyPilotPlugin} from "./server/autoOntologyPilot";

export default defineConfig({
  plugins: [react(),localCopilotPlugin(),cadMcpPlugin(),autoOntologyPilotPlugin()],
  worker: { format: "es" },
});
