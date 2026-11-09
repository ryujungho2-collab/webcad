import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
const file=resolve("../../output/projects/flow-court/reference-review.html");
createServer(async(req,res)=>{if(new URL(req.url,"http://localhost").pathname!=="/"){res.writeHead(404);res.end();return;}try{res.setHeader("Content-Type","text/html; charset=utf-8");res.end(await readFile(file));}catch{res.writeHead(500);res.end("Review file unavailable");}}).listen(5187,"127.0.0.1",()=>console.log("Architectural reference review: http://127.0.0.1:5187/"));
