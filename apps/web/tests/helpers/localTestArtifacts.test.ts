import assert from "node:assert/strict";
import {test} from "node:test";
import {createServer} from "node:http";
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {createHash} from "node:crypto";
import {localTestArtifacts, localTestArtifactMiddleware, missingLocalTestArtifacts} from "../../scripts/localTestArtifacts.mjs";

test("only selected project pages require local delivery artifacts; absent inputs never pass silently", () => {
  const workspace = mkdtempSync(join(tmpdir(), "webcad-inputs-"));
  try {
    assert.deepEqual(missingLocalTestArtifacts(workspace, ["drawOrder", "assemblyCandidateSearch"]), []);
    const missing = missingLocalTestArtifacts(workspace, ["courtyardPresentation"]);
    assert.deepEqual(missing.map(item => item.id), ["courtyard-scene", "courtyard-document"]);
    const file = join(workspace, localTestArtifacts["courtyard-document"].path);
    mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, "{}");
    assert.deepEqual(missingLocalTestArtifacts(workspace, ["courtyardPresentation"]).map(item => item.id), ["courtyard-scene"]);
  } finally { rmSync(workspace, {recursive: true, force: true}); }
});

test("artifact endpoint serves exact local bytes, refuses unknown paths and reports missing inputs", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "webcad-artifacts-"));
  const file = join(workspace, localTestArtifacts["house-base"].path);
  mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, '{"fixture":"exact bytes"}');
  const middleware = localTestArtifactMiddleware(workspace);
  const server = createServer((request, response) => middleware(request, response, () => { response.statusCode = 404; response.end(); }));
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as {port: number}).port;
    const get = (query: string) => fetch(`http://127.0.0.1:${port}/__local_test_artifact?${query}`);
    const success = await get("id=house-base");
    assert.equal(success.status, 200); assert.equal(await success.text(), readFileSync(file, "utf8"));
    assert.equal(success.headers.get("cache-control"), "no-store");
    assert.equal((await get("id=cafe-viewer")).status, 503);
    assert.equal((await get("id=../../package.json")).status, 404);
    assert.equal((await get("id=__proto__")).status, 404);
    assert.equal((await get("path=../../package.json")).status, 404);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(workspace, {recursive: true, force: true});
  }
});

test("synthetic candidate input is a preserved required fixture, independent of optional outputs", () => {
  const bytes = readFileSync(new URL("../fixtures/assembly/candidate-synthetic.webcad.json", import.meta.url));
  assert.equal(bytes.length, 9093);
  const document = JSON.parse(bytes.toString("utf8"));
  assert.ok(document.document.objects["stand-support"]);
  assert.ok(document.document.objects["stand-plate"]);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "97c68d363d2d383e6d2fe3cf295bf67248ba0e8c4ca66a22c812a6eab1d9a472");
});
