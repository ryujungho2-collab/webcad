import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Test-only trusted mouse and keyboard input for the runner's isolated page.
// Capture, focus traversal and native text editing require real browser input.
const sessions = new Map();
const pause = () => new Promise(resolve => setTimeout(resolve, 50));
async function connect(profile, targetUrl) {
  const deadline = Date.now() + 10000;
  let endpoint;
  while (!endpoint && Date.now() < deadline) {
    try {
      const port = Number((await readFile(`${profile}/DevToolsActivePort`, "utf8")).split(/\r?\n/)[0]);
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      endpoint = pages.find(page => page.type === "page" && page.url === targetUrl)?.webSocketDebuggerUrl;
    } catch { /* The isolated browser may still be starting. */ }
    if (!endpoint) await pause();
  }
  if (!endpoint) throw new Error("Isolated browser input endpoint unavailable.");
  const socket = new WebSocket(endpoint), pending = new Map();
  let sequence = 0;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Browser input connection timed out.")), 5000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Browser input connection failed.")); }, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(String(event.data)), request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error("Browser input connection closed.")); }
    pending.clear();
  });
  return {
    send(method,params) {
      return new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error("Browser input timed out.")); }, (targetUrl.includes("courtyardH1.browser.html")||targetUrl.includes("courtyardEllipse.browser.html")||targetUrl.includes("courtyardConic.browser.html")||targetUrl.includes("courtyardIssue.browser.html"))?30000:5000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

export async function browserCheckDiagnostics(profile,targetUrl) {
  const connection=await connect(profile,targetUrl);
  try { return await connection.send("Runtime.evaluate",{expression:"JSON.stringify({url:location.href,output:document.getElementById('output')?.textContent,body:document.body.innerText.slice(-6000)})",returnByValue:true}); }
  finally { connection.close(); }
}

export function registerBrowserInput(run, profile, targetUrl) {
  let connection;
  sessions.set(run, async action => {
    if(action.type==="fileInput"){
      const raster=[`input[aria-label="Import image file"]`,`input[aria-label="Replace image source file"]`].includes(action.selector)&&/^image-(?:test|bad|replacement)\.(png|jpg|jpeg|webp|tif)$/.test(action.name);
      const dxf=action.selector==='input[aria-label="Import DXF file"]'&&/^drawing-(?:test|bad)\.dxf$/.test(action.name);
      const fixture=action.selector==='input[aria-label="Import exchange fixture file"]'&&/^exchange-(?:test|bad)\.fixture\.json$/.test(action.name);
      const documentFixture=action.selector==='input[accept=".json,.webcad.json"]'&&action.name==='prepared.webcad.json';
      if(typeof action.name!=="string"||!raster&&!dxf&&!fixture&&!documentFixture||typeof action.base64!=="string"||action.base64.length>100000)throw new Error("Invalid browser file fixture.");
      const filePath=join(profile,action.name);await writeFile(filePath,Buffer.from(action.base64,"base64"));
      connection??=connect(profile,targetUrl);const cdp=await connection;
      await cdp.send("DOM.enable",{});const tree=await cdp.send("DOM.getDocument",{depth:-1,pierce:true});
      const found=await cdp.send("DOM.querySelector",{nodeId:tree.root.nodeId,selector:action.selector});
      if(!found.nodeId)throw new Error("Image file input was not found.");
      await cdp.send("DOM.setFileInputFiles",{nodeId:found.nodeId,files:[filePath]});return;
    }
    if(action.type==="screenshot"){
      connection ??= connect(profile,targetUrl);
      return (await connection).send("Page.captureScreenshot",{format:"png"});
    }
    if(action.type==="key"||action.type==="text"){
      connection ??= connect(profile,targetUrl);
      if(action.type==="text"){
        if(typeof action.text!=="string"||action.text.length>64||/[\r\n]/.test(action.text))throw new Error("Invalid test text.");
        await (await connection).send("Input.insertText",{text:action.text});return;
      }
      const codes={Tab:9,Enter:13,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Home:36,End:35,Backspace:8,Delete:46," ":32,F2:113};
      if(typeof action.key!=="string"||!(action.key in codes||/^[a-z0-9.,+\-<°#@]$/i.test(action.key))||!(action.modifiers===undefined||Number.isInteger(action.modifiers)&&action.modifiers>=0&&action.modifiers<=15))throw new Error("Invalid test key.");
      const key=action.key,modifiers=action.modifiers??0,windowsVirtualKeyCode=codes[key]??key.toUpperCase().charCodeAt(0);
      const params={key,windowsVirtualKeyCode,modifiers};
      await (await connection).send("Input.dispatchKeyEvent",{type:"keyDown",...params,...(modifiers===0&&(key.length===1||key==="Enter")?{text:key==="Enter"?"\r":key}:{})});
      await (await connection).send("Input.dispatchKeyEvent",{type:"keyUp",...params});return;
    }
    if (!["mouseMoved", "mousePressed", "mouseReleased", "mouseWheel"].includes(action.type)
      || !Number.isFinite(action.x) || !Number.isFinite(action.y)
      || ![undefined, "left", "middle", "right", "none"].includes(action.button)
      || ![undefined, 0, 1, 2, 4].includes(action.buttons)
      || ![undefined, 0, 1, 2, 4, 8].includes(action.modifiers)) throw new Error("Invalid browser test input.");
    const params = { type: action.type, x: action.x, y: action.y, button: action.button ?? "none", buttons: action.buttons ?? 0, modifiers: action.modifiers ?? 0 };
    if (action.type === "mousePressed" || action.type === "mouseReleased") params.clickCount = 1;
    if (action.type === "mouseWheel") {
      if (!Number.isFinite(action.deltaY)) throw new Error("Invalid test wheel delta.");
      params.deltaX = 0; params.deltaY = action.deltaY;
    }
    connection ??= connect(profile, targetUrl);
    await (await connection).send("Input.dispatchMouseEvent",params);
  });
  return async () => { sessions.delete(run); if (connection) try { (await connection).close(); } catch { /* Startup failures are reported by the check. */ } };
}

export function browserInputMiddleware(request, response) {
  const run = new URL(request.url, "http://localhost").searchParams.get("run"), handler = sessions.get(run);
  if (request.method !== "POST" || !handler) { response.statusCode = 404; response.end(); return; }
  let body = "";
  request.on("data", chunk => { body += chunk; if (body.length > 150000) request.destroy(); });
  request.on("end", async () => {
    try { const result=await handler(JSON.parse(body));if(result){response.setHeader("Content-Type","application/json");response.end(JSON.stringify(result));}else response.end("ok"); }
    catch (error) { response.statusCode = 400; response.end(error.message); }
  });
}
