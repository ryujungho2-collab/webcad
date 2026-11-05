import test from "node:test";
import assert from "node:assert/strict";
import {isCompositionKey,routeHistoryShortcut} from "../src/input/shortcutRouter";
import {NAVIGATION_SHORTCUTS} from "../src/input/shortcutCatalog";

test("IME composition and legacy key 229 never route document history",()=>{
  const chord={key:"z",ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,defaultPrevented:false};
  for(const ime of [{isComposing:true},{keyCode:229},{isComposing:false,keyCode:229}]){
    assert.equal(isCompositionKey(ime),true);
    assert.equal(routeHistoryShortcut({...chord,...ime}),null);
    assert.equal(routeHistoryShortcut({...chord,...ime,key:"y"}),null);
  }
  assert.equal(isCompositionKey({keyCode:90}),false);
  assert.equal(routeHistoryShortcut(chord),"undo");
  assert.equal(routeHistoryShortcut({...chord,shiftKey:true}),"redo");
});
test("shortcut help separates local recovery from unverified file downloads",()=>{
  const local=NAVIGATION_SHORTCUTS.find(row=>row.id==="save-local")!,download=NAVIGATION_SHORTCUTS.find(row=>row.id==="download-file")!;
  assert.equal(local.shortcut,"Ctrl+S");assert.equal(download.shortcut,"Ctrl+Shift+S");
  assert.match(local.description,/browser/);assert.match(download.description,/Completion must be checked/);
});
