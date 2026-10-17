import {splineClosed} from "../precision/splineGeometry";
import {validSpline} from "@agent-webcad/cad-document";
import {validEllipse} from "@agent-webcad/cad-document";
import { dxfOcs } from "./dxfOcs";
import type { LayerStyle } from "@agent-webcad/cad-document";
export type DxfEntity = (
  | ({layer:string;kind:"spline"}&import("@agent-webcad/cad-document").CadSpline)
  | ({layer:string;kind:"ellipse"}&import("@agent-webcad/cad-document").CadEllipse)
  | ({layer:string;kind:"elliptic-arc"}&import("@agent-webcad/cad-document").CadEllipse)
  | {layer:string;kind:"text";point:[number,number,number];text:string;height:number;angle:number;align?:"center"}
  | {layer:string;kind:"insert";block:string;position:[number,number,number];scale:[number,number,number];angle:number}
  | { layer: string; kind: "line"; points: [[number, number, number], [number, number, number]] }
  | { layer: string; kind: "polyline"; points: [number, number, number][]; closed: boolean; bulges?: number[] }
  | { layer: string; kind: "circle"; center: [number, number, number]; radius: number }
  | { layer: string; kind: "arc"; center: [number, number, number]; radius: number; startAngle: number; endAngle: number }) & {normal?:[number,number,number]};

export type DxfParseResult = {
  entities: DxfEntity[];
  layers: string[];
  /** Millimeters per DXF unit. */
  unitScale: number;
  unitName: string;
  warnings: string[];
  layerStyles: Record<string,LayerStyle>;
  blocks: Record<string,{base:[number,number,number];entities:DxfEntity[]}>;
};

const UNIT_SCALES: Record<number, { scale: number; name: string }> = {
  0: { scale: 1, name: "unitless" },
  1: { scale: 25.4, name: "inches" },
  2: { scale: 304.8, name: "feet" },
  4: { scale: 1, name: "mm" },
  5: { scale: 10, name: "cm" },
  6: { scale: 1000, name: "m" },
  8: { scale: 0.0254 / 1000, name: "microinches" },
  9: { scale: 0.0254, name: "mils" },
  10: { scale: 914.4, name: "yards" },
};

function pairs(text: string): [number, string][] {
  const lines = text.split(/\r?\n/);
  const result: [number, string][] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number(lines[index].trim());
    if (!Number.isInteger(code)) continue;
    result.push([code, lines[index + 1] ?? ""]);
  }
  return result;
}

/**
 * Minimal R12-compatible DXF reader: HEADER $INSUNITS, LAYER names, and the
 * LINE / LWPOLYLINE / POLYLINE / CIRCLE / ARC subset we can map 1:1 onto
 * create-drawing commands. Anything else (3D solids, blocks, leaders,
 * unsupported width/OCS/mesh semantics; off-plane geometry is kept for the planner) is skipped
 * with a counted warning instead of silent data loss.
 */
