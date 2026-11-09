import test from "node:test";
import assert from "node:assert/strict";
import {createPaletteCommands} from "../src/commands/paletteCommands";
import type {AppShellProps} from "../src/app/AppShell";

test("palette command ids are unique and repeat-command stays runnable",()=>{
  let repeated=0;
  const props=new Proxy({selectedObjectIds:[],workspaceMode:"2d",canCreateBox:true,onRepeatCommand:()=>{repeated++;}} as Record<string,unknown>,{get:(target,key)=>target[key as string]}) as unknown as AppShellProps;
  const commands=createPaletteCommands(props,{toggleExplorer:()=>{},toggleProperties:()=>{}});
  const ids=commands.map(command=>command.id);
  assert.deepEqual(ids.filter((id,index)=>ids.indexOf(id)!==index),[]);
  const repeat=commands.filter(command=>command.id==="repeat-command");
  assert.equal(repeat.length,1);
  assert.equal(repeat[0].reference,undefined);
  assert.equal(repeat[0].shortcut,"Enter / Space");
  repeat[0].run();
  assert.equal(repeated,1);
});
