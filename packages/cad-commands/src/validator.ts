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

function isVector3Array(value: unknown, minimum: number) {
  return Array.isArray(value) && value.length >= minimum && value.every(isVector3);
}

function isDrawingParams(kind: unknown, params: unknown) {
  if (!isRecord(params) || typeof kind !== "string") return false;
  if (params.workPlane !== undefined && !["XY", "XZ", "YZ"].includes(String(params.workPlane))) return false;
  if (kind === "line") return Array.isArray(params.points) && isVector3Array(params.points, 2) && params.points.length === 2;
  if (kind === "polyline") return isVector3Array(params.points, 2);
  if (kind === "rectangle") return Array.isArray(params.points) && isVector3Array(params.points, 4) && params.points.length === 4;
  if (kind === "circle") return isVector3(params.center) && isFiniteNumber(params.radius) && params.radius > 0;
  if (kind === "arc") return isVector3(params.center) && isFiniteNumber(params.radius) && params.radius > 0 && isFiniteNumber(params.startAngle) && isFiniteNumber(params.endAngle) && params.startAngle !== params.endAngle;
  return false;
}

export function validateCommand(command: unknown): command is CadCommand {
  if (!isRecord(command) || !isString(command.type)) {
    return false;
  }

  switch (command.type) {
    case "batch":
      return Array.isArray(command.commands) && command.commands.length > 0 && command.commands.every((entry) => validateCommand(entry) && entry.type !== "batch");
    case "create-drawing":
      return ["line", "polyline", "rectangle", "circle", "arc"].includes(String(command.drawing)) &&
        isDrawingParams(command.drawing, command.params) &&
        (command.id === undefined || isString(command.id)) &&
        (command.layerId === undefined || isString(command.layerId));
    case "edit-drawing-control":
      return isString(command.objectId) && isString(command.controlId) && isVector3(command.point);
    case "create-primitive":
      return isString(command.primitive) && ["box", "cylinder", "sphere", "cone", "torus"].includes(command.primitive as string) &&
        isRecord(command.params) && Object.values(command.params).every((value) => isFiniteNumber(value) && value > 0) &&
        (command.id === undefined || isString(command.id)) &&
        (command.layerId === undefined || isString(command.layerId)) &&
        (command.position === undefined || isVector3(command.position));
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
    case "boolean-operation":
      return isString(command.operation) && ["union", "cut", "intersect"].includes(command.operation) && isString(command.target) && isString(command.tool) && command.target !== command.tool;
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
    case "update-primitive":
      return isString(command.objectId) && isRecord(command.params) && Object.values(command.params).every((value) => isFiniteNumber(value) && value > 0);
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
