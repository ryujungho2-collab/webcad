import {dxfPlacement,dxfWcsPlane,dxfInsertPlacement} from "./dxfOcs";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { validateCommand } from "@agent-webcad/cad-commands";
import { parseDxf, type DxfEntity, type DxfParseResult } from "./dxfParser";
import { DXF_INPUT_UNITS, prepareDxf, type DxfPreparation, type DxfPreparationReport } from "./dxfPreparation";

export type DxfImportStats = {
  entities: number;
  created: number;
  skipped: string[];
  layers: string[];
  unitName: string;
  oriented?: number;
  preparation?: DxfPreparationReport;
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
  if(entity.kind==="spline"){const p=entity.controlPoints;return p.every(q=>Math.abs(q[2]-p[0][2])<1e-7)?"XY":p.every(q=>Math.abs(q[1]-p[0][1])<1e-7)?"XZ":"YZ";}
  if(entity.kind==="ellipse"||entity.kind==="elliptic-arc"){const n=new Array(3).fill(0).map((_,i)=>Math.abs(entity.axisU[i])+Math.abs(entity.axisV[i]));return n[2]<1e-7?"XY":n[1]<1e-7?"XZ":n[0]<1e-7?"YZ":"XY";}
  if(entity.normal)return "XY";
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
  options?: DxfPreparation,
): DxfImportResult {
  const empty: DxfImportStats = { entities: 0, created: 0, skipped: [], layers: [], unitName: "" };
  let parsed;
  try {
    parsed = parseDxf(text);
  } catch {
    return { ok: false, reason: "Could not parse this file as DXF.", stats: empty };
  }
  return planParsedDxfImport(parsed, layerByName, tag, options);
}

