import type {CommandBus} from "@agent-webcad/cad-commands";
import {validateFrameLinks,type CadDocument} from "@agent-webcad/cad-document";
import {planFrameLinkLayout,assertFrameLinkSource,frameLinkAnnotations} from "../precision/frameLinks";
export function registerFrameLinkCommands(bus:CommandBus,d:CadDocument){
 const layout=(id:string,translation?:[number,number])=>{const report=planFrameLinkLayout(d,id,translation);for(const frameId of report.movedIds)d.artboards![frameId].origin=[...report.placements[frameId]];for(const id of report.frameIds)frameLinkAnnotations(d,d.artboards![id]);return report;};
 bus.registerHandler("upsert-frame-link",c=>{if(c.type!=="upsert-frame-link")return;const l=structuredClone(c.link),old=d.frameLinks?.[l.id];
  for(const id of new Set([l.fromId,l.toId,...old?[old.fromId,old.toId]:[]]))if(d.artboards?.[id]?.locked)throw Error("Unlock the connected frames before changing reference annotations.");
  (d.frameLinks??={})[l.id]=l;validateFrameLinks(d);assertFrameLinkSource(d,l);const report=layout(l.fromId);
  if(JSON.stringify(old)===JSON.stringify(l)&&!report.movedIds.length)return {accepted:false,reason:"Frame connection is unchanged and already aligned."};
  d.revision++;return {frameLayout:report};
 });
 bus.registerHandler("layout-frame-links",c=>{if(c.type!=="layout-frame-links")return;const report=layout(c.frameId,c.translation);if(!report.movedIds.length)return {accepted:false,reason:"Connected frames are already aligned."};d.revision++;return {frameLayout:report};});
 bus.registerHandler("delete-frame-link",c=>{if(c.type!=="delete-frame-link")return;const l=d.frameLinks?.[c.linkId];if(!l)return {accepted:false,reason:"Connection no longer exists."};if([l.fromId,l.toId].some(id=>d.artboards?.[id]?.locked))throw Error("Unlock the connected frames before detaching their reference annotations.");delete d.frameLinks![c.linkId];if(!Object.keys(d.frameLinks!).length)delete d.frameLinks;d.revision++;});
}
