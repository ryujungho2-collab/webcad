import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const label=(name,fallback)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const beforeLabel=label("before","baseline"),afterLabel=label("after","after");
if(![beforeLabel,afterLabel].every(v=>/^[a-z0-9-]{1,32}$/.test(v)))throw new Error("Invalid benchmark labels");
const directory=resolve(import.meta.dirname,"../../../output/benchmarks");
const stats=values=>{const v=[...values].sort((a,b)=>a-b);return {n:v.length,medianMs:v.length?(v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2:0,p95Ms:v.length?v[Math.ceil(v.length*.95)-1]:0,maxMs:v.length?v.at(-1):0};};
const summarize=report=>{
  if(report.status!=="passed"||report.metrics.trials.length!==6)throw new Error("Comparison requires six successful edits in each case");
  const {trials,frameGaps,longTasks}=report.metrics;
  return {completedEdits:trials.length,unexpectedRetries:report.metrics.summary.unexpectedRetries,
    ...Object.fromEntries(["work","requested","verified","apply","activate"].map(name=>[name,stats(trials.map(t=>t[`${name}Ms`]))])),
    frameGap:stats(frameGaps),longTasks:stats(longTasks),
    phases:Object.fromEntries(Object.keys(trials[0].phases).map(name=>[name,stats(trials.map(t=>t.phases[name].maxMs))]))};
};
const cases=[];
for(const task of ["mechanical","drawing"])for(const count of [0,250,1000]){
  const beforeFile=`${beforeLabel}-${task}-${count}.json`,afterFile=`${afterLabel}-${task}-${count}.json`;
  const before=JSON.parse(await readFile(join(directory,beforeFile),"utf8")),after=JSON.parse(await readFile(join(directory,afterFile),"utf8"));
  cases.push({task,count,beforeFile,afterFile,before:summarize(before),after:summarize(after)});
}
await writeFile(join(directory,`comparison-${beforeLabel}-${afterLabel}.json`),JSON.stringify({method:"Medians average the central two observations for even samples. p95 uses nearest rank (six trials means the maximum). Phase medians summarize each trial's maximum entry. Raw timings remain in the labeled reports.",cases},null,2));
console.table(cases.map(c=>({task:c.task,count:c.count,"work before":c.before.work.medianMs.toFixed(1),"work after":c.after.work.medianMs.toFixed(1),"preview before":c.before.verified.medianMs.toFixed(1),"preview after":c.after.verified.medianMs.toFixed(1),"request before":c.before.requested.medianMs.toFixed(1),"request after":c.after.requested.medianMs.toFixed(1),retries:c.after.unexpectedRetries})));
