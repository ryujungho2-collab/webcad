/** Test-only upstream control. The browser still uses the production proxy and validator. */
export function autoOntologyBrowserFixture() {
  return {
    name: "auto-ontology-browser-fixture",
    enforce: "pre",
    async configureServer(server) {
      const { createAutoOntologyPilot } = await server.ssrLoadModule("/server/autoOntologyPilot.ts");
      const { autoOntologySnapshot, externalRelationRows, ontologyEventResponse } = await server.ssrLoadModule("/tests/helpers/autoOntologyFixture.ts");
      let mode = "success", calls = 0, completed = 0;
      const gateway = createAutoOntologyPilot({
        url: "http://localhost:38100", apiKey: "fixture-server-key", snapshot: autoOntologySnapshot, timeoutMs: 1000,
        fetcher: async (_url, init) => {
          calls++;
          const chosen = mode;
          if (chosen === "timeout") return new Promise((_resolve, reject) =>
            init.signal.addEventListener("abort", () => reject(Error("fixture timeout")), { once: true }));
          if (chosen === "delayed") await new Promise(resolve => setTimeout(resolve, 1600));
          completed++;
          if (chosen === "malformed") return new Response("bad JSON");
          const rows = externalRelationRows();
          if (chosen === "wrong-revision") rows[0].revision++;
          return ontologyEventResponse(rows);
        },
      });
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? "").split("?", 1)[0] === "/__ontology_fixture") {
          const requested = new URL(req.url, "http://localhost").searchParams.get("mode");
          if (req.method === "POST" && ["success", "timeout", "delayed", "wrong-revision", "malformed"].includes(requested)) mode = requested;
          res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ mode, calls, completed })); return;
        }
        void gateway.middleware(req, res, next);
      });
    },
  };
}
