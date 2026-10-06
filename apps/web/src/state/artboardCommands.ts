import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import type { CadDocument } from "@agent-webcad/cad-document";

export function registerArtboardCommandHandlers(bus: CommandBus, document: CadDocument) {
  bus.registerHandler("create-artboard", command => {
    if (command.type !== "create-artboard") return;
    const id = command.id ?? `artboard-${crypto.randomUUID()}`;
    if (document.artboards?.[id]) return { accepted: false, reason: "An artboard with this ID already exists. Choose another ID." };
    const artboards = document.artboards ??= {};
    artboards[id] = { id, name: command.name?.trim() || `Artboard ${Object.keys(artboards).length + 1}`, workPlane: command.workPlane, origin: [...command.origin] as [number, number], size: [...command.size] as [number, number], background: command.background ?? "#ffffff", visible: true, locked: false };
    document.revision++;
    return id;
  });
  bus.registerHandler("update-artboard", command => {
    if (command.type !== "update-artboard") return;
    const board = document.artboards?.[command.artboardId];
    if (!board) return { accepted: false, reason: "Artboard no longer exists. Select an existing artboard." };
    if (board.locked && (command.origin || command.size || command.workPlane)) return { accepted: false, reason: "Artboard is locked. Unlock it in Artboards before changing its plane, origin, or size." };
    const next = { ...board, ...(command.name === undefined ? {} : { name: command.name.trim() || board.name }), ...(command.origin ? { origin: [...command.origin] as [number, number] } : {}), ...(command.size ? { size: [...command.size] as [number, number] } : {}), ...(command.workPlane ? { workPlane: command.workPlane } : {}), ...(command.background ? { background: command.background } : {}), ...(command.visible === undefined ? {} : { visible: command.visible }), ...(command.locked === undefined ? {} : { locked: command.locked }) };
    if (JSON.stringify(next) === JSON.stringify(board)) return { accepted: false, reason: "Artboard is unchanged. Edit its values to prepare a new review." };
    document.artboards![command.artboardId] = next;
    document.revision++;
  });
  bus.registerHandler("delete-artboard", command => {
    if (command.type !== "delete-artboard") return;
    const board = document.artboards?.[command.artboardId];
    if (!board) return { accepted: false, reason: "Artboard no longer exists. Select an existing artboard." };
    if (board.locked) return { accepted: false, reason: "Artboard is locked. Unlock it in Artboards before deleting it." };
    delete document.artboards![command.artboardId];
    if (!Object.keys(document.artboards!).length) delete document.artboards;
    document.revision++;
  });
}