export function parseDxf(text: string): DxfParseResult {
  const warnings: string[] = [];
  const entities: DxfEntity[] = [];
  const layerSet = new Set<string>();
  const layerStyles:Record<string,LayerStyle>={},blocks:DxfParseResult["blocks"]={};
  let unitScale = 1;
  let unitName = "mm (assumed)";

  const tokens = pairs(text);
  let section = "";
  let i = 0;

  while (i < tokens.length) {
    const [code, value] = tokens[i];
    i += 1;
    if (code !== 0) {
      // HEADER $INSUNITS arrives as code-9 + code-70, not code-0.
      if (section === "HEADER" && code === 9 && value.trim() === "$INSUNITS") {
        const unitCode = tokens[i]?.[0] === 70 ? Number(tokens[i][1]) : NaN;
        if (tokens[i]?.[0] === 70) i += 1;
        const known = UNIT_SCALES[unitCode];
        if (known) {
          unitScale = known.scale;
          unitName = known.name;
        } else {
          warnings.push(`Unknown $INSUNITS ${unitCode}; assuming millimetres.`);
        }
      }
      continue;
    }
    if (value === "SECTION") {
      const name = tokens[i]?.[0] === 2 ? tokens[i][1] : "";
      if (tokens[i]?.[0] === 2) i += 1;
      section = name;
      continue;
    }
    if (value === "ENDSEC") {
      section = "";
      continue;
    }
    if (section === "TABLES" && value === "LAYER") {
      const fields=new Map<number,string>();
      while (i < tokens.length && tokens[i][0] !== 0) {
        fields.set(tokens[i][0],tokens[i][1]);
        i += 1;
      }
      const name=fields.get(2)?.trim();
      if(name){layerSet.add(name);const color=Number(fields.get(420)),aci=Math.abs(Number(fields.get(62)??7)),palette=["#000000","#ff0000","#ffff00","#00ff00","#00ffff","#0000ff","#ff00ff","#000000","#808080","#c0c0c0"];
        layerStyles[name]={color:Number.isFinite(color)?`#${color.toString(16).padStart(6,"0")}`:palette[aci]??"#4f8cff",lineType:fields.get(6)==="DASHED"?"dashed":fields.get(6)==="CENTER"?"center":"continuous",lineWeight:Number(fields.get(370))>0?Number(fields.get(370))/100:0.25};}
      continue;
    }
    if(section==="BLOCKS" && value==="BLOCK"){
      const fields=new Map<number,string>();while(i<tokens.length&&tokens[i][0]!==0){fields.set(...tokens[i]);i++;}
      const name=fields.get(2)??"",base:[number,number,number]=[10,20,30].map(code=>Number(fields.get(code)??0)*unitScale) as [number,number,number],members:DxfEntity[]=[];
      while(i<tokens.length&&tokens[i][1]!=="ENDBLK"){
        const type=tokens[i++][1],member=readEntity(type,tokens,i);i=member.next;
        if(member.parsed){members.push(scaleEntity(member.parsed,unitScale));}else if(member.warning)warnings.push(member.warning);
      }
      if(name)blocks[name]={base,entities:members};continue;
    }
    if (section === "ENTITIES") {
      const entity = readEntity(value, tokens, i);
      i = entity.next;
      if (entity.parsed) {
        entities.push(scaleEntity(entity.parsed, unitScale));
        layerSet.add(entity.parsed.layer);
      } else if (entity.warning) {
        warnings.push(entity.warning);
      }
    }
  }

  return { entities, layers: [...layerSet], unitScale, unitName, warnings, layerStyles, blocks };
}

type EntityRead =
  | { next: number; parsed: DxfEntity; warning?: undefined }
  | { next: number; parsed: null; warning: string | null };

