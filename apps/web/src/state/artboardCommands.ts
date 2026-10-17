import {assertFrameMembers,frameSourceMapping} from "../precision/drawingFrame";
import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import type { CadDocument } from "@agent-webcad/cad-document";

export function registerArtboardCommandHandlers(bus: CommandBus, document: CadDocument) {
  bus.registerHandler("create-artboard", command => {
    if (command.type !== "create-artboard") return;
    const id = command.id ?? `artboard-${crypto.randomUUID()}`;
    if (document.artboards?.[id]) return { accepted: false, reason: "An artboard with this ID already exists. Choose another ID." };
    if(command.frame?.stitch)throw Error("Create continuous frames in Stitch frames Review.");
    if(command.frame){assertFrameMembers(document,command.frame.memberIds,command.workPlane);frameSourceMapping(document,command.frame.memberIds);}
    const artboards = document.artboards ??= {};
    artboards[id] = { ...(command.frame?{frame:structuredClone(command.frame)}:{}), id, name: command.name?.trim() || `Artboard ${Object.keys(artboards).length + 1}`, workPlane: command.workPlane, origin: [...command.origin] as [number, number], size: [...command.size] as [number, number], background: command.background ?? "#ffffff", backgroundOpacity: command.backgroundOpacity ?? 1, showGrid: command.showGrid ?? false, visible: true, locked: false };
    document.revision++;
    return id;
  });
  bus.registerHandler("update-artboard", command => {
    if (command.type !== "update-artboard") return;
    const board = document.artboards?.[command.artboardId];
    if (!board) return { accepted: false, reason: "Artboard no longer exists. Select an existing artboard." };
    if(command.frame?.stitch||board.frame?.stitch&&(command.frame||command.size||command.workPlane))throw Error("Edit continuous frame crop and alignment in Stitch frames Review.");
    if(board.frameSheet&&(command.origin||command.size||command.workPlane||command.frame||command.name!==undefined))throw Error("Edit paper placement in Frame sheets Review.");
    if (board.locked && (command.origin || command.size || command.workPlane || command.frame || board.frame && (command.name!==undefined||command.background!==undefined))) return { accepted: false, reason: "Artboard is locked. Unlock it in Artboards before changing its plane, origin, or size." };
    if(command.origin&&command.origin.some((n,i)=>n!==board.origin[i])&&Object.values(document.frameLinks??{}).some(l=>l.toId===board.id&&l.fixed))throw Error("Release the fixed frame connection before moving this frame.");
    if(command.frame||board.frame&&command.workPlane)assertFrameMembers(document,(command.frame??board.frame)!.memberIds,command.workPlane??board.workPlane);
    if(command.frame)frameSourceMapping(document,command.frame.memberIds);
    if(command.frame&&Object.values(document.modelPresentation?.sheets??{}).some(s=>s.artboardId===board.id))return {accepted:false,reason:"A model sheet cannot be converted into a drawing frame."};
    if(command.workPlane&&command.workPlane!==board.workPlane&&Object.values(document.frameLinks??{}).some(l=>l.fromId===board.id||l.toId===board.id))throw Error("Detach frame connections before changing planes.");
    if(command.workPlane&&Object.values(document.workspaceSections??{}).some(s=>s.frameIds.includes(board.id)&&s.workPlane!==command.workPlane))throw Error("Release the frame from its work area before changing planes.");
    const next = { ...board, ...(command.frame?{frame:structuredClone(command.frame)}:{}), ...(command.name === undefined ? {} : { name: command.name.trim() || board.name }), ...(command.origin ? { origin: [...command.origin] as [number, number] } : {}), ...(command.size ? { size: [...command.size] as [number, number] } : {}), ...(command.workPlane ? { workPlane: command.workPlane } : {}), ...(command.background ? { background: command.background } : {}), ...(command.backgroundOpacity !== undefined ? { backgroundOpacity: command.backgroundOpacity } : {}), ...(command.showGrid !== undefined ? { showGrid: command.showGrid } : {}), ...(command.visible === undefined ? {} : { visible: command.visible }), ...(command.locked === undefined ? {} : { locked: command.locked }) };
    if (JSON.stringify(next) === JSON.stringify(board)) return { accepted: false, reason: "Artboard is unchanged. Edit its values to prepare a new review." };
    document.artboards![command.artboardId] = next;
    document.revision++;
  });
  bus.registerHandler("delete-artboard", command => {
    if (command.type !== "delete-artboard") return;
    const board = document.artboards?.[command.artboardId];
    if (!board) return { accepted: false, reason: "Artboard no longer exists. Select an existing artboard." };
    if (board.locked) return { accepted: false, reason: "Artboard is locked. Unlock it in Artboards before deleting it." };
    if(board.frame?.stitch)throw Error("Detach the continuous frame in Stitch frames Review.");
    if(Object.values(document.artboards??{}).some(b=>b.frame?.stitch?.parts.some(p=>p.frameId===board.id)))throw Error("Detach referencing continuous frames before deleting this source frame.");
    if(board.frameSheet)throw Error("Delete the entire frame sheet set in Frame sheets Review.");
    if(Object.values(document.artboards??{}).some(b=>b.frameSheet?.placements.some(p=>p.frameId===board.id)))throw Error("Delete referencing frame sheet sets before deleting this frame.");
    if(Object.values(document.frameLinks??{}).some(l=>l.fromId===board.id||l.toId===board.id))throw Error("Detach frame connections before deleting this frame.");
    for(const s of Object.values(document.workspaceSections??{}))s.frameIds=s.frameIds.filter(id=>id!==command.artboardId);
    delete document.artboards![command.artboardId];
    if (!Object.keys(document.artboards!).length) delete document.artboards;
    document.revision++;
  });
}
