import test from "node:test";import assert from "node:assert/strict";
import {projectTargets,filterProjectTargets} from "../src/explorer/projectTree";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory} from "../src/state/history";
import {projectTreeFixture} from "./helpers/projectTreeFixture";
test.beforeEach(projectTreeFixture);
test("derived navigation references source geometry once and uses paper XY for XZ/YZ views",()=>{
 const before=JSON.stringify(cadDocument),history=cadHistory.past.length,rows=projectTargets(cadDocument);
 assert.equal(rows.filter(r=>r.group==="Model").length,1);
 assert.equal(rows.find(r=>r.key==="projection:front")!.plane,"XY");assert.equal(rows.find(r=>r.key==="section:cut")!.plane,"XY");
 assert.equal(rows.find(r=>r.key==="frame:detail")!.group,"Details");assert.equal(rows.find(r=>r.key==="sheet:sheet")!.artboardId,"paper");assert.equal(rows.some(r=>r.key==="frame:paper"),false);
 assert.equal(JSON.stringify(cadDocument),before);assert.equal(cadHistory.past.length,history);
});
test("Unicode and stable ID search preserve groups and discriminate equal labels",()=>{cadDocument.objects.body.name="주거 단면";const rows=projectTargets(cadDocument);assert.equal(filterProjectTargets(rows,"주거 단면").length,2);assert.equal(filterProjectTargets(rows," FRONT ")[0].id,"front");assert.equal(filterProjectTargets(rows,"no match").length,0);});
test("hidden, missing and collapsed references have explicit navigation reasons; locking allows viewing",()=>{cadDocument.layers['layer-default'].locked=true;assert.equal(projectTargets(cadDocument).find(r=>r.id==="body")!.unavailable,undefined);cadDocument.objects.body.visible=false;assert.match(projectTargets(cadDocument).find(r=>r.id==="body")!.unavailable!,/hidden/);cadDocument.artboards!.paper.visible=false;assert.match(projectTargets(cadDocument).find(r=>r.id==="sheet")!.unavailable!,/hidden/);cadDocument.workspaceSections={s:{id:"s",name:"area",color:"#ffffff",workPlane:"XY",origin:[0,0],size:[100,100],frameIds:["detail"],collapsed:true}};assert.match(projectTargets(cadDocument).find(r=>r.key==="frame:detail")!.unavailable!,/collapsed/);});
test("fresh lookup reflects removed output and unresolved status without regeneration",()=>{const v=cadDocument.modelPresentation!.sections!.cut;v.status="unresolved";v.reason="Source changed";const ids=Object.values(v.outputs).map(o=>o.objectId);for(const id of ids)delete cadDocument.objects[id];const row=projectTargets(cadDocument).find(r=>r.key==="section:cut")!;assert.match(row.unavailable!,/No existing/);assert.equal(row.status,"Missing references");assert.equal(v.status,"unresolved");});
