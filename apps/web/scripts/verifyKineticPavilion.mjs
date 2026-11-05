import {spawn} from "node:child_process";
import {mkdir,mkdtemp,readFile,writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";

const root=resolve(import.meta.dirname,"../../.."),directory=resolve(root,"output/projects/kinetic-pavilion"),temp=resolve(root,"tmp");await mkdir(temp,{recursive:true});
const executable=process.env.CAD_TEST_BROWSER??["C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);if(!executable)throw Error("Set CAD_TEST_BROWSER to a Chromium executable.");
const profile=await mkdtemp(resolve(temp,"t031-browser-"));
const browser=spawn(executable,["--headless=new","--no-sandbox","--disable-gpu-sandbox","--in-process-gpu","--use-angle=swiftshader","--enable-unsafe-swiftshader","--no-first-run","--no-default-browser-check","--disable-background-networking","--disable-extensions","--allow-file-access-from-files","--remote-debugging-pipe","--user-data-dir="+profile,"about:blank"],{windowsHide:true,stdio:["ignore","ignore","pipe","pipe","pipe"]});
const pending=new Map();let seq=0,buffer="",stderr="";
browser.stderr.on("data",b=>{stderr=(stderr+b).slice(-4000);});browser.stdio[4].on("data",data=>{buffer+=data;let end;while((end=buffer.indexOf("\0"))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const reply=JSON.parse(raw),p=pending.get(reply.id);if(p){pending.delete(reply.id);reply.error?p.reject(Error(JSON.stringify(reply.error))):p.resolve(reply.result);}}});
browser.on("error",error=>{for(const p of pending.values())p.reject(error);});browser.on("exit",code=>{for(const p of pending.values())p.reject(Error("Browser exited "+code+": "+stderr));});
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error("CDP timeout: "+method));},20000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});browser.stdio[3].write(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}})+"\0");});
const checks=[];
try{
 const {targetId}=await send("Target.createTarget",{url:"about:blank"}),{sessionId}=await send("Target.attachToTarget",{targetId,flatten:true});
 await send("Emulation.setDeviceMetricsOverride",{width:1600,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await send("Page.enable",{},sessionId);
 await send("Page.navigate",{url:pathToFileURL(resolve(directory,"viewer.html")).href},sessionId);
 const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 let ready=false;for(let i=0;i<100;i++){ready=await evaluate('document.documentElement.dataset.ready==="true"');if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready,"Viewer must initialize");checks.push("Offline viewer initialized in Chromium with WebGL");
 for(const [label,value]of [["closed",0],["middle",37.5],["open",75]]){
  await evaluate(`pavilion.setPose(${value})`);const actual=await evaluate("pavilion.state()"),expected=JSON.parse(await readFile(resolve(directory,label+".webcad.json"),"utf8")).document;
  assert.equal(actual.driver,value);assert.equal(actual.parts,68);
  for(const [id,o]of Object.entries(expected.objects))for(const key of ["translation","rotation","scale"])assert.ok(o.transform[key].every((v,i)=>Math.abs(v-actual.poses[id][key][i])<1e-7),`${label}: ${id} ${key}`);
  for(const [id,j]of Object.entries(expected.assembly.joints)){assert.equal(actual.joints[id].angle,j.angle);assert.equal(actual.joints[id].offset,j.offset);}
  const shot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},sessionId);await writeFile(resolve(directory,label+".png"),Buffer.from(shot.data,"base64"));checks.push(`${label}: all 68 browser poses and 67 joint values match reopened CAD document; screenshot saved`);
 }
 await evaluate('document.getElementById("play").click()');const before=await evaluate("pavilion.state().driver");await new Promise(r=>setTimeout(r,700));const after=await evaluate("pavilion.state().driver");assert.ok(Math.abs(after-before)>.01);await evaluate('document.getElementById("play").click()');checks.push("Play/Pause changes the actual engine driver over browser frames");
 await evaluate('document.getElementById("drive").value="25";document.getElementById("drive").dispatchEvent(new Event("input",{bubbles:true}))');assert.equal(await evaluate("pavilion.state().driver"),25);checks.push("Range input drives the engine at an arbitrary intermediate value");
 await writeFile(resolve(directory,"browser-verification.json"),JSON.stringify({status:"passed",browser:await send("Browser.getVersion"),checks,screenshots:["closed.png","middle.png","open.png"],rendering:"Chromium headless / SwiftShader; standalone showcase, not the product viewport"},null,2));console.log(checks.join("\n"));
}finally{try{await send("Browser.close");}catch{browser.kill();}}
