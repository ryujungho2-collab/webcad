import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import { commandInteraction, interactionRecovery } from "../src/state/commandInteraction";
import { previewCadCommand, discardCadPlan } from "../src/state/documentPlans";
import { resetTestDocument } from "./helpers/documentHarness";
import { notifyDocumentChanged } from "../src/state/documentSession";
import { parameterInput } from "../src/precision/parameterInput";
import {interactionToolReason} from "../src/commands/interactionTools";
import {cadDocument} from "../src/state/cadDocument";
beforeEach(resetTestDocument);
test("search and context entry reasons preserve empty selection discovery and explain active or locked state",()=>{
  const reason=(id:Parameters<typeof interactionToolReason>[0],active?:string)=>interactionToolReason(id,cadDocument,[],active,"layer-default");
  assert.equal(reason("curve-workflow"),undefined);assert.equal(reason("pattern-linear"),undefined);
  assert.match(reason("edit-sketch")!,/Select curves/);assert.match(reason("construction","sketch")!,/Finish/);
  cadDocument.layers["layer-default"].locked=true;
  assert.match(reason("pattern-linear")!,/unlock/);assert.match(reason("construction")!,/unlock/);
});
test("one authoritative readiness rejects changed drafts before preview effects execute",async()=>{
  const p=await previewCadCommand({type:"create-drawing",drawing:"line",params:{points:[[0,0,0],[10,0,0]]}});
  const base={command:"Test",draftKey:"10mm",reviewedKey:"10mm",preview:p,targets:[]};
  assert.equal(commandInteraction(base).canApply,true);
  for(const extra of [{draftKey:"oops"},{pending:true},{selecting:true},{visualReady:false},{inputError:"Enter a positive value"},{missing:["Choose a source"]},{references:[{name:"Dimension",kind:"dimension",status:"unresolved" as const}]},{completedIds:[]}]) assert.equal(commandInteraction({...base,...extra}).canApply,false);
  assert.equal(commandInteraction({...base,draftKey:"oops"}).preview,undefined);
  notifyDocumentChanged(); assert.equal(commandInteraction(base).canApply,false); assert.match(commandInteraction(base).validationError!,/Document changed/); discardCadPlan(p.planId);
});
test("precision inputs share unit, angle, relative coordinate, range and incomplete draft semantics",()=>{
  assert.equal(parameterInput("2.54cm","length").value,25.4); assert.equal(parameterInput("1in","length").value,25.4);
  assert.ok(Math.abs(Number(parameterInput("1.5707963267948966rad","angle").value)-90)<1e-10);
  assert.deepEqual(parameterInput("@2cm,-3mm","coordinate",{relativeTo:[5,8]}).value,[25,5]);
  for(const text of ["-","oops","Infinity"])assert.equal(parameterInput(text,"length").valid,false);
  assert.equal(parameterInput("0","length",{min:1e-6}).valid,false); assert.equal(parameterInput("3.5","count").valid,false);
  assert.equal(parameterInput("0","length",{min:0,minExclusive:true}).valid,false);
  assert.equal(parameterInput("0.000001mm","length",{min:0,minExclusive:true}).value,0.000001);
  assert.match(parameterInput("1mm","length",{min:0,minExclusive:true}).hint,/> 0/);
  assert.match(interactionRecovery("Artboard is locked. Unlock it in Artboards.")[0],/Artboards/);
  assert.match(interactionRecovery("The selected intersection (negative) does not exist")[0],/branch/);
});
