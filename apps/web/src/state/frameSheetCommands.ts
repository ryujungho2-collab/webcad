import type {CadDocument} from "@agent-webcad/cad-document";
import type {CommandBus} from "@agent-webcad/cad-commands";
import {layoutFrameSheets,frameSheetPages} from "../precision/frameSheetLayout";
import {collectFrameSheetItems} from "../export/frameSheetScene";
import {collectFrameExportItems} from "../export/exportModel";
export function registerFrameSheetCommands(bus:CommandBus,d:CadDocument){
 bus.registerHandler("layout-frame-sheet-set",c=>{if(c.type!=="layout-frame-sheet-set")return;const report=layoutFrameSheets(d,c),next=structuredClone(d);next.artboards??={};for(const b of frameSheetPages(next,c.id))delete next.artboards[b.id];for(const b of report.boards)next.artboards[b.id]=b;
  for(const b of report.boards)collectFrameSheetItems(b,next,collectFrameExportItems);
  d.artboards=next.artboards;d.revision++;return {createdIds:report.boards.map(b=>b.id),frameSheets:report};
 });
 bus.registerHandler("delete-frame-sheet-set",c=>{if(c.type!=="delete-frame-sheet-set")return;const pages=frameSheetPages(d,c.setId);if(!pages.length)throw Error("Choose a saved frame sheet set.");if(pages.some(b=>b.locked))throw Error("Unlock all paper pages before deleting the set.");for(const b of pages)delete d.artboards![b.id];d.revision++;});
}
