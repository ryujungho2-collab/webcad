import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import { validateModelViews, type CadDocument } from "@agent-webcad/cad-document";

export function isModelViewOnlyCommand(command: CadCommand): boolean {
  return command.type === "upsert-model-view" || command.type === "delete-model-view" ||
    command.type === "batch" && command.commands.length > 0 && command.commands.every(isModelViewOnlyCommand);
}

export function registerModelViewCommands(bus: CommandBus, document: CadDocument) {
  bus.registerHandler("upsert-model-view", command => {
    if (command.type !== "upsert-model-view") return;
    if (JSON.stringify(document.modelViews?.[command.view.id]) === JSON.stringify(command.view)) return { accepted: false, reason: "Model view is unchanged." };
    const views = { ...document.modelViews, [command.view.id]: structuredClone(command.view) };
    validateModelViews(views);
    document.modelViews = views; document.revision++;
  });
  bus.registerHandler("delete-model-view", command => {
    if (command.type !== "delete-model-view") return;
    if (!document.modelViews?.[command.viewId]) return { accepted: false, reason: "Select an existing model view." };
    delete document.modelViews[command.viewId];
    if (!Object.keys(document.modelViews).length) delete document.modelViews;
    document.revision++;
  });
}
