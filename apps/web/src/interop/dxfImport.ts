import type { CadCommand } from "@agent-webcad/cad-commands";
import { validateCommand } from "@agent-webcad/cad-commands";
import { parseDxf, type DxfEntity } from "./dxfParser";

export type DxfImportStats = {
  entities: number;
  created: number;
  skipped: string[];
  layers: string[];
  unitName: string;
};

export type DxfImportResult =
  | { ok: true; command: CadCommand; stats: DxfImportStats }
  | { ok: false; reason: string; stats: DxfImportStats };

const PLANAR_TOLERANCE = 1e-6;

function sanitizeLayerName(name: string, index: number): string {
  const cleaned = name.replace(/[\r\n]/g, "").trim().slice(0, 120) || `Layer ${index + 1}`;
  return cleaned;
}

/** Entity plane by constant coordinate, or null when it leaves every principal plane. */
function entityPlane(entity: DxfEntity): "XY" | "XZ" | "YZ" | null {
  if(entity.kind==="polyline"&&entity.bulges?.some(b=>b!==0))return entity.points.every(p=>Math.abs(p[2]-entity.points[0][2])<=PLANAR_TOLERANCE)?"XY":null;
  if(entity.kind==="text"||entity.kind==="insert")return "XY";
  const points = entity.kind === "line" || entity.kind === "polyline"
    ? entity.points
    : entity.kind === "arc"
      ? [...Array.from({ length: 33 }, (_, index) => {
        const angle = entity.startAngle + ((entity.endAngle - entity.startAngle) * index) / 32;
        const center = entity.center;
        return [center[0] + Math.cos(angle) * entity.radius, center[1] + Math.sin(angle) * entity.radius, center[2]] as [number, number, number];
      })]
      : [...Array.from({ length: 33 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 32;
        const center = entity.center;
        return [center[0] + Math.cos(angle) * entity.radius, center[1] + Math.sin(angle) * entity.radius, center[2]] as [number, number, number];
      })];
  const flat = (pick: (point: [number, number, number]) => number): boolean => {
    const base = pick(points[0]);
    return points.every((point) => Math.abs(pick(point) - base) <= PLANAR_TOLERANCE);
  };
  if (flat((point) => point[2])) return "XY";
  if (flat((point) => point[1])) return "XZ";
  if (flat((point) => point[0])) return "YZ";
  return null;
}

/**
 * Plans a DXF import as one undoable batch: missing layers first, then one
 * create-drawing per mappable entity with deterministic ids. Re-importing
 * the same file is a safe atomic no-op (id collisions reject the batch)
 * instead of duplicating geometry. layerByName maps existing DXF layer
 * names to document layer ids so structure survives across imports.
 */
