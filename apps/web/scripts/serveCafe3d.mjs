import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
const directory=resolve("../../output/projects/large-cafe/3d"),allowed={"/":"viewer.html","/viewer.html":"viewer.html","/large-cafe.glb":"large-cafe.glb","/large-cafe.step":"large-cafe.step","/large-cafe-3d.webcad.json":"large-cafe-3d.webcad.json"};
createServer(async(req,res)=>{const file=allowed[new URL(req.url,"http://localhost").pathname];if(!file){res.writeHead(404);res.end();return;}try{const data=await readFile(resolve(directory,file));res.setHeader("Content-Type",file.endsWith("html")?"text/html; charset=utf-8":file.endsWith("glb")?"model/gltf-binary":"application/octet-stream");res.end(data);}catch{res.writeHead(500);res.end("Model file unavailable");}}).listen(5186,"127.0.0.1",()=>console.log("Cafe model viewer: http://127.0.0.1:5186/"));
