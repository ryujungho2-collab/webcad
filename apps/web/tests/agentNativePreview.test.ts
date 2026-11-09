import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {deserializeDocument,serializeDocument} from "@agent-webcad/cad-document";
import {restoreTestDocument} from "./helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {validateAgentProposal} from "../src/copilot/validateAgentProposal";
import {discardCadPlan} from "../src/state/documentPlans";
import {cadHistory} from "../src/state/history";
test("Native Preview gate verifies actual reduction and rejects growth/stale evidence while preserving joints/intent/history",async()=>{
 const original=structuredClone(cadDocument);try{
 restoreTestDocument(deserializeDocument(await readFile(new URL("../../../output/verification/assembly-b25/annotated-laptop.webcad.json",import.meta.url),"utf8")));cadHistory.clear();const before=serializeDocument(cadDocument),session=createCadToolSession({document:cadDocument,selectionIds:["stand-support"],layerId:"layer-default",workPlane:"XY"});
 const baseline=await session.read({id:"baseline",name:"assembly.motion.inspect",arguments:{optionsJson:JSON.stringify({jointId:"bearing",start:0,end:180,step:90,partIds:["stand-support","stand-plate"],exceptions:[],tolerance:1e-6})}});assert.equal(baseline.ok,true);
 const proposal=async(value:number)=>session.plan([{id:"proposal",name:"solid.parameter",arguments:{key:"width",value}}]);
 const plan=await proposal(40),p=await validateAgentProposal(plan,cadDocument,["stand-support"],"XY","관통을 줄여줘",[baseline],new AbortController().signal);
 assert.equal(p.result.ok,true);assert.ok(plan.summary.some(s=>s.includes("964.617")&&s.includes("771.693")));discardCadPlan(p.planId);
 await assert.rejects(validateAgentProposal(await proposal(60),cadDocument,["stand-support"],"XY","관통 감소",[baseline],new AbortController().signal),/did not decrease/);
 await assert.rejects(validateAgentProposal(await proposal(40),cadDocument,["stand-support"],"XY","관통 감소: 지지대 위치만 변경, 치수 유지",[baseline],new AbortController().signal),/position-only request preserves dimensions/);
 const stale=structuredClone(baseline);(stale.result as any).version.generation--;
 await assert.rejects(validateAgentProposal(await proposal(40),cadDocument,["stand-support"],"XY","관통 감소",[stale],new AbortController().signal),/stale baseline/);
 const axis=await session.plan([{id:"axis",name:"assembly.joint.edit",arguments:{jointId:"support",editJson:JSON.stringify({origin:[0,0,25]}),preserveWorld:true}}]);
 await assert.rejects(validateAgentProposal(axis,cadDocument,["stand-support"],"XY","관통 감소",[baseline],new AbortController().signal),/preserve original/);
 assert.equal(serializeDocument(cadDocument),before);assert.equal(cadHistory.getPastLabels().length,0);
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
