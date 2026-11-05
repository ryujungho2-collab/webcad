import {copyFile} from "node:fs/promises";
import {resolve} from "node:path";
const stage=process.argv[2];if(!["base","review"].includes(stage))throw Error("Choose the explicit house snapshot stage: base or review");
const directory=resolve("../../output/projects/lightwell-house"),files=["house.webcad.json","design.json","mcp-trace.json","browser-report.json"];
await Promise.all(files.map(name=>copyFile(resolve(directory,name),resolve(directory,`${stage}-${name}`))));console.log(`Saved ${stage} house task snapshot (${files.length} explicit artifacts).`);
