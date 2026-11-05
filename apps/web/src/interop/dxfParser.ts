import {readDxfHatch} from "./dxfHatch";
import {dxfAciColor} from "./dxfColors";
import type {CadDxfStyle} from "@agent-webcad/cad-document";
import {readDxfMtext} from "./dxfMtext";
import {readDxfSpline} from "./dxfSpline";
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
  | { layer: string; kind: "arc"; center: [number, number, number]; radius: number; startAngle: number; endAngle: number }) & {normal?:[number,number,number];dxfStyle?:CadDxfStyle};

export type DxfParseResult = {
  entities: DxfEntity[];
  layers: string[];
  /** Millimeters per DXF unit. */
  unitScale: number;
  unitName: string;
  warnings: string[];
  curveConversions?: string[];
  blockDiagnostics?: Record<string,{warnings:string[];conversions:string[]}>;
  rootWarnings?:string[];
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
  const warnings: string[] = [], curveConversions: string[] = [];
  const entities: DxfEntity[] = [];
  const layerSet = new Set<string>();
  const layerStyles:Record<string,LayerStyle>={},blocks:DxfParseResult["blocks"]={};
  const blockDiagnostics:NonNullable<DxfParseResult["blockDiagnostics"]>={},rootWarnings:string[]=[];
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
          const warning=`Unknown $INSUNITS ${unitCode}; assuming millimetres.`;warnings.push(warning);rootWarnings.push(warning);
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
        layerStyles[name]={color:Number.isFinite(color)?`#${color.toString(16).padStart(6,"0")}`:(aci>=1&&aci<=255?dxfAciColor(aci):"#000000"),lineType:["DASHED","HIDDEN"].includes(fields.get(6)??"")?"dashed":fields.get(6)==="CENTER"?"center":"continuous",lineWeight:Number(fields.get(370))>0?Number(fields.get(370))/100:0.25};}
      continue;
    }
    if(section==="BLOCKS" && value==="BLOCK"){
      const fields=new Map<number,string>();while(i<tokens.length&&tokens[i][0]!==0){fields.set(...tokens[i]);i++;}
      const name=fields.get(2)??"",base:[number,number,number]=[10,20,30].map(code=>Number(fields.get(code)??0)*unitScale) as [number,number,number],members:DxfEntity[]=[];const diagnostics={warnings:[] as string[],conversions:[] as string[]};
      while(i<tokens.length&&tokens[i][1]!=="ENDBLK"){
        const type=tokens[i++][1],member=readEntity(type,tokens,i,unitScale,true);i=member.next;
        if(member.parsed){if(member.generatedBlock)blocks[member.generatedBlock.name]={base:[0,0,0],entities:member.generatedBlock.entities.map(e=>scaleEntity(e,unitScale))};if(member.conversion){curveConversions.push(`Block "${name}": ${member.conversion}`);diagnostics.conversions.push(`Block "${name}": ${member.conversion}`);}members.push(...[member.parsed,...member.additional??[]].map(e=>scaleEntity(e,unitScale)));}else if(member.warning){warnings.push(member.warning);diagnostics.warnings.push(member.warning);}
      }
      if(name){blocks[name]={base,entities:members};blockDiagnostics[name]=diagnostics;}continue;
    }
    if (section === "ENTITIES") {
      const entity = readEntity(value, tokens, i,unitScale);
      i = entity.next;
      if (entity.parsed) {
        if(entity.generatedBlock)blocks[entity.generatedBlock.name]={base:[0,0,0],entities:entity.generatedBlock.entities.map(e=>scaleEntity(e,unitScale))};
        if(entity.conversion)curveConversions.push(entity.conversion);
        entities.push(...[entity.parsed,...entity.additional??[]].map(e=>scaleEntity(e,unitScale)));
        layerSet.add(entity.parsed.layer);
      } else if (entity.warning) {
        warnings.push(entity.warning);rootWarnings.push(entity.warning);
      }
    }
  }

  return { entities, layers: [...layerSet], unitScale, unitName, warnings, curveConversions, layerStyles, blocks,blockDiagnostics,rootWarnings };
}

type EntityRead =
  | { next: number; parsed: DxfEntity; warning?: undefined; conversion?: string;additional?:DxfEntity[];generatedBlock?:{name:string;entities:DxfEntity[]} }
  | { next: number; parsed: null; warning: string | null };

