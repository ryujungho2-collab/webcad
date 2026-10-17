import type {CommandBus} from "@agent-webcad/cad-commands";
import type {CadDocument,CadArtboard,CadFrameStitch} from "@agent-webcad/cad-document";
import {validateFrameStitches} from "@agent-webcad/cad-document";
import {stitchSourceSnapshot,resolveFrameStitch} from "../precision/frameStitch";
import {collectFrameExportItems} from "../export/exportModel";
import {collectFrameStitchScene} from "../export/frameStitchScene";
export function registerFrameStitchCommands(bus:CommandBus,d:CadDocument){
 const assertEditable=(id:string)=>{const b=d.artboards?.[id];if(b&&!b.frame?.stitch)throw Error("Continuous frame identity is already occupied.");if(b?.locked)throw Error("Unlock the continuous frame before changing it.");return b;};
 bus.registerHandler("upsert-frame-stitch",c=>{if(c.type!=="upsert-frame-stitch")return;const old=assertEditable(c.id),anchor=d.artboards?.[c.anchorId];if(!anchor?.frame)throw Error("Choose an anchor drawing frame.");if(c.id===c.anchorId||c.targets.some(t=>t.frameId===c.id||t.frameId===c.anchorId)||new Set(c.targets.map(t=>t.frameId)).size!==c.targets.length)throw Error("Choose distinct source frames; cyclic or duplicate sources are unsupported.");
  const s:CadFrameStitch={anchorId:c.anchorId,mode:c.mode,tolerance:c.tolerance,duplicates:c.duplicates,parts:[{frameId:c.anchorId,...stitchSourceSnapshot(anchor),...(c.anchorSeam?{seam:structuredClone(c.anchorSeam)}:{})},...c.targets.map(t=>{const b=d.artboards?.[t.frameId];if(!b)throw Error("Source drawing frame is missing.");return {...structuredClone(t),...stitchSourceSnapshot(b)};})]},report=resolveFrameStitch(d,s),denominator=anchor.frame.denominator;
  const board:CadArtboard={...(old??anchor),id:c.id,name:c.name.trim()||"Continuous drawing",origin:[...c.origin],size:[report.bounds.size[0]/denominator,report.bounds.size[1]/denominator],frame:{memberIds:[...new Set(s.parts.flatMap(p=>p.sourceFrame.memberIds))],sourceOrigin:[...report.bounds.min],denominator,stitch:s},visible:old?.visible??true,locked:false};
  if(board.size.some(v=>!Number.isFinite(v)||v<=0)||board.origin.some(v=>!Number.isFinite(v)))throw Error("Continuous frame has no finite crop.");
  const scene=collectFrameStitchScene(board,d,collectFrameExportItems);const next={...d,artboards:{...d.artboards,[c.id]:board}};validateFrameStitches(next);
  if(JSON.stringify(old)===JSON.stringify(board))return {accepted:false,reason:"Continuous frame is unchanged."};d.artboards=next.artboards;d.revision++;return {createdIds:[c.id],frameStitch:scene.report};
 });
 bus.registerHandler("detach-frame-stitch",c=>{if(c.type!=="detach-frame-stitch")return;const b=assertEditable(c.artboardId);if(!b)throw Error("Continuous frame no longer exists.");if(Object.values(d.artboards??{}).some(b=>b.frameSheet?.placements.some(p=>p.frameId===c.artboardId)))throw Error("Delete referencing paper sheet sets before detaching this continuous frame.");if(Object.values(d.frameLinks??{}).some(l=>l.fromId===c.artboardId||l.toId===c.artboardId))throw Error("Detach its frame connections first.");for(const s of Object.values(d.workspaceSections??{}))s.frameIds=s.frameIds.filter(id=>id!==c.artboardId);delete d.artboards![c.artboardId];d.revision++;});
}