function readEntity(type: string, tokens: [number, string][], start: number): EntityRead {
  let i = start;
  const fields = new Map<number, string[]>();
  const ordered: [number,string][] = [];
  const vertices: [number, string][][] = [];
  while (i < tokens.length && tokens[i][0] !== 0) {
    const [code, value] = tokens[i];
    ordered.push([code,value]);
    i += 1;
    (fields.get(code) ?? fields.set(code, []).get(code)!).push(value);
  }
  // VERTEX followers of POLYLINE each start at their own code-0.
  if (type === "POLYLINE") {
    while (i < tokens.length && tokens[i][0] === 0 && tokens[i][1] === "VERTEX") {
      i += 1;
      const vertex: [number, string][] = [];
      while (i < tokens.length && tokens[i][0] !== 0) {
        vertex.push(tokens[i]);
        i += 1;
      }
      vertices.push(vertex);
    }
    // Consume the closing SEQEND entity (code-0 + pairs) so the outer loop
    // resumes on real content.
    if (i < tokens.length && tokens[i][0] === 0 && tokens[i][1] === "SEQEND") {
      i += 1;
      while (i < tokens.length && tokens[i][0] !== 0) i += 1;
    }
  }

  const first = (code: number): string | undefined => fields.get(code)?.[0];
  const num = (code: number, fallback = 0): number => {
    const value = Number(first(code));
    return Number.isFinite(value) ? value : fallback;
  };
  const layer = (first(8) ?? "0").trim() || "0";
  const point = (prefix: { x: number; y: number; z: number }): [number, number, number] => [
    num(prefix.x), num(prefix.y), num(prefix.z),
  ];

  const ocsType=["ELLIPSE","CIRCLE","ARC","LWPOLYLINE","POLYLINE","TEXT","INSERT"].includes(type)&&!(type==="POLYLINE"&&(num(70)&8));
  let normal:[number,number,number]|undefined,extrusionError="";
  if(ocsType){try{const n=[210,220,230].map((code,j)=>first(code)===undefined?j===2?1:0:Number(first(code)));if([210,220,230].some(code=>(fields.get(code)?.length??0)>1)||n.some(v=>!Number.isFinite(v))||[210,220,230].some(code=>first(code)!==undefined&&!first(code)!.trim()))throw new Error();const normalized=dxfOcs(n as [number,number,number]).normal;if(normalized.some((v,j)=>Math.abs(v-(j===2?1:0))>1e-12))normal=normalized;}catch{extrusionError="invalid extrusion/OCS normal";}}
  const finish = (result: { parsed: DxfEntity } | { parsed: null; warning: string | null }): EntityRead => {
    const numericError=["ELLIPSE","LINE","CIRCLE","ARC","TEXT","INSERT"].includes(type)&&ordered.some(([code,value])=>[10,20,30,11,21,31,39,40,41,42,43,50,51].includes(code)&&(!value.trim()||!Number.isFinite(Number(value))));
    const reason=extrusionError || (numericError?"invalid numeric coordinate/angle":["ELLIPSE","LINE","CIRCLE","ARC","TEXT","INSERT"].includes(type)&&first(39)!==undefined&&Number(first(39))!==0?"thickness semantics are unsupported":"");
    if(reason)return {next:i,parsed:null,warning:`${type} on layer "${layer}": ${reason}; skipped.`};
    return result.parsed ? {next:i,parsed:{...result.parsed,...(normal?{normal}:{})}} : {next:i,parsed:null,warning:result.warning??null};
  };

  if (type === "LINE") {
    return finish({ parsed: { layer, kind: "line", points: [point({ x: 10, y: 20, z: 30 }), point({ x: 11, y: 21, z: 31 })] } });
  }
  if(type==="TEXT"&&(num(41,1)!==1||num(51)!==0||num(71)!==0||![0,1].includes(num(72))||num(73)!==0))return {next:i,parsed:null,warning:`TEXT on layer "${layer}": width, oblique, mirrored or unsupported alignment semantics; skipped.`};
  if(type==="INSERT"&&(num(70,1)!==1||num(71,1)!==1||num(66)!==0||[41,42,43].some(code=>num(code,1)===0)))return {next:i,parsed:null,warning:`INSERT on layer "${layer}": array, attributes or zero scale semantics; skipped.`};
  if(type==="TEXT")return finish({parsed:{layer,kind:"text",point:num(72)===1?point({x:11,y:21,z:31}):point({x:10,y:20,z:30}),text:(first(1)??"").replace(/\\U\+([0-9A-F]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))),height:num(40),angle:num(50),...(num(72)===1?{align:"center" as const}:{})}});
  if(type==="INSERT")return finish({parsed:{layer,kind:"insert",block:first(2)??"",position:point({x:10,y:20,z:30}),scale:[num(41,1),num(42,1),num(43,1)],angle:num(50)}});
  const rejectPolyline=(reason:string)=>finish({parsed:null,warning:`${type} on layer "${layer}": ${reason}; skipped.`});
  const finishPolyline=(points:[number,number,number][],bulges:number[],closed:boolean):EntityRead=>{
    if(points.length<2||points.some(p=>!p.every(Number.isFinite))||bulges.some(b=>!Number.isFinite(b)))return rejectPolyline("invalid coordinates/bulges or fewer than 2 vertices");
    if(closed&&points.length>2&&Math.hypot(...points[0].map((v,i)=>v-points.at(-1)![i]))<=1e-9){
      if(bulges.at(-1)!==0)return rejectPolyline("repeated closing vertex has a nonzero bulge");
      points.pop();bulges.pop();
    }
    if(!closed&&bulges.at(-1)!==0)return rejectPolyline("last open vertex has no segment for its bulge");
    const count=points.length-1+(closed?1:0);
    if(Array.from({length:count},(_,j)=>Math.hypot(...points[j].map((v,k)=>v-points[(j+1)%points.length][k]))).some(length=>length<=1e-9))return rejectPolyline("zero-length segment");
    return finish({parsed:{layer,kind:"polyline",points,closed,...(bulges.some(b=>b!==0)?{bulges:bulges.slice(0,count)}:{})}});
  };
  if(type==="LWPOLYLINE"||type==="POLYLINE"){
    if([...ordered,...vertices.flat()].some(([code,value])=>[10,20,30,38,39,40,41,42,43,70,90,210,220,230].includes(code)&&(!value.trim()||!Number.isFinite(Number(value)))))return rejectPolyline("invalid numeric vertex/header value");
    if([39,40,41,43].some(code=>(fields.get(code)??[]).some(v=>!Number.isFinite(Number(v))||Number(v)!==0)))return rejectPolyline("width/thickness semantics are unsupported");
    if(first(70)!==undefined&&!Number.isInteger(Number(first(70))))return rejectPolyline("invalid polyline flags");
  }
  if (type === "LWPOLYLINE") {
    const points: [number, number, number][] = [];
    const bulges:number[]=[],flags=num(70),height=first(38)===undefined?0:Number(first(38));
    if(flags&~129)return rejectPolyline("unsupported polyline flags");
    let vertex:Map<number,string>|undefined;
    const flush=()=>{if(vertex){points.push([Number(vertex.get(10)),Number(vertex.get(20)),height]);bulges.push(vertex.has(42)?Number(vertex.get(42)):0);}};
    for(const [code,value] of ordered){
      if(code===10){flush();vertex=new Map([[10,value]]);}
      else if([20,42].includes(code)){if(!vertex||vertex.has(code))return rejectPolyline("missing or duplicate vertex coordinate/bulge");vertex.set(code,value);}
    }
    flush();
    if(first(90)!==undefined&&Number(first(90))!==points.length)return rejectPolyline("declared vertex count does not match coordinates");
    return finishPolyline(points,bulges,(flags&1)===1);
  }
  if (type === "POLYLINE") {
    const points: [number, number, number][] = [];
    const bulges:number[]=[],flags=num(70),height=first(30)===undefined?0:Number(first(30));
    if(flags&~137)return rejectPolyline("mesh, fitted or spline polylines are unsupported");
    for (const vertex of vertices) {
      const get=(code:number,fallback=0)=>{const values=vertex.filter(([c])=>c===code);return values.length>1?NaN:values.length?Number(values[0][1]):fallback;};
      if(!Number.isInteger(get(70))||[40,41].some(code=>get(code)!==0)||get(70)&~32)return rejectPolyline("vertex width, fitted or mesh semantics are unsupported");
      const bulge=get(42);if(flags&8&&bulge!==0)return rejectPolyline("3D POLYLINE cannot preserve a bulge");
      if(!(flags&8)&&get(30)!==0)return rejectPolyline("2D vertex Z must be zero; use header elevation");
      points.push([get(10,NaN),get(20,NaN),flags&8?get(30):height]);bulges.push(bulge);
    }
    return finishPolyline(points,bulges,(flags&1)===1);
  }
  if(type==="SPLINE"){const knots=ordered.filter(([code])=>code===40).map(([,v])=>Number(v)),weights=ordered.filter(([code])=>code===41).map(([,v])=>Number(v)),degree=num(71),controlPoints:[number,number,number][]=[];let p:[number,number,number]|undefined;for(const [code,value] of ordered){if(code===10){p=[Number(value),0,0];controlPoints.push(p);}else if(p&&code===20)p[1]=Number(value);else if(p&&code===30)p[2]=Number(value);}const flags=num(70),curve={degree,knots,controlPoints,...weights.length?{weights}:{},domain:[knots[degree],knots[controlPoints.length]] as [number,number]};if(flags&2||num(74)!==0||num(72)!==knots.length||num(73)!==controlPoints.length||!validSpline(curve)||!!(flags&1)!==splineClosed(curve))return finish({parsed:null,warning:`SPLINE on layer "${layer}": periodic/fit-only or invalid knots, weights, counts/domain; skipped.`});return finish({parsed:{...curve,layer,kind:"spline"}});}
  if(type==="ELLIPSE"){const center=point({x:10,y:20,z:30}),axisU=point({x:11,y:21,z:31}),n=normal??[0,0,1],ratio=num(40),axisV=[n[1]*axisU[2]-n[2]*axisU[1],n[2]*axisU[0]-n[0]*axisU[2],n[0]*axisU[1]-n[1]*axisU[0]].map(v=>v*ratio) as [number,number,number],startParam=num(41),end=num(42,2*Math.PI),raw=end-startParam,sweep=Math.abs(raw-2*Math.PI)<1e-9?2*Math.PI:((raw%(2*Math.PI))+2*Math.PI)%(2*Math.PI),e={center,axisU,axisV,startParam,sweep};if(!validEllipse(e)||ratio<=0||ratio>1||Math.abs(axisU.reduce((s,v,i)=>s+v*n[i],0))>1e-7*Math.hypot(...axisU))return finish({parsed:null,warning:`ELLIPSE on layer "${layer}": invalid axes/ratio/domain; skipped.`});return finish({parsed:{...e,layer,kind:Math.abs(sweep-2*Math.PI)<1e-9?"ellipse":"elliptic-arc"}});}
  if (type === "CIRCLE") {
    const radius = num(40);
    if (!(radius > 0)) return finish({ parsed: null, warning: `CIRCLE on layer "${layer}" has no positive radius; skipped.` });
    return finish({ parsed: { layer, kind: "circle", center: point({ x: 10, y: 20, z: 30 }), radius } });
  }
  if (type === "ARC") {
    const radius = num(40);
    if (!(radius > 0)) return finish({ parsed: null, warning: `ARC on layer "${layer}" has no positive radius; skipped.` });
    return finish({
      parsed: {
        layer, kind: "arc", center: point({ x: 10, y: 20, z: 30 }), radius,
        startAngle: (num(50) * Math.PI) / 180, endAngle: (num(50) * Math.PI) / 180 + ((num(51)-num(50))%360+360)%360*Math.PI/180,
      },
    });
  }
  if (["SEQEND", "ENDSEC", "ENDBLK"].includes(type)) {
    return finish({ parsed: null, warning: null });
  }
  return finish({ parsed: null, warning: `Unsupported DXF entity ${type}; skipped.` });
}