function readGeometryEntity(type: string, tokens: [number, string][], start: number,unitScale:number): EntityRead {
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

  if(first(60)!==undefined&&num(60)!==0)return {next:i,parsed:null,warning:`Source-hidden DXF entity ${type} on layer "${layer}" omitted; hidden source geometry is not imported.`};

  const ocsType=["ELLIPSE","CIRCLE","ARC","LWPOLYLINE","POLYLINE","TEXT","INSERT"].includes(type)&&!(type==="POLYLINE"&&(num(70)&8));
  let normal:[number,number,number]|undefined,extrusionError="";
  if(ocsType){try{const n=[210,220,230].map((code,j)=>first(code)===undefined?j===2?1:0:Number(first(code)));if([210,220,230].some(code=>(fields.get(code)?.length??0)>1)||n.some(v=>!Number.isFinite(v))||[210,220,230].some(code=>first(code)!==undefined&&!first(code)!.trim()))throw new Error();const normalized=dxfOcs(n as [number,number,number]).normal;if(normalized.some((v,j)=>Math.abs(v-(j===2?1:0))>1e-12))normal=normalized;}catch{extrusionError="invalid extrusion/OCS normal";}}
  const finish = (result: { parsed: DxfEntity } | { parsed: null; warning: string | null }): EntityRead => {
    const numericError=["ELLIPSE","LINE","CIRCLE","ARC","TEXT","INSERT"].includes(type)&&ordered.some(([code,value])=>[10,20,30,11,21,31,39,40,41,42,43,50,51].includes(code)&&(!value.trim()||!Number.isFinite(Number(value))));
    const reason=extrusionError || (numericError?"invalid numeric coordinate/angle":["ELLIPSE","LINE","CIRCLE","ARC","TEXT","INSERT"].includes(type)&&first(39)!==undefined&&Number(first(39))!==0?"thickness semantics are unsupported":"");
    if(reason)return {next:i,parsed:null,warning:`${type} on layer "${layer}": ${reason}; skipped.`};
    return result.parsed ? {next:i,parsed:{...result.parsed,...(normal?{normal}:{})}} : {next:i,parsed:null,warning:result.warning??null};
  };

  if(type==="HATCH"){
    try{const entities=readDxfHatch(ordered,unitScale),name=`*WebcadHatch-${start}`;return {next:i,parsed:{kind:"insert",layer,block:name,position:[0,0,0],scale:[1,1,1],angle:0},generatedBlock:{name,entities},conversion:`HATCH on layer "${layer}": finite static fill/strokes retained; source associativity and pattern editing are not preserved.`};}
    catch(error){return {next:i,parsed:null,warning:`HATCH on layer "${layer}": ${error instanceof Error?error.message:String(error)}; skipped.`};}
  }
  if(type==="SOLID"){
    const normal=[num(210),num(220),num(230,1)];
    if(normal.some((v,j)=>Math.abs(v-(j===2?1:0))>1e-9)||num(39)!==0||ordered.some(([c,v])=>[10,20,30,11,21,31,12,22,32,13,23,33].includes(c)&&(!v.trim()||!Number.isFinite(Number(v)))))return {next:i,parsed:null,warning:`SOLID on layer "${layer}": unsupported extrusion/thickness or invalid vertices; skipped.`};
    const points=[0,1,first(13)===undefined?2:3,2].map(n=>point({x:10+n,y:20+n,z:30+n})).filter((p,j,a)=>!a.slice(0,j).some(q=>p.every((v,k)=>Math.abs(v-q[k])<1e-9)));
    if(points.length<3)return {next:i,parsed:null,warning:`SOLID on layer "${layer}": degenerate boundary; skipped.`};
    return {next:i,parsed:{kind:"polyline",layer,points,closed:true,dxfStyle:{fill:true}},conversion:`SOLID on layer "${layer}": editable filled boundary retained.`};
  }
  if(type==="MTEXT"){
    try{const [parsed,...additional]=readDxfMtext(ordered);if(!parsed)throw Error("empty text");return {next:i,parsed,additional,conversion:`MTEXT on layer "${layer}": flattened to editable plain text lines; font, wrapping, attachment and rich formatting are approximate.`};}
    catch(error){return {next:i,parsed:null,warning:`MTEXT on layer "${layer}": ${error instanceof Error?error.message:String(error)}; skipped.`};}
  }
  if(type==="DIMENSION"){
    const block=first(2);if(!block||[210,220,230].some((c,j)=>Math.abs(num(c,j===2?1:0)-(j===2?1:0))>1e-9))return {next:i,parsed:null,warning:`DIMENSION on layer "${layer}": missing display block or unsupported extrusion; skipped.`};
    return {next:i,parsed:{kind:"insert",layer,block,position:[0,0,0],scale:[1,1,1],angle:0},conversion:`DIMENSION on layer "${layer}": display block retained as a static block; associativity and dimension editing are not preserved.`};
  }
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
    const result=finish({parsed:{layer,kind:"polyline",points,closed,...(bulges.some(b=>b!==0)?{bulges:bulges.slice(0,count)}:{})}});return result.parsed&&[...ordered,...vertices.flat()].some(([c,v])=>[40,41,43].includes(c)&&Number(v)!==0)?{...result,conversion:`${type} on layer "${layer}": centerline retained; polyline width is not preserved.`}:result;
  };
  if(type==="LWPOLYLINE"||type==="POLYLINE"){
    if([...ordered,...vertices.flat()].some(([code,value])=>[10,20,30,38,39,40,41,42,43,70,90,210,220,230].includes(code)&&(!value.trim()||!Number.isFinite(Number(value)))))return rejectPolyline("invalid numeric vertex/header value");
    if((fields.get(39)??[]).some(v=>Number(v)!==0)||[40,41,43].some(code=>(fields.get(code)??[]).some(v=>Number(v)<0)))return rejectPolyline("thickness or negative width semantics are unsupported");
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
      if(!Number.isInteger(get(70))||[40,41].some(code=>get(code)<0)||get(70)&~32)return rejectPolyline("vertex width, fitted or mesh semantics are unsupported");
      const bulge=get(42);if(flags&8&&bulge!==0)return rejectPolyline("3D POLYLINE cannot preserve a bulge");
      if(!(flags&8)&&get(30)!==0)return rejectPolyline("2D vertex Z must be zero; use header elevation");
      points.push([get(10,NaN),get(20,NaN),flags&8?get(30):height]);bulges.push(bulge);
    }
    return finishPolyline(points,bulges,(flags&1)===1);
  }
  if(type==="SPLINE"){
    try{const {curve,conversion}=readDxfSpline(ordered);return {next:i,parsed:{...curve,layer,kind:"spline"},...(conversion?{conversion:`SPLINE on layer "${layer}": ${conversion}`}:{})};}
    catch(error){return {next:i,parsed:null,warning:`SPLINE on layer "${layer}": ${error instanceof Error?error.message:String(error)}; skipped.`};}
  }
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

