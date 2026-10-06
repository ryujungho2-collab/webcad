import assert from "node:assert/strict";
import {test} from "node:test";
import {evaluateExpression,evaluateVariables,type CadVariable} from "@agent-webcad/cad-document";
const variable = (name:string,expression:string,quantity:CadVariable["quantity"]="length")=>({name,expression,quantity});
const literal=(text:string)=>evaluateExpression(text,()=>{throw new Error("unknown");}).result;

test("arithmetic preserves length and angle dimensions through intermediate products",()=>{
  assert.deepEqual(literal("(2m - 50cm)/3"),{value:500,length:1,angle:0});
  assert.equal(literal("2in + 1ft").value,355.6);
  assert.equal(literal("sin(90deg) * 10mm").value,10);
  assert.equal(literal("(3mm*4mm)/(2mm) + max(1mm, 2mm)").value,8);
  assert.equal(literal("clamp(-10mm, 0mm, 20mm)").value,0);
  assert.equal(literal("pi * 1rad").value,Math.PI);
});
test("safe expression parsing rejects unit errors, nonfinite values, executable syntax and excessive work",()=>{
  for(const expression of ["1mm + 1rad","1mm + 2","1/0","1e309mm","globalThis.alert(1)","Math.sin(1)","x=2","unknown(2)","clamp(1mm, 4mm, 2mm)","sin(1mm)","()","2mm garbage", "(".repeat(40)+"1"+")".repeat(40),"1+".repeat(100)+"1"])assert.throws(()=>literal(expression),undefined,expression);
});
test("variables resolve by dependency rather than insertion order and reject unknown, cyclic or mismatched quantities",()=>{
  const result=evaluateVariables({pitch:variable("pitch","(plateWidth - 2*edgeMargin)/3"),plateWidth:variable("plateWidth","120mm"),edgeMargin:variable("edgeMargin","1cm")});
  assert.equal(result.pitch.value,100/3);assert.deepEqual(result.pitch.dependencies,["plateWidth","edgeMargin"]);
  assert.throws(()=>evaluateVariables({a:variable("a","b"),b:variable("b","a")}),/Cyclic.*a.*b.*a/);
  assert.throws(()=>evaluateVariables({a:variable("a","missing")}),/Unknown variable/);
  assert.throws(()=>evaluateVariables({a:variable("a","3")}),/Expected length/);
  assert.throws(()=>evaluateVariables({a:variable("a","3mm","angle")}),/Expected angle/);
  assert.throws(()=>evaluateVariables(JSON.parse('{"__proto__":{"name":"__proto__","quantity":"scalar","expression":"1"}}')),/Invalid variable/);
});
