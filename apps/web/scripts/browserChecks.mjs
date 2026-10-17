import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
import { browserInputMiddleware, registerBrowserInput, browserCheckDiagnostics } from "./browserInput.mjs";

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
  const pages=["draftingWorkflow", "sketchCanvas", "pointWorkflow", "regionWorkflow", "deliveryWorkflow","trustWorkflow","variablesWorkflow","commandExperience","canvasIntent","directEditExperience","constrainedDrag","directTargetExperience","patternsWorkflow","contourWorkflow","basicEditWorkflow","dependencyWorkflow","constructionWorkflow","extendedCadWorkflow","curveWorkflow","contourTrimWorkflow","interactionRelations","artboardsWorkflow","componentsWorkflow","imageWorkflow","tiffImportWorkflow","imageSourceWorkflow","artboardPngWorkflow","artboardPdfWorkflow","imageResources","scenesWorkflow","dxfWorkflow","diameterWorkflow","angularWorkflow","copilotGateway","copilotContext","copilotApply","copilotQuery","sessionContinuity","historySelection"];
  pages.push("copilotEdit");
  pages.push("asymmetricChamfer");
  pages.push("lineArcFillet");
  pages.push("arcCorners");
  pages.push("openEndChamfer");
  pages.push("blockStretch");
  pages.push("sketchStretch");
  pages.push("dxfOcs");
  pages.push("numericPilot");
  pages.push("cadPilots");
  pages.push("modelPresentation");
  pages.push("modelDrawing");
  pages.push("modelSheetLayout");
  pages.push("modelSheetSet");
  pages.push("ellipse","spline","projectTabs","projectRecovery","projectManager");
  pages.push("drawingFrames");
  pages.push("workspaceSections");
  pages.push("frameLinks");
  pages.push("frameSheets");
  pages.push("frameStitches");
  pages.push("courtyardStudio","courtyardH1","courtyardEllipse","courtyardConic","courtyardIssue","sectionPresentation","ellipseSection","conicProjection");
  pages.push("architectureContent","architectureWall","floorTasks", "dxfPlacement", "dxfPreparation", "projectPerformance", "durableRecovery", "taskScope");
  pages.push("internalChamfer");
  pages.push("keyboardActivation");
  pages.push("wheelNavigation");
  pages.push("modelViews");
  pages.push("exchangeFixture");
  pages.push("shortcutGuide");
  pages.push("precisionInput");
  pages.push("artboardAnnotations");
  pages.push("draftingVisibility");
  pages.push("breakReferences");
  pages.push("explodeReferences");
  pages.push("explodeBlock");
  pages.push("convertEdge");
  pages.push("editSketchVertices");
  pages.push("hatchReconnection");
  pages.push("chainReconnection");
  pages.push("bindingReconnection");
  pages.push("b4ArcWorkflow");
  pages.push("b5WorkPlanes");
  pages.push("b5FaceSketch");
  pages.push("b5FaceCut");
  pages.push("b5FaceHole");
  pages.push("b5Shell");
  pages.push("x1ThreePoint");
  pages.push("x1RegularPolygon");
  pages.push("x1EndpointRadiusArc");
  pages.push("x3ConstructionReassign");
  pages.push("x3CircularIntersection");
  const selected=process.argv.find(value=>value.startsWith("--page="))?.slice(7);
  const sessionCount=process.argv.find(value=>value.startsWith("--session-count="))?.slice(16)??"0";
  if(!["0","1000"].includes(sessionCount)||sessionCount!=="0"&&selected!=="sessionContinuity")throw new Error("Invalid session fixture count");
  const benchmark=process.argv.includes("--benchmark"),label=process.argv.find(value=>value.startsWith("--label="))?.slice(8)??"sample";
  if((benchmark||selected==="imageResources")&&!/^[a-z0-9-]{1,32}$/.test(label))throw new Error("Invalid benchmark label");
  if(selected&&!pages.includes(selected))throw new Error("Unknown browser check page");
  const cases=benchmark?["mechanical","drawing"].flatMap(task=>[0,250,1000].map(count=>({page:"editPerformance",task,count}))):(selected?[selected]:pages).map(page=>({page}));
  const reports=[];
  for (const {page,task,count} of cases) {
    const run = randomUUID(), profile = await mkdtemp(join(tmpdir(), "agent-webcad-browser-check-"));
    let timer;
    const result = new Promise((resolve, reject) => {
      pending.set(run, resolve);
      timer = setTimeout(() => reject(new Error(`${page}: browser checks timed out`)), benchmark?180000:["courtyardH1","courtyardIssue","projectPerformance"].includes(page)?600000:["courtyardStudio","courtyardEllipse","courtyardConic"].includes(page)?300000:["architectureContent","architectureWall","floorTasks","taskScope","projectPerformance","projectTabs","projectRecovery","projectManager","dxfPreparation","spline","conicProjection","ellipseSection","sectionPresentation","frameStitches","frameSheets","frameLinks","workspaceSections","drawingFrames","ellipse","modelSheetSet","modelSheetLayout","modelDrawing","modelPresentation","cadPilots","dxfPlacement","numericPilot","openEndChamfer","b4ArcWorkflow","b5WorkPlanes","b5FaceSketch","b5FaceCut","b5FaceHole","exchangeFixture","dxfWorkflow","interactionRelations","angularWorkflow","copilotContext","copilotApply","copilotQuery","historySelection","imageWorkflow","tiffImportWorkflow","imageSourceWorkflow","artboardPngWorkflow","artboardPdfWorkflow","imageResources"].includes(page)?120000:60000);
    });
    const targetUrl = `http://127.0.0.1:${port}/tests/${page}.browser.html?auto=1&run=${run}${benchmark?`&task=${task}&count=${count}`:page==="sessionContinuity"?`&count=${sessionCount}`:""}${process.argv.includes("--artifacts")?"&artifacts=1":""}`;
    const closeInput = registerBrowserInput(run, profile, targetUrl);
    const child = spawn(executable, ["--headless", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1",
      ...(executable.toLowerCase().includes("msedge") ? ["--edge-skip-compat-layer-relaunch"] : []),
      ...(["architectureContent","architectureWall","floorTasks","taskScope","projectPerformance","projectTabs","projectRecovery","projectManager","dxfPreparation","spline","conicProjection","ellipseSection","sectionPresentation","courtyardIssue","courtyardConic","courtyardEllipse","courtyardH1","courtyardStudio","frameStitches","frameSheets","frameLinks","workspaceSections","drawingFrames","ellipse","modelSheetSet","modelSheetLayout","modelDrawing","modelPresentation","cadPilots","dxfPlacement","numericPilot","openEndChamfer","sketchStretch","dxfOcs","blockStretch","arcCorners","lineArcFillet","exchangeFixture","copilotEdit","asymmetricChamfer","internalChamfer","keyboardActivation","precisionInput","draftingVisibility","breakReferences","explodeReferences","explodeBlock","convertEdge","editSketchVertices","hatchReconnection","chainReconnection","bindingReconnection"].includes(page) ? ["--window-size=1440,1000"] : []),
      ...(["commandExperience","canvasIntent","directEditExperience","constrainedDrag","directTargetExperience","editPerformance","patternsWorkflow","contourWorkflow","basicEditWorkflow","dependencyWorkflow","constructionWorkflow","extendedCadWorkflow","curveWorkflow","contourTrimWorkflow","interactionRelations","angularWorkflow","artboardsWorkflow","componentsWorkflow","imageWorkflow","tiffImportWorkflow","imageSourceWorkflow","artboardPngWorkflow","artboardPdfWorkflow","imageResources","scenesWorkflow","dxfWorkflow","copilotGateway","copilotContext","copilotApply","copilotQuery","sessionContinuity","historySelection"].includes(page) ? ["--window-size=1440,1000"] : []),
      "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profile}`,
      targetUrl], { stdio: "ignore", windowsHide: true });
    child.on("error", (error) => pending.get(run)?.({ status: "failed", message: error.message }));
    console.log(`Running ${page}${benchmark?` ${task}/${count}`:""} in an isolated browser at http://127.0.0.1:${port}…`);
    try {
      const report = await result;
      reports.push({page,status:report.status,checks:report.checks,message:report.status === "passed" ? undefined : report.message});
      if (report.status === "passed") console.log(`${page}: ${report.checks} UI/Worker checks passed`);
      if (["imageWorkflow","artboardPngWorkflow","artboardPdfWorkflow","copilotQuery"].includes(page) && report.metrics) console.log(`${page} measurements: ${JSON.stringify(report.metrics)}`);
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
      if(page==="spline"){
        const directory=resolve(process.cwd(),"../../output/projects/spline-pilot");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["spline.pdf","spline.svg","spline.dxf","spline.webcad.json"].includes(name))throw Error("Unexpected spline artifact");await writeFile(join(directory,name),name.endsWith(".pdf")?Buffer.from(data,"base64"):data);}
      }
      if(page==="courtyardIssue"){
        const directory=resolve(process.cwd(),"../../output/projects/courtyard-commons/issued-r5");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,process.argv.includes("--p3-report")?"native-report-p3.json":process.argv.includes("--p2-report")?"native-report-p2.json":"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["axonometric.png","issue-plans.pdf","issue-elevations.pdf","issue-entry.pdf","issue-skylight.pdf"].includes(name))throw Error("Unexpected issued artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));}
      }
      if(page==="conicProjection"){
        const directory=resolve(process.cwd(),"../../output/projects/courtyard-commons/conic-hlr");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["conic-projection.svg","conic-projection.dxf","conic-projection.pdf"].includes(name))throw Error("Unexpected conic artifact");await writeFile(join(directory,name),name.endsWith(".pdf")?Buffer.from(data,"base64"):data);}
      }
      if(page==="ellipseSection"){
        const directory=resolve(process.cwd(),"../../output/projects/courtyard-commons/ellipse-section");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["ellipse-section.svg","ellipse-section.dxf","ellipse-section.pdf"].includes(name))throw Error("Unexpected ellipse section artifact");await writeFile(join(directory,name),name.endsWith(".pdf")?Buffer.from(data,"base64"):data);}
      }
      if(page==="sectionPresentation"){
        const directory=resolve(process.cwd(),"../../output/projects/courtyard-commons/h1-expression");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-small-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["section-expression.svg","section-expression.dxf","section-expression.pdf","section-expression-preview.png"].includes(name))throw Error("Unexpected section artifact");await writeFile(join(directory,name),name.endsWith(".svg")||name.endsWith(".dxf")?data:Buffer.from(data,"base64"));}
      }
      if(["courtyardStudio","courtyardH1","courtyardEllipse","courtyardConic"].includes(page)){
        const directory=resolve(process.cwd(),page==="courtyardConic"?"../../output/projects/courtyard-commons/conic-hlr":page==="courtyardEllipse"?"../../output/projects/courtyard-commons/ellipse-section":page==="courtyardH1"?"../../output/projects/courtyard-commons/h1-expression":"../../output/projects/courtyard-commons/p01-fixed");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,["courtyardEllipse","courtyardConic"].includes(page)?"native-project-report.json":"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){
          if(!["courtyard-commons.pdf","axonometric.png"].includes(name))throw Error("Unexpected studio artifact");
          await writeFile(join(directory,name),Buffer.from(data,"base64"));
        }
      }
      if(process.argv.includes("--artifacts") && ["frameStitches","frameSheets","frameLinks","workspaceSections","drawingFrames","ellipse","modelSheetSet","modelSheetLayout","modelDrawing","deliveryWorkflow","artboardPdfWorkflow"].includes(page) && report.artifacts){
        const directory=resolve(process.cwd(),"../../output/pdf");await mkdir(directory,{recursive:true});
        for(const [name,data] of Object.entries(report.artifacts)){
          if(!["continuous-frames.pdf","continuous-frames.svg","continuous-frames.dxf","frame-sheets.pdf","frame-sheets-page-1.svg","frame-sheets-page-1.dxf","frame-links.pdf","frame-links.svg","frame-links.dxf","workspace-sections.pdf","workspace-sections.svg","drawing-frame.pdf","drawing-frame.svg","drawing-frame.dxf","ellipse.pdf","ellipse.svg","ellipse.dxf","sheet-set.pdf","sheet-set-page-1.svg","sheet-set-page-2.svg","sheet-set-page-3.svg","automatic-sheet.pdf","automatic-sheet.svg","two-workflows.pdf","mechanical-sheet.dxf","architectural-sheet.dxf","mechanical-sheet.svg","architectural-sheet.svg","model-sheet.pdf","room-plan-1-50.pdf","room-plan.dxf","room-symbols.dxf","room-plan.webcad.json","room-plan.plot.json","artboard-export.pdf"].includes(name))throw new Error("Unexpected test artifact name");
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
      if(page==="floorTasks"){const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});await writeFile(join(directory,"floor-tasks-native-report.json"),JSON.stringify(report,null,2));}
      if(page==="taskScope"){const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});await writeFile(join(directory,"ui-p2-c-task-scope-native-report.json"),JSON.stringify(report,null,2));}
      if(page==="durableRecovery"){const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});await writeFile(join(directory,"ui-p2-s-durable-native-report.json"),JSON.stringify(report,null,2));}
      if(page==="projectPerformance"){ const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});await writeFile(join(directory,"ui-p2-r5-native-report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report.metrics)); }
      if(page==="architectureContent"){
        const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});await writeFile(join(directory,"architecture-content-native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(report.artifacts?.["fitout.webcad.json"]){const projects=resolve(process.cwd(),"../../output/projects/architectural-fitout");await mkdir(projects,{recursive:true});await writeFile(join(projects,"fitout.webcad.json"),report.artifacts["fitout.webcad.json"]);}
      }
      if(page==="architectureWall"){
        const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"architecture-wall-native-report.json"),JSON.stringify(report,null,2));
      }
      if(page==="dxfPreparation"){
        const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"floor-plan-preparation-native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        for(const [name,base64] of Object.entries(report.artifacts??{})){
          if(name!=="floor-plan-preparation-2026-10-14.png")throw Error("Unexpected floor plan artifact");
          const images=resolve(process.cwd(),"../../output/images");await mkdir(images,{recursive:true});await writeFile(join(images,name),Buffer.from(base64,"base64"));
        }
      }
      if(page==="projectManager"){
        const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"project-manager-native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data]of Object.entries(report.artifacts??{})){
          if(!["project-manager-storage-2026-10-14.png","exported-project.webcad.json"].includes(name))throw Error("Unexpected project manager artifact");
          const target=resolve(process.cwd(),name.endsWith(".png")?"../../output/images":"../../output/projects/workspace-management");await mkdir(target,{recursive:true});
          await writeFile(join(target,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);
        }
      }
      if (report.status !== "passed") throw new Error(report.message);
    } catch(error) {
      try { console.error("Browser failure state:",JSON.stringify(await browserCheckDiagnostics(profile,targetUrl))); } catch { /* Preserve the original failure if the browser exited. */ }
      if(!process.argv.includes("--continue-on-failure"))throw error;
      if(!reports.some(r=>r.page===page))reports.push({page,status:"failed",message:String(error)});
      console.error(`${page}: ${error.message}`);
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
  if(process.argv.includes("--continue-on-failure")){
    const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});
    await writeFile(join(directory,"browser-audit.json"),JSON.stringify(reports,null,2));
    if(reports.some(r=>r.status!=="passed"))process.exitCode=1;
  }
} finally { await server.close(); }



