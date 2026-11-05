import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {zipSync,unzipSync} from "fflate";
import {createHash} from "node:crypto";
const dir=resolve("../../output/projects/large-cafe/3d"),names=["README.md","source-2d.webcad.json","large-cafe-3d.webcad.json","large-cafe.step","large-cafe.glb","viewer.html","asset-recipes.json","cad-section-AA.svg","cad-section-AA.dxf","conversion-report.json","section-report.json","independent-report.json","browser-report.json","cad-overview.png","model-overview.png","model-1f.png","model-2f.png","model-separated.png","model-section.png","model-interior.png"],entries:Record<string,Uint8Array>={},files:{name:string;bytes:number;sha256:string}[]=[];
for(const name of names){const bytes=await readFile(resolve(dir,name));entries[name]=bytes;files.push({name,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});}
for(const report of ["conversion-report.json","independent-report.json","browser-report.json"])assert.equal(JSON.parse(new TextDecoder().decode(entries[report])).status,"passed");
const zip=zipSync(entries,{level:6}),decoded=unzipSync(zip);assert.equal(Object.keys(decoded).length,names.length);for(const name of names)assert.deepEqual(Buffer.from(decoded[name]),Buffer.from(entries[name]));await writeFile(resolve(dir,"../large-cafe-3d-R0.zip"),zip);await writeFile(resolve(dir,"delivery-manifest.json"),JSON.stringify({status:"passed",archive:"../large-cafe-3d-R0.zip",files:files.length,zipBytes:zip.length,zipSha256:createHash("sha256").update(zip).digest("hex"),verifiedUnzipExact:true,contents:files},null,2));console.log(`Packaged ${names.length} files; ${(zip.length/1024/1024).toFixed(2)} MiB; unpacked bytes exact.`);