export function planDxfImport(
  text: string,
  layerByName: Map<string, string>,
  tag: string,
): DxfImportResult {
  const empty: DxfImportStats = { entities: 0, created: 0, skipped: [], layers: [], unitName: "" };
  let parsed;
  try {
    parsed = parseDxf(text);
  } catch {
    return { ok: false, reason: "Could not parse this file as DXF.", stats: empty };
  }
  const stats: DxfImportStats = {
    entities: parsed.entities.length,
    created: 0,
    skipped: [...parsed.warnings],
    layers: [...parsed.layers],
    unitName: parsed.unitName,
  };
  if (!parsed.entities.length) {
    return { ok: false, reason: "No importable entities found (LINE/LWPOLYLINE/POLYLINE/CIRCLE/ARC).", stats };
  }

  const commands: Exclude<CadCommand, { type: "batch" }>[] = [];
  const layerIds = new Map<string, string>();
  parsed.layers.forEach((name, index) => {
    const existing = layerByName.get(name);
    if (existing) {
      layerIds.set(name, existing);
      return;
    }
    const id = `dxf-${tag}-${sanitizeLayerName(name, index).replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")}`;
    const unique = layerIds.has(id) || [...layerIds.values()].includes(id) ? `${id}-${index}` : id;
    layerIds.set(name, unique);
    commands.push({ type: "create-layer", id: unique, name: sanitizeLayerName(name, index) });
    if(parsed.layerStyles[name])commands.push({type:"set-layer-style",layerId:unique,style:parsed.layerStyles[name]});
  });

  const blockIds=new Map<string,string>();
  const drawingCommand=(entity:DxfEntity,id:string,layerId:string):Exclude<CadCommand,{type:"batch"}>|null=>{
    if(entity.kind==="text")return {type:"create-drafting",id,layerId,params:{kind:"text",workPlane:"XY",point:entity.point,text:entity.text,height:entity.height,angle:entity.angle,...(entity.align?{align:entity.align}:{})}};
    if(entity.kind==="insert")return null;
    const plane=entityPlane(entity);if(!plane)return null;
    return {type:"create-drawing",id,layerId,drawing:entity.kind,params:{...entity,workPlane:plane}};
  };
  Object.entries(parsed.blocks).forEach(([name,block],i)=>{
    const id=`block-dxf-${tag}-${i}`,members:string[]=[];
    block.entities.forEach((entity,j)=>{const memberId=`dxf-${tag}-block-${i}-${j}`,layerId=layerIds.get(entity.layer)??layerIds.values().next().value;
      if(!layerId)return;const command=drawingCommand(entity,memberId,layerId);if(command&&validateCommand(command)){commands.push(command);members.push(memberId);}});
    if(members.length){commands.push({type:"define-block",id,name,objectIds:members,base:block.base});commands.push(...members.map(objectId=>({type:"set-object-visible" as const,objectId,visible:false})));blockIds.set(name,id);}
  });

  let created = 0;
  parsed.entities.forEach((entity, index) => {
    if(entity.kind==="text"||entity.kind==="insert"){
      const id=`dxf-${tag}-${index}`,layerId=layerIds.get(entity.layer)!;
      if(entity.kind==="text"){
        const command=drawingCommand(entity,id,layerId)!;if(validateCommand(command)){commands.push(command);created++;}else stats.skipped.push(`Invalid TEXT ${index}`);
      }else{
        const blockId=blockIds.get(entity.block);if(!blockId){stats.skipped.push(`Missing block ${entity.block}`);return;}
        commands.push({type:"insert-block",id,blockId,layerId,position:entity.position,angle:entity.angle});
        if(entity.scale.some(v=>v!==1))commands.push({type:"scale-object",objectId:id,scale:entity.scale});created++;
      }return;
    }
    const plane = entityPlane(entity);
    if (!plane) {
      stats.skipped.push(`${entity.kind} on layer "${entity.layer}" is not planar; skipped.`);
      return;
    }
    const id = `dxf-${tag}-entity-${index}`;
    const layerId = layerIds.get(entity.layer) ?? [...layerIds.values()][0];
    if (entity.kind === "line") {
      const [a, b] = entity.points;
      if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= 1e-9) {
        stats.skipped.push(`Zero-length LINE on layer "${entity.layer}"; skipped.`);
        return;
      }
      commands.push({
        type: "create-drawing", id, drawing: "line",
        params: { points: entity.points, workPlane: plane }, layerId,
      });
    } else if (entity.kind === "polyline") {
      // R12 closed polylines often repeat the start point; our topology
      // owns closure via the closed flag instead.
      const points = [...entity.points];
      if (entity.closed && points.length > 2) {
        const first = points[0];
        const last = points[points.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1], first[2] - last[2]) <= 1e-6) points.pop();
      }
      if (points.length < 2) {
        stats.skipped.push(`Degenerate polyline on layer "${entity.layer}"; skipped.`);
        return;
      }
      commands.push({
        type: "create-drawing", id, drawing: "polyline",
        params: { points, ...(entity.bulges?{bulges:[...entity.bulges]}:{}), ...(entity.closed ? { closed: true } : {}), workPlane: plane }, layerId,
      });
    } else if (entity.kind === "circle") {
      commands.push({
        type: "create-drawing", id, drawing: "circle",
        params: { center: entity.center, radius: entity.radius, workPlane: plane }, layerId,
      });
    } else {
      if (Math.abs(entity.endAngle - entity.startAngle) <= 1e-9) {
        stats.skipped.push(`Zero-sweep ARC on layer "${entity.layer}"; skipped.`);
        return;
      }
      commands.push({
        type: "create-drawing", id, drawing: "arc",
        params: {
          center: entity.center, radius: entity.radius,
          startAngle: entity.startAngle, endAngle: entity.endAngle, workPlane: plane,
        }, layerId,
      });
    }
    created += 1;
  });
  stats.created = created;
  if (!created) {
    return { ok: false, reason: "Every entity was skipped — see warnings.", stats };
  }
  const command: CadCommand = { type: "batch", label: `Import DXF (${created} entities)`, commands };
  if (!validateCommand(command)) {
    return { ok: false, reason: "Planned import commands failed validation.", stats };
  }
  return { ok: true, command, stats };
}
