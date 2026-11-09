import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
const directory=resolve("../../output/projects/lightwell-house"),allowed=new Set(["index.html","viewer.html","house.webcad.json","house.step","house.glb","mcp-trace.json","design.json","browser-report.json",...["B101","A101","A102","A201","A202"].flatMap(id=>[`${id}.svg`,`${id}-native.svg`,`${id}.dxf`,`${id}-sheet.svg`])]);
createServer(async(req,res)=>{const name=new URL(req.url,"http://localhost").pathname.slice(1)||"index.html";if(!allowed.has(name)){res.writeHead(404);res.end();return;}try{const b=await readFile(resolve(directory,name));res.setHeader("Content-Type",name.endsWith("html")?"text/html; charset=utf-8":name.endsWith("svg")?"image/svg+xml":name.endsWith("json")?"application/json":"application/octet-stream");res.end(b);}catch{res.writeHead(404);res.end();}}).listen(5192,"127.0.0.1",()=>console.log("Lightwell House review: http://127.0.0.1:5192/"));