function scalePoint([x, y, z]: [number, number, number], scale: number): [number, number, number] {
  return [x * scale, y * scale, z * scale];
}

export function scaleEntity(entity: DxfEntity, scale: number): DxfEntity {
  if (scale === 1) return entity;
  if(entity.kind==="text")return {...entity,point:scalePoint(entity.point,scale),height:entity.height*scale};
  if(entity.kind==="insert")return {...entity,position:scalePoint(entity.position,scale)};
  if (entity.kind === "line") return { ...entity, points: [scalePoint(entity.points[0], scale), scalePoint(entity.points[1], scale)] };
  if (entity.kind === "polyline") return { ...entity, points: entity.points.map((point) => scalePoint(point, scale)) };
  if(entity.kind==="spline")return {...entity,controlPoints:entity.controlPoints.map(p=>scalePoint(p,scale))};
  if(entity.kind==="ellipse"||entity.kind==="elliptic-arc")return {...entity,center:scalePoint(entity.center,scale),axisU:scalePoint(entity.axisU,scale),axisV:scalePoint(entity.axisV,scale)};
  if (entity.kind === "circle") return { ...entity, center: scalePoint(entity.center, scale), radius: entity.radius * scale };
  return { ...entity, center: scalePoint(entity.center, scale), radius: entity.radius * scale };
}
