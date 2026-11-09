// Independent native browser cases; each lane owns its Vite dependency cache.
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {spawn} from "node:child_process";
import {resolve} from "node:path";
const directory=resolve("../../output/verification/sculpt-phase-4"),source=await readFile("scripts/browserChecks.mjs","utf8");
const pages=JSON.parse(source.match(/const pages=(\[[^;]+\]);/)[1]);for(const m of source.matchAll(/pages.push\(([^;]+)\);/g))pages.push(...JSON.parse(`[${m[1]}]`));
const unique=[...new Set(pages)],results=new Map(),old=await readFile(resolve(directory,"full-browser.log"),"utf8");
for(const match of old.matchAll(/^(\w+): (\d+) UI\/Worker checks passed/gm))results.set(match[1],{page:match[1],status:"passed",checks:Number(match[2]),run:"initial sequential",log:"full-browser.log"});
try{const previous=JSON.parse(await readFile(resolve(directory,"full-browser-audit.json"),"utf8"));for(const result of previous.cases??[])results.set(result.page,result);}catch(error){if(error.code!=="ENOENT")throw error;}
for(const page of ["meshEditing","polygonEditing","geometryNodes","sculpt","mcpBridge"])results.delete(page);
const pending=unique.filter(p=>!results.has(p));await mkdir(directory,{recursive:true});let index=0;
let saving=Promise.resolve();const save=()=>saving=saving.then(()=>writeFile(resolve(directory,"full-browser-audit.json"),JSON.stringify({registered:pages.length,unique:unique.length,completed:results.size,pending:unique.filter(p=>!results.has(p)),cases:unique.filter(p=>results.has(p)).map(p=>results.get(p))},null,2)));
await save();
async function lane(slot){while(index<pending.length){const page=pending[index++],log=`browser-${page}.log`;console.log(`Lane ${slot}: ${page}`);const child=spawn(process.execPath,["scripts/browserChecks.mjs",`--page=${page}`],{windowsHide:true,env:{...process.env,CAD_TEST_CACHE_DIR:resolve(`node_modules/.vite-phase4-audit-${slot}`)},stdio:["ignore","pipe","pipe"]});let output="";child.stdout.on("data",d=>output+=d);child.stderr.on("data",d=>output+=d);const exitCode=await new Promise(resolve=>{child.once("error",e=>{output+=String(e);resolve(-1);});child.once("exit",resolve);});await writeFile(resolve(directory,log),output);const pass=output.match(new RegExp(`${page}: (\\d+) UI/Worker checks passed`));results.set(page,{page,status:exitCode===0&&pass?"passed":"failed",checks:pass?Number(pass[1]):0,exitCode,run:`isolated cache lane ${slot}`,log,...pass?{}:{failure:output.slice(output.indexOf("FAIL:")>=0?output.indexOf("FAIL:"):Math.max(0,output.length-2000)).slice(0,4000)}});await save();console.log(`${page}: ${results.get(page).status} (${results.size}/${unique.length})`);}}
await Promise.all([lane(0),lane(1),lane(2)]);await save();console.log(`Completed ${results.size} unique pages; ${[...results.values()].filter(r=>r.status==="failed").length} failed.`);if([...results.values()].some(r=>r.status==="failed"))process.exitCode=1;
