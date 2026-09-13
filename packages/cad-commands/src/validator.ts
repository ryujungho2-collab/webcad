import type { CadCommand } from "./commands";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

export function validateCommand(command: unknown): command is CadCommand {
  if (!isRecord(command) || !isString(command.type)) {
    return false;
  }

  switch (command.type) {
    case "create-box":
      return (
        isFiniteNumber(command.width) && command.width > 0 &&
        isFiniteNumber(command.depth) && command.depth > 0 &&
        isFiniteNumber(command.height) && command.height > 0 &&
        (command.id === undefined || isString(command.id)) &&
        (command.layerId === undefined || isString(command.layerId)) &&
        (command.position === undefined || isVector3(command.position))
      );
    case "boolean-cut":
      return isString(command.target) && isString(command.tool);
    case "fillet":
      return (
        isString(command.target) &&
        Array.isArray(command.edges) &&
        command.edges.every(isString) &&
        isFiniteNumber(command.radius) &&
        command.radius > 0
      );
    case "create-layer":
      return (
        (command.id === undefined || isString(command.id)) &&
        (command.name === undefined || isString(command.name))
      );
    case "rename-layer":
      return isString(command.layerId) && isString(command.name);
    case "set-layer-visible":
      return isString(command.layerId) && typeof command.visible === "boolean";
    case "set-layer-locked":
      return isString(command.layerId) && typeof command.locked === "boolean";
    case "delete-layer":
      return isString(command.layerId);
    case "move-object-to-layer":
      return isString(command.objectId) && isString(command.layerId);
    case "set-object-visible":
      return isString(command.objectId) && typeof command.visible === "boolean";
    case "isolate-object":
      return isString(command.objectId);
    case "show-all-objects":
      return true;
    case "rename-object":
      return isString(command.objectId) && isString(command.name);
    case "update-box":
      return (
        isString(command.objectId) &&
        isFiniteNumber(command.width) && command.width > 0 &&
        isFiniteNumber(command.depth) && command.depth > 0 &&
        isFiniteNumber(command.height) && command.height > 0
      );
    case "move-object":
      return isString(command.objectId) && isVector3(command.translation);
    case "rotate-object":
      return isString(command.objectId) && isVector3(command.rotation);
    case "scale-object":
      return isString(command.objectId) && isVector3(command.scale) && command.scale.every((value) => value > 0);
    case "delete-object":
    case "duplicate-object":
      return isString(command.objectId);
    default:
      return false;
  }
}