function readEntity(type:string,tokens:[number,string][],start:number,unitScale:number,inBlock=false):EntityRead{
 const result=readGeometryEntity(type,tokens,start,unitScale);if(!result.parsed)return result;
 const fields:[number,string][]=[];for(let i=start;i<tokens.length&&tokens[i][0]!==0;i++)fields.push(tokens[i]);const get=(c:number)=>fields.find(([code])=>code===c)?.[1];
 const policy:CadDxfStyle={};if(inBlock&&result.parsed.layer==="0")policy.layer0=true;
 const rgb=get(420),aci=get(62),line=get(6)?.toUpperCase(),weight=get(370);try{
  if(rgb!==undefined){const n=Number(rgb);if(!Number.isInteger(n)||n<0||n>0xffffff)throw Error("invalid true color");policy.color="#"+n.toString(16).padStart(6,"0");}
  else if(aci!==undefined&&Number(aci)!==256){const n=Number(aci);policy.color=n===0?"by-block":dxfAciColor(n);}
  if(line&&line!=="BYLAYER"){if(line==="BYBLOCK")policy.lineType="by-block";else if(["DASHED","HIDDEN","CENTER","CONTINUOUS"].includes(line))policy.lineType=line==="CONTINUOUS"?"continuous":line==="CENTER"?"center":"dashed";else throw Error(`unsupported linetype ${line}`);}
  if(weight!==undefined){const n=Number(weight);if(n===-2)policy.lineWeight="by-block";else if(n===-3)policy.lineWeight=.25;else if(n!==-1){if(!Number.isInteger(n)||n<0||n>211)throw Error("invalid lineweight");policy.lineWeight=n/100;}}
 }catch(e){return {next:result.next,parsed:null,warning:`${type}: ${e instanceof Error?e.message:String(e)}; skipped.`};}
 const decorate=(e:DxfEntity):DxfEntity=>Object.keys(policy).length||e.dxfStyle?{...e,dxfStyle:{...policy,...e.dxfStyle}}:e;
 return {...result,parsed:decorate(result.parsed),...(result.additional?{additional:result.additional.map(decorate)}:{}),...(result.generatedBlock?{generatedBlock:{...result.generatedBlock,entities:result.generatedBlock.entities.map(e=>({...e,layer:"0",dxfStyle:{layer0:true,color:"by-block",lineType:"by-block",lineWeight:"by-block",...e.dxfStyle}}))}}:{})};
}
