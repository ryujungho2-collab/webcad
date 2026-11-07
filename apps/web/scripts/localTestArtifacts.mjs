import {existsSync, readFileSync, statSync, createReadStream} from "node:fs";
import {resolve} from "node:path";

export const localTestArtifacts = JSON.parse(readFileSync(new URL("./localTestArtifacts.json", import.meta.url), "utf8"));
export const artifactRoute = "/__local_test_artifact";

// These project delivery checks need optional, locally generated inputs. Missing
// inputs are setup failures, never a skipped/passed check or replacement geometry.
export function missingLocalTestArtifacts(workspace, pages) {
  return Object.entries(localTestArtifacts).filter(([, entry]) => pages.includes(entry.page)
    && (!existsSync(resolve(workspace, entry.path)) || !statSync(resolve(workspace, entry.path)).isFile()))
    .map(([id, entry]) => ({id, ...entry}));
}

export function localTestArtifactMiddleware(workspace) {
  return (request, response, next) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== artifactRoute) return next();
    const entry = localTestArtifacts[url.searchParams.get("id")];
    // Only fixed manifest entries can be served. Never accept a client file path.
    if (request.method !== "GET" || !Object.hasOwn(localTestArtifacts, url.searchParams.get("id"))) {
      response.statusCode = 404; response.end("Unknown local test artifact"); return;
    }
    const file = resolve(workspace, entry.path);
    if (!existsSync(file) || !statSync(file).isFile()) {
      response.statusCode = 503;
      response.end(`Missing local test input: ${entry.path}. See docs/verification/TEST-INPUTS-AND-ARTIFACTS.md`); return;
    }
    response.setHeader("Content-Type", entry.path.endsWith(".json") ? "application/json" : "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    const stream = createReadStream(file);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  };
}
