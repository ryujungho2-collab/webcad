import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
import { browserInputMiddleware, registerBrowserInput } from "./browserInput.mjs";

const executable = process.env.CAD_TEST_BROWSER ?? [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium", "/usr/bin/google-chrome",
].find(existsSync);
if (!executable) throw new Error("Set CAD_TEST_BROWSER to a Chromium browser executable.");
const pending = new Map();
const reportMiddleware = (request, response) => {
  const run = new URL(request.url, "http://localhost").searchParams.get("run");
  if (request.method !== "POST" || !pending.has(run)) { response.statusCode = 404; response.end(); return; }
  let body = "";
  request.on("data", (chunk) => { body += chunk; if (body.length > 4000000) request.destroy(); });
  request.on("end", () => { try { pending.get(run)(JSON.parse(body)); response.end("ok"); } catch { response.statusCode = 400; response.end(); } });
};
const server = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error",
  plugins: [{ name: "browser-check-report", configureServer(server) { server.middlewares.use("/__browser_result", reportMiddleware); server.middlewares.use("/__browser_input", browserInputMiddleware); } }],
});
await server.listen();
const port = server.httpServer.address().port;
try {
  const pages=["draftingWorkflow", "sketchCanvas", "pointWorkflow", "regionWorkflow", "deliveryWorkflow","trustWorkflow","variablesWorkflow","commandExperience","canvasIntent","directEditExperience","constrainedDrag","directTargetExperience","patternsWorkflow","contourWorkflow","basicEditWorkflow","dependencyWorkflow","constructionWorkflow","extendedCadWorkflow","curveWorkflow","contourTrimWorkflow","interactionRelations","artboardsWorkflow","componentsWorkflow","imageWorkflow","tiffImportWorkflow","imageSourceWorkflow","artboardPngWorkflow","artboardPdfWorkflow","imageResources","scenesWorkflow","dxfWorkflow","diameterWorkflow","copilotGateway","sessionContinuity","historySelection"];
  const selected=process.argv.find(value=>value.startsWith("--page="))?.slice(7);
  const sessionCount=process.argv.find(value=>value.startsWith("--session-count="))?.slice(16)??"0";
  if(!["0","1000"].includes(sessionCount)||sessionCount!=="0"&&selected!=="sessionContinuity")throw new Error("Invalid session fixture count");
  const benchmark=process.argv.includes("--benchmark"),label=process.argv.find(value=>value.startsWith("--label="))?.slice(8)??"sample";
  if((benchmark||selected==="imageResources")&&!/^[a-z0-9-]{1,32}$/.test(label))throw new Error("Invalid benchmark label");
  if(selected&&!pages.includes(selected))throw new Error("Unknown browser check page");
  const cases=benchmark?["mechanical","drawing"].flatMap(task=>[0,250,1000].map(count=>({page:"editPerformance",task,count}))):(selected?[selected]:pages).map(page=>({page}));
  for (const {page,task,count} of cases) {
    const run = randomUUID(), profile = await mkdtemp(join(tmpdir(), "agent-webcad-browser-check-"));
    let timer;
    const result = new Promise((resolve, reject) => {
      pending.set(run, resolve);
      timer = setTimeout(() => reject(new Error(`${page}: browser checks timed out`)), benchmark?180000:["dxfWorkflow","interactionRelations","historySelection","imageWorkflow","tiffImportWorkflow","imageSourceWorkflow","artboardPngWorkflow","artboardPdfWorkflow","imageResources"].includes(page)?120000:60000);
    });
    const targetUrl = `http://127.0.0.1:${port}/tests/${page}.browser.html?auto=1&run=${run}${benchmark?`&task=${task}&count=${count}`:page==="sessionContinuity"?`&count=${sessionCount}`:""}${process.argv.includes("--artifacts")?"&artifacts=1":""}`;
    const closeInput = registerBrowserInput(run, profile, targetUrl);
    const child = spawn(executable, ["--headless", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1",
      ...(executable.toLowerCase().includes("msedge") ? ["--edge-skip-compat-layer-relaunch"] : []),
      ...(["commandExperience","canvasIntent","directEditExperience","constrainedDrag","directTargetExperience","editPerformance","patternsWorkflow","contourWorkflow","basicEditWorkflow","dependencyWorkflow","constructionWorkflow","extendedCadWorkflow","curveWorkflow","contourTrimWorkflow","interactionRelations","artboardsWorkflow","componentsWorkflow","imageWorkflow","tiffImportWorkflow","imageSourceWorkflow","artboardPngWorkflow","artboardPdfWorkflow","imageResources","scenesWorkflow","dxfWorkflow","copilotGateway","sessionContinuity","historySelection"].includes(page) ? ["--window-size=1440,1000"] : []),
      "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profile}`,
      targetUrl], { stdio: "ignore", windowsHide: true });
    child.on("error", (error) => pending.get(run)?.({ status: "failed", message: error.message }));
    console.log(`Running ${page}${benchmark?` ${task}/${count}`:""} in an isolated browser at http://127.0.0.1:${port}…`);
    try {
      const report = await result;
      if (report.status === "passed") console.log(`${page}: ${report.checks} UI/Worker checks passed`);
      if (["imageWorkflow","artboardPngWorkflow","artboardPdfWorkflow"].includes(page) && report.metrics) console.log(`${page} measurements: ${JSON.stringify(report.metrics)}`);
      if(page==="imageResources"&&report.metrics){
        const directory=resolve(process.cwd(),"../../output/benchmarks");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,`g3-resources-${label}.json`),JSON.stringify(report.metrics,null,2));console.log(JSON.stringify(report.metrics));
      }
      if(page==="sessionContinuity"&&report.metrics){
        const directory=resolve(process.cwd(),"../../output/benchmarks");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,`g1-session-${sessionCount}.json`),JSON.stringify({at:new Date().toISOString(),browser:executable,renderer:"SwiftShader",...report.metrics},null,2));
        console.log(JSON.stringify(report.metrics));
      }
      if(benchmark){
        const directory=resolve(process.cwd(),"../../output/benchmarks");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,`${label}-${task}-${count}.json`),JSON.stringify({label,at:new Date().toISOString(),platform:process.platform,browser:executable,renderer:"SwiftShader",server:"Vite development; local HTTP; warmed Worker",...report},null,2));
        console.log(JSON.stringify(report.metrics?.summary??report.message));
      }
      if(process.argv.includes("--artifacts") && ["deliveryWorkflow","artboardPdfWorkflow"].includes(page) && report.artifacts){
        const directory=resolve(process.cwd(),"../../output/pdf");await mkdir(directory,{recursive:true});
        for(const [name,data] of Object.entries(report.artifacts)){
          if(!["room-plan-1-50.pdf","room-plan.dxf","room-symbols.dxf","room-plan.webcad.json","room-plan.plot.json","artboard-export.pdf"].includes(name))throw new Error("Unexpected test artifact name");
          await writeFile(join(directory,name),name.endsWith(".pdf")?Buffer.from(data,"base64"):data);
        }
      }
      if(process.argv.includes("--artifacts")&&["canvasIntent","directEditExperience","constrainedDrag","directTargetExperience","patternsWorkflow","contourWorkflow","basicEditWorkflow","dependencyWorkflow","constructionWorkflow","extendedCadWorkflow","curveWorkflow","contourTrimWorkflow","artboardsWorkflow","imageWorkflow"].includes(page)&&report.artifacts){
        const directory=resolve(process.cwd(),"../../output/images");await mkdir(directory,{recursive:true});
        for(const [name,data] of Object.entries(report.artifacts)){
          if(!["canvas-dimension-preview.png","canvas-dimension-conflict.png","canvas-drag-preview.png","canvas-drag-conflict.png","canvas-motion-projection.png","canvas-motion-orbit.png","canvas-motion-locked.png","canvas-target-keyboard.png","canvas-target-precision.png","canvas-target-overlap.png","cad-patterns-preview.png","cad-contour-preview.png","cad-stretch-preview.png","cad-connected-constraints.png","cad-construction-preview.png","cad-construction-cascade.png","cad-extended-relations.png","cad-snap-settings.png","cad-curve-offset.png","cad-curve-fillet.png","cad-trim-middle.png","cad-trim-closed.png","cad-artboards-review.png","cad-image-review.png"].includes(name))throw new Error("Unexpected test screenshot name");
          await writeFile(join(directory,name),Buffer.from(data,"base64"));
        }
      }
      if (report.status !== "passed") throw new Error(report.message);
    } finally {
      clearTimeout(timer); pending.delete(run);
      await closeInput();
      if (process.platform === "win32" && child.pid) {
        await new Promise((resolve) => { const kill = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); kill.once("exit", resolve); kill.once("error", resolve); });
      } else child.kill();
      // Only the uniquely created temporary test profile is removed.
      try { await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
      catch (error) { console.warn(`Temporary browser profile cleanup deferred (${error.code}); test result is preserved.`); }
    }
  }
} finally { await server.close(); }
