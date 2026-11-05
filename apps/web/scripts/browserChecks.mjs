import {mcpBrowserClientFixture} from "./mcpBrowserClient.mjs";
import {gunzipSync} from "node:zlib";
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
const mcpFixture=mcpBrowserClientFixture(pending);
const reportMiddleware = (request, response) => {
  const run = new URL(request.url, "http://localhost").searchParams.get("run");
  if (request.method !== "POST" || !pending.has(run)) { response.statusCode = 404; response.end(); return; }
  const chunks=[];let received=0;
  request.on("data", (chunk) => { chunks.push(chunk);received+=chunk.length;if(received>64000000)request.destroy(); });
  request.on("end", () => { try {const raw=Buffer.concat(chunks),body=request.headers["content-encoding"]==="gzip"?gunzipSync(raw,{maxOutputLength:192000000}):raw;pending.get(run)(JSON.parse(body.toString("utf8"))); response.end("ok"); } catch { response.statusCode = 400; response.end(); } });
};
const server = await createServer({ cacheDir: process.env.CAD_TEST_CACHE_DIR ?? resolve(process.cwd(),"node_modules/.vite-browser-checks"), server: { host: "127.0.0.1", port: 0 }, logLevel: "error",
  plugins: [{ name: "browser-check-report", configureServer(server) { server.middlewares.use("/__browser_result", reportMiddleware); server.middlewares.use("/__browser_input", browserInputMiddleware); server.middlewares.use((req,res,next)=>void mcpFixture.middleware(req,res,next)); } }],
});
await server.listen();
const port = server.httpServer.address().port;
try {
  const pages=["draftingWorkflow", "sketchCanvas", "pointWorkflow", "regionWorkflow", "deliveryWorkflow","trustWorkflow","variablesWorkflow","commandExperience","canvasIntent","directEditExperience","constrainedDrag","directTargetExperience","patternsWorkflow","contourWorkflow","basicEditWorkflow","dependencyWorkflow","constructionWorkflow","extendedCadWorkflow","curveWorkflow","contourTrimWorkflow","interactionRelations","artboardsWorkflow","componentsWorkflow","imageWorkflow","tiffImportWorkflow","imageSourceWorkflow","artboardPngWorkflow","artboardPdfWorkflow","imageResources","scenesWorkflow","dxfWorkflow","diameterWorkflow","angularWorkflow","copilotGateway","copilotContext","copilotApply","copilotQuery","sessionContinuity","historySelection"];
  pages.push("copilotEdit");
  pages.push("copilotPlanning","loftEdit","meshEditing","polygonEditing","geometryNodes","sculpt","hybridGeometry","planarReconstruction");
  pages.push("copilotEnclosure","copilot2d3d","copilotConversation","copilotSolid");
  pages.push("cadTools","mcpBridge","gardenHouse","houseFacade","houseLayout","sharedToolHandoff","lightBracketHandoff","enclosureHandoff","ductHandoff","handleHandoff","kioskHandoff","lampHandoff","chairHandoff","pavilionHandoff","courtyardPavilion","courtyardPresentation","basinHandoff");
  pages.push("cadToolsAdvanced");
  pages.push("largeCafe","largeCafe3d","flowCourt","designStudy","localCopilot","graduationCopilot","nativeArchitectureCopilot");
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
  pages.push("residentialRestoration","externalCivilSpeed","dxfImportProgress","externalCivilStyle","externalCivil","residentialMeasurements","measurementLayout","savedMeasurementPlacement","savedMeasurements","selectedDistance","brepDistance","hoverDistance","canvasScale","canvasFlex","canvasHierarchy","projectTree","library","outputPreflight");
  pages.push("ellipse","spline","curveDxf","kernelResources","projectTabs","projectBundle","projectHome","residentialRestoration","externalCivilSpeed","dxfImportProgress","externalCivilStyle","externalCivil","residentialMeasurements","measurementLayout","savedMeasurementPlacement","savedMeasurements","selectedDistance","brepDistance","hoverDistance","canvasScale","canvasFlex","canvasHierarchy","projectTree","library","outputPreflight","accessibilityInput","inspectorProperties","selectionToolbar","projectTabNavigation","projectComparison","projectRecovery","projectManager");
  pages.push("drawingFrames");
  pages.push("workspaceSections");
  pages.push("frameLinks");
  pages.push("frameSheets");
  pages.push("frameStitches");
  pages.push("courtyardStudio","courtyardH1","courtyardEllipse","courtyardConic","courtyardIssue","curveHatch","sectionPresentation","ellipseSection","conicProjection");
  pages.push("residentialTask","residentialExtended","architectureContent","architectureWall","floorTasks", "dxfPlacement", "dxfPreparation", "projectPerformance", "durableRecovery", "taskScope");
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
  pages.push("assemblyCandidateSearch","assemblyPlacement","simready","simreadyB1");
  pages.push("assembly","assemblyLifecycle","assemblyMotion","interferenceTriage","assemblyDrive");
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
  pages.push("coordinationReview");
  const selected=process.argv.find(value=>value.startsWith("--page="))?.slice(7);
  const sessionCount=process.argv.find(value=>value.startsWith("--session-count="))?.slice(16)??"0";
  if(!["0","1000"].includes(sessionCount)||sessionCount!=="0"&&selected!=="sessionContinuity")throw new Error("Invalid session fixture count");
  const benchmark=process.argv.includes("--benchmark"),label=process.argv.find(value=>value.startsWith("--label="))?.slice(8)??"sample";
  if((benchmark||selected==="imageResources")&&!/^[a-z0-9-]{1,32}$/.test(label))throw new Error("Invalid benchmark label");
  if(selected&&!pages.includes(selected))throw new Error("Unknown browser check page");
  const cases=benchmark?["mechanical","drawing"].flatMap(task=>[0,250,1000].map(count=>({page:"editPerformance",task,count}))):(selected?[selected]:[...new Set(pages)]).map(page=>({page}));
  const reports=[];
  for (const {page,task,count} of cases) {
    const run = randomUUID(), profile = await mkdtemp(join(tmpdir(), "agent-webcad-browser-check-"));
    let timer;
    const result = new Promise((resolve, reject) => {
      pending.set(run, resolve);
      timer = setTimeout(() => reject(new Error(`${page}: browser checks timed out`)), ["sculpt","polygonEditing","geometryNodes","hybridGeometry","planarReconstruction"].includes(page)?180000:page==="lightBracketHandoff"?300000:["houseFacade","houseLayout","basinHandoff"].includes(page)?900000:benchmark||["handleHandoff","kioskHandoff","lampHandoff","chairHandoff","pavilionHandoff","courtyardPavilion","courtyardPresentation","basinHandoff","ductHandoff","enclosureHandoff","sharedToolHandoff","gardenHouse","largeCafe3d","flowCourt","designStudy","localCopilot","graduationCopilot","nativeArchitectureCopilot","mcpBridge","gardenHouse"].includes(page)?600000:["residentialRestoration","externalCivilSpeed","dxfImportProgress","externalCivilStyle","externalCivil","outputPreflight","kernelResources","curveHatch","residentialTask","residentialExtended","courtyardH1","courtyardIssue","projectPerformance"].includes(page)?600000:["courtyardStudio","courtyardEllipse","courtyardConic"].includes(page)?300000:["architectureContent","architectureWall","floorTasks","taskScope","projectPerformance","projectTabs","projectBundle","projectHome","residentialRestoration","externalCivilSpeed","dxfImportProgress","externalCivilStyle","externalCivil","residentialMeasurements","measurementLayout","savedMeasurementPlacement","savedMeasurements","selectedDistance","brepDistance","hoverDistance","canvasScale","canvasFlex","canvasHierarchy","projectTree","library","outputPreflight","accessibilityInput","inspectorProperties","selectionToolbar","projectTabNavigation","projectComparison","projectRecovery","projectManager","dxfPreparation","spline","curveDxf","kernelResources","conicProjection","ellipseSection","curveHatch","sectionPresentation","frameStitches","frameSheets","frameLinks","workspaceSections","drawingFrames","ellipse","modelSheetSet","modelSheetLayout","modelDrawing","modelPresentation","cadPilots","dxfPlacement","numericPilot","openEndChamfer","b4ArcWorkflow","b5WorkPlanes","b5FaceSketch","b5FaceCut","b5FaceHole","exchangeFixture","dxfWorkflow","interactionRelations","angularWorkflow","copilotContext","copilotApply","copilotQuery","historySelection","imageWorkflow","tiffImportWorkflow","imageSourceWorkflow","artboardPngWorkflow","artboardPdfWorkflow","imageResources"].includes(page)?120000:60000);
    });
    const targetUrl = `http://127.0.0.1:${port}/tests/${page}.browser.html?auto=1&run=${run}${benchmark?`&task=${task}&count=${count}`:page==="sessionContinuity"?`&count=${sessionCount}`:""}${process.argv.includes("--artifacts")?"&artifacts=1":""}`;
    const closeInput = registerBrowserInput(run, profile, targetUrl);
    const child = spawn(executable, ["--headless", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1",
        ...(page==="lightBracketHandoff"?["--window-size=1440,1000"]:[]),
      ...(executable.toLowerCase().includes("msedge") ? ["--edge-skip-compat-layer-relaunch"] : []),
      ...(["handleHandoff","kioskHandoff","lampHandoff","chairHandoff","pavilionHandoff","courtyardPavilion","courtyardPresentation","basinHandoff","ductHandoff","enclosureHandoff","sharedToolHandoff","copilotEnclosure","copilot2d3d","copilotConversation","copilotSolid","cadTools","cadToolsAdvanced","largeCafe","largeCafe3d","flowCourt","designStudy","localCopilot","graduationCopilot","nativeArchitectureCopilot","mcpBridge","gardenHouse","houseFacade","houseLayout"].includes(page) ? ["--window-size=1440,1000"] : []),
      ...(["residentialTask","residentialExtended","architectureContent","architectureWall","floorTasks","taskScope","projectPerformance","projectTabs","projectBundle","projectHome","residentialRestoration","externalCivilSpeed","dxfImportProgress","externalCivilStyle","externalCivil","residentialMeasurements","measurementLayout","savedMeasurementPlacement","savedMeasurements","selectedDistance","brepDistance","hoverDistance","canvasScale","canvasFlex","canvasHierarchy","projectTree","library","outputPreflight","accessibilityInput","inspectorProperties","selectionToolbar","projectTabNavigation","projectComparison","projectRecovery","projectManager","dxfPreparation","spline","curveDxf","kernelResources","conicProjection","ellipseSection","curveHatch","sectionPresentation","courtyardIssue","courtyardConic","courtyardEllipse","courtyardH1","courtyardStudio","frameStitches","frameSheets","frameLinks","workspaceSections","drawingFrames","ellipse","modelSheetSet","modelSheetLayout","modelDrawing","modelPresentation","cadPilots","dxfPlacement","numericPilot","openEndChamfer","sketchStretch","dxfOcs","blockStretch","arcCorners","lineArcFillet","exchangeFixture","copilotEdit","asymmetricChamfer","internalChamfer","keyboardActivation","precisionInput","draftingVisibility","breakReferences","explodeReferences","explodeBlock","convertEdge","editSketchVertices","hatchReconnection","chainReconnection","bindingReconnection"].includes(page) ? ["--window-size=1440,1000"] : []),
      ...(["commandExperience","canvasIntent","directEditExperience","constrainedDrag","directTargetExperience","editPerformance","patternsWorkflow","contourWorkflow","basicEditWorkflow","dependencyWorkflow","constructionWorkflow","extendedCadWorkflow","curveWorkflow","contourTrimWorkflow","interactionRelations","angularWorkflow","artboardsWorkflow","componentsWorkflow","imageWorkflow","tiffImportWorkflow","imageSourceWorkflow","artboardPngWorkflow","artboardPdfWorkflow","imageResources","scenesWorkflow","dxfWorkflow","copilotGateway","copilotContext","copilotApply","copilotQuery","sessionContinuity","historySelection"].includes(page) ? ["--window-size=1440,1000"] : []),
      ...(["assemblyCandidateSearch","assemblyPlacement","simreadyB1","simready","assembly","assemblyLifecycle","assemblyMotion","interferenceTriage","assemblyDrive","b5WorkPlanes","copilotPlanning","loftEdit","meshEditing","polygonEditing","geometryNodes","sculpt","hybridGeometry","planarReconstruction"].includes(page) ? ["--window-size=1440,1000"] : []),
      ...(process.argv.includes("--hardware-gpu")?["--use-angle=d3d11","--ignore-gpu-blocklist"]:["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]), `--user-data-dir=${profile}`,
      targetUrl], { stdio: "ignore", windowsHide: true });
    child.on("error", (error) => pending.get(run)?.({ status: "failed", message: error.message }));
    console.log(`Running ${page}${benchmark?` ${task}/${count}`:""} in an isolated browser at http://127.0.0.1:${port}`);
    try {
      const report = await result;
      reports.push({page,status:report.status,checks:report.checks,message:report.status === "passed" ? undefined : report.message});
      if (report.status === "passed") console.log(`${page}: ${report.checks} UI/Worker checks passed`);
      if(page==="sculpt"){const directory=resolve(process.cwd(),"../../output/verification/sculpt-phase-4");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify(report,null,2));}
      if(page==="geometryNodes"){const directory=resolve(process.cwd(),"../../output/verification/geometry-nodes-phase-3");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify(report,null,2));}
      if(page==="loftEdit"){
        const directory=resolve(process.cwd(),"../../output/verification/loft-edit");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["loft.png","loft.webcad.json"].includes(name))throw Error("Unexpected loft artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="copilotPlanning"){
        const directory=resolve(process.cwd(),"../../output/verification/copilot-planning");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["lid.png","lid.webcad.json"].includes(name))throw Error("Unexpected planning artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="gardenHouse"||page==="houseFacade"||page==="houseLayout"){
        const directory=resolve(process.cwd(),"../../output/projects/lightwell-house");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["house.webcad.json","house.step","house.glb","design.json","mcp-trace.json","native-house.png","B101.svg","A101.svg","A102.svg","A201.svg","A202.svg","B101-native.svg","A101-native.svg","A102-native.svg","B101.dxf","A101.dxf","A102.dxf","A201.dxf","A202.dxf"].includes(name))throw Error("Unexpected house task artifact");await writeFile(join(directory,name),name.endsWith(".png")||name.endsWith(".glb")?Buffer.from(data,"base64"):data);}
      }
      if(page==="courtyardPresentation"){
        const directory=resolve(process.cwd(),"../../output/projects/courtyard-pavilion");await mkdir(directory,{recursive:true});await writeFile(join(directory,"presentation-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["exterior.png","arrival.png","interior.png","roof-plan.png","ground-plan.png"].includes(name))throw Error("Unexpected pavilion presentation artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));}
      }
      if(page==="courtyardPavilion"){
        const directory=resolve(process.cwd(),"../../output/projects/courtyard-pavilion");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["pavilion.webcad.json","pavilion-drawings.webcad.json","mesh-scene.json","partial.webcad.json","pavilion.step","handoff.json","viewport.png","courtPlan.dxf","courtPlan.svg","courtSection.dxf","courtSection.svg","diagnostics.json"].includes(name))throw Error("Unexpected courtyard artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="pavilionHandoff"){
        const directory=resolve(process.cwd(),"../../output/projects/spatial-pavilion");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["pavilion.webcad.json","pavilion.step","handoff.json","viewport.png","pavilionPlan.dxf","pavilionPlan.svg","pavilionSection.dxf","pavilionSection.svg","spatialPath.dxf","diagnostics.json"].includes(name))throw Error("Unexpected basin artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="chairHandoff"){
        const directory=resolve(process.cwd(),"../../output/projects/c2-lounge-chair");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["chair.webcad.json","chair.step","handoff.json","viewport.png","chairProfile.dxf","chairProfile.svg","chairSection.dxf","chairSection.svg"].includes(name))throw Error("Unexpected basin artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="lampHandoff"){
        const directory=resolve(process.cwd(),"../../output/projects/curve-lamp");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["lamp.webcad.json","lamp.step","handoff.json","viewport.png","stemPath.dxf","stemPath.svg"].includes(name))throw Error("Unexpected basin artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="basinHandoff"){
        const directory=resolve(process.cwd(),"../../output/projects/organic-basin");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["basin.webcad.json","basin.step","handoff.json","viewport.png","basinPipeFit.svg","basinPipeFit.dxf","basinSeatFit.svg","basinSeatFit.dxf","basinPlan.svg","basinPlan.dxf","basinSection.svg","basinSection.dxf"].includes(name))throw Error("Unexpected basin artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="kioskHandoff"){
        const directory=resolve(process.cwd(),"../../output/projects/organic-kiosk");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["kiosk.webcad.json","kiosk.step","handoff.json","viewport.png","kioskPlatformPlan.svg","kioskPlatformPlan.dxf","kioskPlan.svg","kioskPlan.dxf","kioskSection.svg","kioskSection.dxf"].includes(name))throw Error("Unexpected kiosk task artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="handleHandoff"){
        const directory=resolve(process.cwd(),"../../output/projects/arched-handle");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["handle.webcad.json","handle.step","handoff.json","viewport.png","handleFootFit.svg","handleFootFit.dxf","handlePlateFit.svg","handlePlateFit.dxf","handleLong.svg","handleLong.dxf"].includes(name))throw Error("Unexpected handle task artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="ductHandoff"){
        const directory=resolve(process.cwd(),"../../output/projects/eccentric-reducer");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["duct.webcad.json","duct.step","handoff.json","viewport.png","ductInlet.svg","ductInlet.dxf","ductOutlet.svg","ductOutlet.dxf","ductLong.svg","ductLong.dxf"].includes(name))throw Error("Unexpected duct task artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="enclosureHandoff"){
        const directory=resolve(process.cwd(),"../../output/projects/instrument-enclosure");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["enclosure.webcad.json","enclosure.step","handoff.json","viewport.png","housingUpper.svg","housingUpper.dxf","housingSection.svg","housingSection.dxf","coverPlan.svg","coverPlan.dxf"].includes(name))throw Error("Unexpected enclosure task artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="lightBracketHandoff"){
        const directory=resolve(process.cwd(),"../../output/projects/light-sensor-bracket");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["bracket.webcad.json","bracket-model.webcad.json","bracket.step","handoff.json","viewport.png","reopen-expected.json","reopen-actual.json"].includes(name))throw Error("Unexpected light bracket artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="sharedToolHandoff"){
        const directory=resolve(process.cwd(),"../../output/projects/sensor-bracket");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["bracket.webcad.json","bracket.step","handoff.json","viewport.png","reopen-expected.json","reopen-actual.json"].includes(name))throw Error("Unexpected handoff artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="mcpBridge"){
        const directory=resolve(process.cwd(),"../../output/verification/cad-mcp");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["mcp-native-result.png","mcp-native-result.webcad.json"].includes(name))throw Error("Unexpected MCP artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="nativeArchitectureCopilot"){
        const directory=resolve(process.cwd(),"../../output/projects/native-architecture-lesson");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["native-room.png","linked-cuts.png","native-room.webcad.json","native-room.step","actual-plan.svg","actual-section.svg","actual-plan.dxf","actual-section.dxf","path-clearance.json"].includes(name))throw Error("Unexpected native architectural artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="graduationCopilot"){
        const directory=resolve(process.cwd(),"../../output/projects/repair-school");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["native-overview.png","browser-created.webcad.json"].includes(name))throw Error("Unexpected academic task artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="localCopilot"){
        const directory=resolve(process.cwd(),"../../output/verification/local-copilot");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(name!=="intent-refinement.png")throw Error("Unexpected local copilot artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));}
      }
      if(page==="designStudy"){
        const directory=resolve(process.cwd(),"../../output/verification/design-study");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["curves.png","solid.png","gateway.png","model.webcad.json","design-study.json"].includes(name))throw Error("Unexpected design study artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="flowCourt"){
 const directory=resolve(process.cwd(),"../../output/projects/flow-court");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
 if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["flow-court.pdf","native-plan.png","native-curve-layout.png","G001.png","A001.png","A101.png","A102.png","A201.png","A301.png","A401.png","D501.png","S001.png"].includes(name))throw Error("Unexpected flow-court artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));}
 }
 if(page==="largeCafe3d"){
        const directory=resolve(process.cwd(),"../../output/projects/large-cafe/3d");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["cad-overview.png","model-overview.png","model-1f.png","model-2f.png","model-separated.png","model-section.png","model-interior.png"].includes(name))throw Error("Unexpected cafe 3D artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));}
      }
      if(page==="largeCafe"){
        const directory=resolve(process.cwd(),"../../output/projects/large-cafe");await mkdir(directory,{recursive:true});await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["large-cafe.pdf","large-cafe.webcad.json","viewport.png","A101.png","A102.png","A201.png","A202.png","A301.png","A401.png","A501.png","D601.png","E101.png","G000.png","P101.png","S001.png"].includes(name))throw Error("Unexpected cafe artifact");await writeFile(join(directory,name),name.endsWith(".json")?data:Buffer.from(data,"base64"));}
      }
      if(page==="copilotEnclosure"){
        const directory=resolve(process.cwd(),"../../output/verification/copilot-enclosure");await mkdir(directory,{recursive:true});await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["model.webcad.json","model.step","sketch-2d.png","enclosure-3d.png"].includes(name))throw Error("Unexpected enclosure artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="copilot2d3d"){
        const directory=resolve(process.cwd(),"../../output/verification/copilot-2d3d");await mkdir(directory,{recursive:true});await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["model.webcad.json","model.step","sketch-2d.png","model-3d.png"].includes(name))throw Error("Unexpected 2D-3D artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="copilotConversation"){
        const directory=resolve(process.cwd(),"../../output/verification/copilot-conversation");await mkdir(directory,{recursive:true});await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["plate.webcad.json","plate.step","viewport.png"].includes(name))throw Error("Unexpected conversation artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="copilotSolid"){
        const directory=resolve(process.cwd(),"../../output/verification/copilot-solid");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data]of Object.entries(report.artifacts??{})){if(!["plate.webcad.json","viewport.png","plate.step"].includes(name))throw Error("Unexpected Copilot solid artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="cadTools"||page==="cadToolsAdvanced"){
        const directory=resolve(process.cwd(),page==="cadTools"?"../../output/verification/cad-tools":"../../output/verification/cad-tools-advanced");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const[name,data]of Object.entries(report.artifacts??{})){if(!["model.webcad.json","model.step","viewport.png"].includes(name))throw Error("Unexpected CAD tools artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
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
      if(page==="residentialRestoration"){
        const directory=resolve(process.cwd(),"../../output/external/civil-projects/restoration-01");await mkdir(directory,{recursive:true});await writeFile(join(directory,"native-report.json"),JSON.stringify(report,null,2));
      }
      if(page==="externalCivilSpeed"){
        const directory=resolve(process.cwd(),"../../output/external/civil-projects/phase-03");await mkdir(directory,{recursive:true});await writeFile(join(directory,"speed-report.json"),JSON.stringify(report,null,2));
      }
      if(page==="dxfImportProgress"){
        const directory=resolve(process.cwd(),"../../output/verification/dxf-import-progress");await mkdir(directory,{recursive:true});await writeFile(join(directory,"native-report.json"),JSON.stringify(report,null,2));
      }
      if(page==="externalCivilStyle"){
        const directory=resolve(process.cwd(),process.argv.includes("--phase3")?"../../output/external/civil-projects/phase-03":"../../output/external/civil-projects/phase-02");await mkdir(directory,{recursive:true});await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data]of Object.entries(report.artifacts??{})){if(!["viewport.png","imported-render.png","issued-a3.pdf","issued-a3.svg","issued.webcad.json"].includes(name))throw Error("Unexpected external style artifact");await writeFile(join(directory,name),name.endsWith(".webcad.json")?gunzipSync(Buffer.from(data,"base64")):/\.(png|pdf)$/.test(name)?Buffer.from(data,"base64"):data);}
      }
      if(page==="externalCivil"){
        const directory=resolve(process.cwd(),"../../output/external/civil-projects");await mkdir(directory,{recursive:true});await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data]of Object.entries(report.artifacts??{})){if(!["viewport.png","imported-render.png","issued-a3.pdf","issued-a3.svg","issued.webcad.json"].includes(name))throw Error("Unexpected external drawing artifact");await writeFile(join(directory,name),/\.(png|pdf)$/.test(name)?Buffer.from(data,"base64"):data);}
      }
      if(page==="residentialMeasurements"){
        const directory=resolve(process.cwd(),"../../output/verification/residential-measurements");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["issue-01.svg","issue-01.pdf","issue-01.jpg","issue-02.svg","issue-02.pdf","issue-02.jpg","reopened.png","source.webcad.json"].includes(name))throw Error("Unexpected residential measurement artifact");await writeFile(join(directory,name),/\.(png|pdf|jpg)$/.test(name)?Buffer.from(data,"base64"):data);}
      }
      if(page==="measurementLayout"){
        const directory=resolve(process.cwd(),"../../output/verification/measurement-layout");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["snap-preview.png","layout-preview.png","layout-960.png","layout.webcad.json"].includes(name))throw Error("Unexpected layout artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="savedMeasurementPlacement"){
        const directory=resolve(process.cwd(),"../../output/verification/measurement-placement");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["placement-preview.png","placement-960.png","placement.webcad.json","placement.svg"].includes(name))throw Error("Unexpected placement artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="savedMeasurements"){
        const directory=resolve(process.cwd(),"../../output/verification/saved-measurements");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["saved-1440.png","saved-960.png","measurement.svg","measurement.pdf","measurement-page.jpg","source.webcad.json"].includes(name))throw Error("Unexpected saved measurement artifact");await writeFile(join(directory,name),/\.(png|pdf|jpg)$/.test(name)?Buffer.from(data,"base64"):data);}
      }
      if(page==="selectedDistance"){
        const directory=resolve(process.cwd(),"../../output/verification/selected-distance");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["selected-faces.png","selected-edges-960.png","selected-mixed-projection-960.png"].includes(name))throw Error("Unexpected selected distance artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));}
      }
      if(page==="brepDistance"){
        const directory=resolve(process.cwd(),"../../output/verification/brep-distance");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["brep-1440.png","brep-960.png","contained.png","distance.json","source.webcad.json"].includes(name))throw Error("Unexpected BRep distance artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="hoverDistance"){
        const directory=resolve(process.cwd(),"../../output/verification/hover-distance");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["hover-1440.png","hover-960.png","distance.json","source.webcad.json"].includes(name))throw Error("Unexpected hover distance artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="canvasScale"){
        const directory=resolve(process.cwd(),"../../output/verification/canvas-scale");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["scale-1440.png","scale-960.png","scale.webcad.json","scale.svg","scale.pdf","scale-page.jpg"].includes(name))throw Error("Unexpected scale artifact");await writeFile(join(directory,name),/\.(png|pdf|jpg)$/.test(name)?Buffer.from(data,"base64"):data);}
      }
      if(page==="canvasFlex"){
        const directory=resolve(process.cwd(),"../../output/verification/canvas-flex");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["flex-1440.png","flex-960.png","flex.webcad.json","frame.svg"].includes(name))throw Error("Unexpected Flex artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="canvasHierarchy"){
        const directory=resolve(process.cwd(),"../../output/verification/canvas-hierarchy");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["canvas-1440.png","canvas-960.png","canvas.webcad.json","paper.svg"].includes(name))throw Error("Unexpected canvas hierarchy artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="projectBundle"){
        const directory=resolve(process.cwd(),"../../output/verification/project-bundle");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["bundle-review.png","Projects.webcad.bundle.json"].includes(name))throw Error("Unexpected bundle artifact");await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);}
      }
      if(page==="kernelResources"){
        const directory=resolve(process.cwd(),"../../output/verification/kernel-p4");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({at:new Date().toISOString(),browser:executable,...report},null,2));
      }
      if(page==="curveDxf"){
        const directory=resolve(process.cwd(),"../../output/projects/curve-dxf");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({at:new Date().toISOString(),browser:executable,...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){if(!["source.dxf","curves.dxf","crop.dxf","curves.svg","curves.pdf","curves.webcad.json"].includes(name))throw Error("Unexpected curve DXF artifact");await writeFile(join(directory,name),name.endsWith(".pdf")?Buffer.from(data,"base64"):data);}
      }
      if(page==="curveHatch"){
        const directory=resolve(process.cwd(),"../../output/projects/curve-hatch-r5");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({at:new Date().toISOString(),browser:executable,...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){
          if(!/^curve-(?:0[12]-1|03-2)\.(svg|dxf|pdf)$/.test(name)&&!["curve-preview.png","curve-failure.png","curve-r5.webcad.json"].includes(name))throw Error("Unexpected curve hatch artifact");
          await writeFile(join(directory,name),name.endsWith(".webcad.json")?gunzipSync(Buffer.from(data,"base64")):name.endsWith(".svg")||name.endsWith(".dxf")?data:Buffer.from(data,"base64"));
        }
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
      if(page==="accessibilityInput"){
        const directory=resolve(process.cwd(),"../../output/verification/accessibility-input");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({at:new Date().toISOString(),browser:executable,...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){
          if(!/^accessibility-(1440|960|zoom-150|failure)\.png$/.test(name))throw Error("Unexpected accessibility artifact");
          await writeFile(join(directory,name),Buffer.from(data,"base64"));
        }
      }
      if(page==="projectHome"){
        const directory=resolve(process.cwd(),"../../output/verification/project-home");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({at:new Date().toISOString(),browser:executable,...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){
          if(!/^home-(1440|960|failure)\.png$/.test(name))throw Error("Unexpected project Home artifact");
          await writeFile(join(directory,name),Buffer.from(data,"base64"));
        }
      }
      if(page==="inspectorProperties"){
        const directory=resolve(process.cwd(),"../../output/verification/inspector-properties");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({at:new Date().toISOString(),browser:executable,...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){
          if(!/^inspector-(960|frame|failure)\.png$/.test(name)&&!/^inspector-style\.(svg|pdf)$/.test(name))throw Error("Unexpected inspector artifact");
          await writeFile(join(directory,name),name.endsWith(".svg")?data:Buffer.from(data,"base64"));
        }
      }
      if(page==="selectionToolbar"){
        const directory=resolve(process.cwd(),"../../output/verification/selection-toolbar");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({at:new Date().toISOString(),browser:executable,...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){
          if(!/^selection-(curve-review|frame-960|zoom-150|failure)\.png$/.test(name))throw Error("Unexpected selection toolbar artifact");
          await writeFile(join(directory,name),Buffer.from(data,"base64"));
        }
      }
      if(page==="projectTabNavigation"){
        const directory=resolve(process.cwd(),"../../output/verification/project-tab-navigation");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({at:new Date().toISOString(),browser:executable,...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){
          if(!/^tabs-(search-1440|search-960|reopened-search|failure)\.png$/.test(name))throw Error("Unexpected tab navigation artifact");
          await writeFile(join(directory,name),Buffer.from(data,"base64"));
        }
      }
      if(page==="projectComparison"){
        const directory=resolve(process.cwd(),"../../output/verification/project-comparison");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({at:new Date().toISOString(),browser:executable,...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){
          if(!/^comparison-(1440|960|reopened|failure)\.png$/.test(name)&&!/^comparison-[ab]\.webcad\.json$/.test(name))throw Error("Unexpected comparison artifact");
          await writeFile(join(directory,name),name.endsWith(".png")?Buffer.from(data,"base64"):data);
        }
      }
      if(page==="floorTasks"){const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});await writeFile(join(directory,"floor-tasks-native-report.json"),JSON.stringify(report,null,2));}
      if(page==="taskScope"){const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});await writeFile(join(directory,"ui-p2-c-task-scope-native-report.json"),JSON.stringify(report,null,2));}
      if(page==="durableRecovery"){const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});await writeFile(join(directory,"ui-p2-s-durable-native-report.json"),JSON.stringify(report,null,2));}
      if(page==="outputPreflight"){ const directory=resolve(process.cwd(),"../../output/verification/output-preflight"),pdfDirectory=resolve(process.cwd(),"../../output/pdf");await mkdir(directory,{recursive:true});await mkdir(pdfDirectory,{recursive:true});await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));for(const [name,data] of Object.entries(report.artifacts??{})){if(!["output-preflight-r5-1.pdf","output-preflight-r5-2.pdf","output-preflight-r5-3.pdf","output-preflight-r5-4.pdf","output-preflight-repaired.pdf","r5-vector.zip","repaired.svg","repaired.dxf","repaired.webcad.json"].includes(name))throw Error("Unexpected preflight artifact");await writeFile(join(name.endsWith(".pdf")?pdfDirectory:directory,name),name.endsWith(".pdf")||name.endsWith(".zip")?Buffer.from(data,"base64"):data);} }
      if(page==="library"){ const directory=resolve(process.cwd(),"../../output/verification/library");await mkdir(directory,{recursive:true});await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));for(const [name,data] of Object.entries(report.artifacts??{})){if(!["library-1440.png","library-960.png"].includes(name))throw Error("Unexpected library artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));} }
      if(page==="projectTree"){ const directory=resolve(process.cwd(),"../../output/verification/project-tree");await mkdir(directory,{recursive:true});await writeFile(join(directory,"native-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));for(const [name,data] of Object.entries(report.artifacts??{})){if(!["project-tree-1440.png","project-tree-960.png"].includes(name))throw Error("Unexpected project tree artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));} }
      if(page==="projectPerformance"){ const directory=resolve(process.cwd(),"../../output/verification");await mkdir(directory,{recursive:true});await writeFile(join(directory,"ui-p2-r5-native-report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report.metrics)); }
      if(page==="residentialTask"){
        const directory=resolve(process.cwd(),"../../output/projects/residential-q1");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({at:new Date().toISOString(),browser:executable,...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){
          if(!/^(source\.dxf|residential\.webcad\.json|issue-0[123]-(50|100)\.(pdf|svg|dxf)|0[123]-[a-z-]+\.png|failure\.png)$/.test(name))throw Error("Unexpected residential artifact");
          await writeFile(join(directory,name),/\.(pdf|png)$/.test(name)?Buffer.from(data,"base64"):data);
        }
      }
      if(page==="residentialExtended"){
        const directory=resolve(process.cwd(),"../../output/projects/residential-q1-extended");await mkdir(directory,{recursive:true});
        await writeFile(join(directory,"native-report.json"),JSON.stringify({at:new Date().toISOString(),browser:executable,...report,artifacts:Object.keys(report.artifacts??{})},null,2));
        if(process.argv.includes("--artifacts"))for(const [name,data] of Object.entries(report.artifacts??{})){
          if(!/^(source-(main|wrong-unit)\.dxf|extended\.webcad\.json|0[1-5]-[a-z-]+\.png|failure\.png)$/.test(name))throw Error("Unexpected residential extended artifact");
          await writeFile(join(directory,name),/\.(png)$/.test(name)?Buffer.from(data,"base64"):data);
        }
      }
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
      if(page==="interferenceTriage"){const directory=resolve(process.cwd(),"../../output/verification/assembly-b25");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));for(const [name,data] of Object.entries(report.artifacts??{})){if(!["assembly-0.png","assembly-90.png","assembly-180.png","assembly-motion-180.png","interference-triage.png"].includes(name))throw Error("Unexpected triage artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));}}
      if(page==="assemblyDrive"){const directory=resolve(process.cwd(),"../../output/verification/assembly-drive");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));for(const [name,data] of Object.entries(report.artifacts??{})){if(name!=="assembly-drive-interference.png")throw Error("Unexpected drive artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));}}
      if(page==="assemblyMotion"){const directory=resolve(process.cwd(),"../../output/verification/assembly-b2");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));for(const [name,data] of Object.entries(report.artifacts??{})){if(!["assembly-0.png","assembly-90.png","assembly-180.png","assembly-motion-180.png"].includes(name))throw Error("Unexpected motion artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));}}
      if(page==="assemblyLifecycle"){const directory=resolve(process.cwd(),"../../output/verification/assembly-b1");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));for(const [name,data] of Object.entries(report.artifacts??{})){if(!["assembly-0.png","assembly-90.png","assembly-180.png","assembly-joint-gizmo.png"].includes(name))throw Error("Unexpected assembly artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));}}
      if(page==="assemblyCandidateSearch"){const directory=resolve(process.cwd(),"../../output/verification/ai-agent-phase-1b2");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));for(const [name,data] of Object.entries(report.artifacts??{})){if(!["candidate-preview.png","synthetic-preview.png"].includes(name))throw Error("Unexpected candidate artifact");await writeFile(join(directory,name),Buffer.from(data,"base64"));}}
      if(page==="assemblyPlacement"){const directory=resolve(process.cwd(),"../../output/verification/assembly-placement");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));for(const [name,data] of Object.entries(report.artifacts??{})){if(!["placement-preview.png","placement.webcad.json"].includes(name))throw Error("Unexpected placement artifact");await writeFile(join(directory,name),name.endsWith('.png')?Buffer.from(data,"base64"):data);}}
      if(page==="simreadyB1"){const directory=resolve(process.cwd(),"../../output/verification/simready-b1",process.argv.includes("--hardware-gpu")?"hardware":"swiftshader");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));for(const [name,data] of Object.entries(report.artifacts??{})){if(!/^[a-zA-Z0-9.-]+$/.test(name))throw Error("Unexpected artifact name");await writeFile(join(directory,name),name.endsWith('.png')?Buffer.from(data,"base64"):data);}}
      if(page==="simready"){const directory=resolve(process.cwd(),"../../output/verification/simready");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));for(const [name,data] of Object.entries(report.artifacts??{})){if(!["viewport.png","part-inspector.png","reference.webcad.json","source-summary.json"].includes(name))throw Error("Unexpected SimReady artifact");await writeFile(join(directory,name),name.endsWith('.png')?Buffer.from(data,"base64"):data);}}
      if(page==="assembly"){const directory=resolve(process.cwd(),"../../output/verification/assembly-phase-a");await mkdir(directory,{recursive:true});await writeFile(join(directory,"browser-report.json"),JSON.stringify({...report,artifacts:Object.keys(report.artifacts??{})},null,2));for(const [name,data] of Object.entries(report.artifacts??{})){if(!/^assembly-(0|90|180)\.png$/.test(name))throw Error("Unexpected assembly screenshot");await writeFile(join(directory,name),Buffer.from(data,"base64"));}}
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
} finally { await mcpFixture.dispose();
  await server.close(); }