/** Parsed source is reused when review controls change; no geometry work while typing. */
export function planParsedDxfImport(source: DxfParseResult, layerByName: Map<string, string>, tag: string, options?: DxfPreparation): DxfImportResult {
  let parsed = source, preparation: DxfPreparationReport | undefined;
  try {
    if (options) { const result = prepareDxf(source, options); parsed = result.parsed; preparation = result.report; }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Invalid import settings.", stats: { entities: 0, created: 0, skipped: [], layers: [], unitName: source.unitName } };
  }
  const stats: DxfImportStats = {
    entities: parsed.entities.length,
    created: 0,
    skipped: [...parsed.warnings],
    layers: [...parsed.layers],
    unitName: parsed.unitName,
    preparation,
  };
  if (!parsed.entities.length) {
    return { ok: false, reason: "No importable entities found (LINE/LWPOLYLINE/POLYLINE/CIRCLE/ARC).", stats };
  }

  const commands: Exclude<CadCommand, { type: "batch" }>[] = [];
  const layerIds = new Map<string, string>();
  parsed.layers.forEach((name, index) => {
    const existing = options?.reference ? undefined : layerByName.get(name);
    if (existing) {
      layerIds.set(name, existing);
      return;
    }
    const id = `dxf-${tag}-${sanitizeLayerName(name, index).replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")}`;
    const unique = layerIds.has(id) || [...layerIds.values()].includes(id) ? `${id}-${index}` : id;
    layerIds.set(name, unique);
    commands.push({ type: "create-layer", id: unique, name: sanitizeLayerName(options?.reference ? `CAD / ${name}` : name, index) });
    if(parsed.layerStyles[name])commands.push({type:"set-layer-style",layerId:unique,style:parsed.layerStyles[name]});
  });

  const prepareEntity=(entity:DxfEntity):DxfEntity=>{if(!entity.normal&&(entity.kind==="line"||entity.kind==="polyline")&&!entityPlane(entity)){const frame=dxfWcsPlane(entity.points);if(frame)return entity.kind==="line"?{...entity,points:[frame.points[0],frame.points[1]],normal:frame.normal}:{...entity,points:frame.points,normal:frame.normal};}return entity;};
  const blockIds=new Map<string,string>();
  const place=(entity:DxfEntity,command:Exclude<CadCommand,{type:"batch"}>)=>{if(entity.kind!=="spline"&&entity.kind!=="ellipse"&&entity.kind!=="elliptic-arc"&&entity.normal&&(command.type==="create-drawing"||command.type==="create-drafting")&&command.id){const p=command.type==="create-drafting"?dxfInsertPlacement([0,0,0],0,entity.normal):dxfPlacement({...command.params,kind:command.drawing},entity.normal);if(p.rotation.some(v=>v!==0))commands.push({type:"rotate-object",objectId:command.id,rotation:p.rotation});if(p.translation.some(v=>v!==0))commands.push({type:"move-object",objectId:command.id,translation:p.translation});}};
  const drawingCommand=(entity:DxfEntity,id:string,layerId:string):Exclude<CadCommand,{type:"batch"}>|null=>{
    if(entity.kind==="text")return {type:"create-drafting",id,layerId,params:{kind:"text",workPlane:"XY",point:entity.point,text:entity.text,height:entity.height,angle:entity.angle,...(entity.align?{align:entity.align}:{})}};
    if(entity.kind==="insert")return null;
    const plane=entityPlane(entity);if(!plane)return null;
    return {type:"create-drawing",id,layerId,drawing:entity.kind,params:{...entity,workPlane:plane}};
  };
  // Resolve nested definitions before their parents. Reject missing/cyclic
  // branches as a whole so a placed component cannot silently lose members.
  const visiting=new Set<string>(),rejected=new Set<string>();
  const insert=(entity:Extract<DxfEntity,{kind:"insert"}>,id:string,layerId:string)=>{
    const blockId=blockIds.get(entity.block);if(!blockId)return false;
    commands.push({type:"insert-block",id,blockId,layerId,position:[0,0,0],scale:entity.scale});
    const p=dxfInsertPlacement(entity.position,entity.angle,entity.normal);
    if(p.rotation.some(v=>v!==0))commands.push({type:"rotate-object",objectId:id,rotation:p.rotation});
    if(p.translation.some(v=>v!==0))commands.push({type:"move-object",objectId:id,translation:p.translation});
    return true;
  };
  const define=(name:string):boolean=>{
    if(blockIds.has(name))return true;if(rejected.has(name))return false;
    const block=parsed.blocks[name];
    if(!block||visiting.has(name)){stats.skipped.push(`Missing or cyclic block ${name}; definition excluded.`);rejected.add(name);return false;}
    visiting.add(name);
    for(const entity of block.entities)if(entity.kind==="insert"&&!define(entity.block)){visiting.delete(name);rejected.add(name);return false;}
    visiting.delete(name);
    const i=Object.keys(parsed.blocks).indexOf(name),id=`block-dxf-${tag}-${i}`,members:string[]=[],start=commands.length;
    for(const [j,original] of block.entities.entries()){
      const entity=prepareEntity(original),memberId=`dxf-${tag}-block-${i}-${j}`,layerId=layerIds.get(entity.layer);
      if(!layerId)continue;
      let translation:[number,number,number]=[0,0,0];
      if(entity.kind==="insert"){if(insert(entity,memberId,layerId)){members.push(memberId);translation=dxfInsertPlacement(entity.position,entity.angle,entity.normal).translation;}}
      else{
        const command=drawingCommand(entity,memberId,layerId);
        if(!command||!validateCommand(command)){commands.splice(start);rejected.add(name);stats.skipped.push(`Invalid member in block ${name}; definition excluded.`);return false;}
        commands.push(command);place(entity,command);members.push(memberId);
        if(entity.kind!=="spline"&&entity.kind!=="ellipse"&&entity.kind!=="elliptic-arc"&&entity.normal&&command.type==="create-drawing")translation=dxfPlacement({...command.params,kind:command.drawing},entity.normal).translation;
      }
      // Definitions use a zero base. This also supports elevated DXF bases.
      if(block.base.some(v=>v!==0))commands.push({type:"move-object",objectId:memberId,translation:translation.map((v,k)=>v-block.base[k]) as [number,number,number]});
    }
    if(!members.length){rejected.add(name);stats.skipped.push(`Empty block ${name}; definition excluded.`);return false;}
    commands.push({type:"define-block",id,name,objectIds:members,base:[0,0,0]});
    commands.push(...members.map(objectId=>({type:"set-object-visible" as const,objectId,visible:false})));blockIds.set(name,id);return true;
  };
  for(const name of Object.keys(parsed.blocks))define(name);

  const rootsStart = commands.length;
  let created = 0;
  parsed.entities.forEach((original, index) => {
    const entity=prepareEntity(original);
    if(entity.kind==="text"||entity.kind==="insert"){
      const id=`dxf-${tag}-${index}`,layerId=layerIds.get(entity.layer)!;
      if(entity.kind==="text"){
        const command=drawingCommand(entity,id,layerId)!;if(validateCommand(command)){commands.push(command);place(entity,command);created++;if(entity.normal)stats.oriented=(stats.oriented??0)+1;}else stats.skipped.push(`Invalid TEXT ${index}`);
      }else{
        const blockId=blockIds.get(entity.block);if(!blockId){stats.skipped.push(`Missing block ${entity.block}`);return;}
        insert(entity,id,layerId);created++;if(entity.normal)stats.oriented=(stats.oriented??0)+1;
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
    } else if(entity.kind==="spline"){const {layer:_,kind:__,...spline}=entity;commands.push({type:"create-drawing",id,drawing:"spline",layerId,params:{...spline,workPlane:plane}});
    } else if(entity.kind==="ellipse"||entity.kind==="elliptic-arc"){commands.push({type:"create-drawing",id,drawing:entity.kind,layerId,params:{center:entity.center,axisU:entity.axisU,axisV:entity.axisV,startParam:entity.startParam,sweep:entity.sweep,workPlane:plane}});
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
    const createdCommand=commands.at(-1)!;place(entity,createdCommand);
    created += 1;
    if(entity.normal)stats.oriented=(stats.oriented??0)+1;
  });
  stats.created = created;
  if (!created) {
    return { ok: false, reason: "Every entity was skipped — see warnings.", stats };
  }
  // Apply the world offset once to root placements, never to definition members.
  const origin = options?.originMm;
  if (origin?.some(v => v !== 0)) {
    const translations = new Map<string, [number, number, number]>();
    for (const c of commands.slice(rootsStart)) {
      if ((c.type === "create-drawing" || c.type === "create-drafting" || c.type === "insert-block") && c.id) translations.set(c.id, [0, 0, 0]);
      if (c.type === "move-object") translations.set(c.objectId, c.translation);
    }
    for (const [objectId, translation] of translations) commands.push({ type: "move-object", objectId, translation: translation.map((v, i) => v - origin[i]) as [number, number, number] });
  }
  const importedRoots=commands.slice(rootsStart).flatMap(c=>(c.type==="create-drawing"||c.type==="create-drafting"||c.type==="insert-block")&&c.id?[c.id]:[]);
  if(importedRoots.length)commands.push({type:"record-dxf-source",objectIds:importedRoots,receipt:{...(options?.layerRoles?{layerRoles:options.layerRoles}:{}),...(options?.unitCheck?{unitCheck:options.unitCheck}:{}),sourceName:options?.sourceName??tag,sourceTag:tag,unitMm:options?.unit&&options.unit!=="file"?DXF_INPUT_UNITS[options.unit]:parsed.unitScale,originMm:options?.originMm??[0,0,0],layers:options?.includedLayers??parsed.layers}});
  if (options?.reference) for (const layerId of layerIds.values()) commands.push({ type: "set-layer-locked", layerId, locked: true });
  const command: CadCommand = { type: "batch", label: `Import DXF (${created} entities)`, commands };
  if (!validateCommand(command)) {
    return { ok: false, reason: "Planned import commands failed validation.", stats };
  }
  return { ok: true, command, stats };
}
