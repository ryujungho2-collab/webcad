import type { CadDocument, CadFeature, CadObject, LayerStyle } from "@agent-webcad/cad-document";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { worldDraftingGeometry } from "../precision/draftingGeometry";
import { layerStyle } from "../precision/layerStyle";
import { getObjectTransform } from "../precision/objectTransform";
import { resolveDimension } from "../precision/dimensionGeometry";

const format=(value:number)=>String(Number(value.toFixed(12)));
const clean=(value:string)=>value.replace(/[\r\n]/g," ");
const point=(p:number[],base=10)=>([base,format(p[0]),base+10,format(p[1]),base+20,format(p[2]??0)]);
const types={continuous:"CONTINUOUS",dashed:"DASHED",center:"CENTER"};
const styled=(style:LayerStyle)=>[6,types[style.lineType],370,Math.round(style.lineWeight*100),420,parseInt(style.color.slice(1),16)];

/** R2007 UTF-8 DXF with layer styles, editable TEXT and BLOCK/INSERT.
 * Chain dimensions and hatching export as vector linework with text. */
export function encodeDxf(document:CadDocument,objectIds?:string[]):{text:string;entities:number;skipped:number;warnings:string[]} {
  const body:(string|number)[]=[],blocks:(string|number)[]=[],layers=new Map<string,LayerStyle>();
  let entities=0,skipped=0;
  const warnings:string[]=[];
  const names=new Map(document.rootLayers.map(id=>[id,clean(document.layers[id]?.name??id)]));
  const layer=(id:string)=>{const name=names.get(id)??clean(id);layers.set(name,layerStyle(document.layers[id]));return name;};
  const poly=(target:(string|number)[],points:number[][],closed:boolean,name:string,style:LayerStyle)=>{
    target.push(0,"POLYLINE",100,"AcDbEntity",8,name,...styled(style),100,"AcDb3dPolyline",66,1,70,(closed?1:0)|8);
    for(const p of points)target.push(0,"VERTEX",100,"AcDbEntity",8,name,100,"AcDbVertex",100,"AcDb3dPolylineVertex",70,32,...point(p));
    target.push(0,"SEQEND",100,"AcDbEntity",8,name);
  };
  const write=(target:(string|number)[],object:CadObject,feature:CadFeature,count:boolean)=>{
    const name=layer(object.layerId),style=layerStyle(document.layers[object.layerId]),common=[100,"AcDbEntity",8,name,...styled(style)];
    const reject=(reason:string)=>{if(!count)throw new Error(`Cannot export component ${object.name}: ${reason}.`);skipped++;warnings.push(`${object.name}: ${reason}.`);};
    if(feature.type==="drawing"){
      const world=getWorldDrawingGeometry(object,feature);if(!world){reject("no supported drawing geometry");return;}
      if (["point", "infinite-line", "ray"].includes(world.kind)) { reject("point and unbounded construction geometry need a separate DXF adapter");return; }
      if(world.kind==="line"&&world.points?.length===2)target.push(0,"LINE",...common,100,"AcDbLine",...point(world.points[0]),...point(world.points[1],11));
      else if((world.kind==="circle"||world.kind==="arc") && world.workPlane==="XY" && world.planeAligned && world.uniformScale && world.center && world.radius){
        target.push(0,world.kind==="circle"?"CIRCLE":"ARC",...common,100,"AcDbCircle",...point(world.center),40,format(world.radius));
        if(world.kind==="arc"){
          let start=world.startAngle!,end=world.endAngle!;if(end<start)[start,end]=[end,start];
          target.push(100,"AcDbArc",50,format(start*180/Math.PI),51,format(end*180/Math.PI));
        }
      }else if(world.kind==="circle"||world.kind==="arc"){reject("analytic circles/arcs require a uniform, XY-aligned transform; non-default OCS is unsupported");return;}
      else if(world.profileSegments?.length){
        const segments=world.profileSegments,curved=Array.isArray(feature.params.bulges)&&feature.params.bulges.some(b=>Number(b)!==0);
        if(curved&&(!world.planeAligned||!world.uniformScale||world.workPlane!=="XY")){reject("bulge contours require a uniform, XY-aligned transform; non-default OCS is unsupported");return;}
        const points=segments.map(s=>s.start);if(!world.closed)points.push(segments.at(-1)!.end);
        if(world.workPlane==="XY"&&world.planeAligned){
          target.push(0,"LWPOLYLINE",...common,100,"AcDbPolyline",90,points.length,70,world.closed?1:0,38,format(points[0][2]));
          points.forEach((p,i)=>{const s=segments[i],bulge=s?.kind==="arc"?Math.tan((s.endAngle!-s.startAngle!)/4):0;target.push(10,format(p[0]),20,format(p[1]),...(bulge!==0?[42,format(bulge)]:[]));});
        }else poly(target,points,world.closed,name,style);
      }else if(Array.isArray(feature.params.bulges)&&feature.params.bulges.some(b=>Number(b)!==0)){reject("curved contour cannot be represented exactly after this transform");return;}
      else if(world.points?.length)poly(target,world.points,world.closed,name,style);
      else{reject("no supported finite drawing representation");return;}if(count)entities++;return;
    }
    if(feature.type==="drafting" && feature.params.kind==="block"){
      const block=document.blocks?.[String(feature.params.blockId)],transform=getObjectTransform(object,feature);
      if(!block||block.workPlane!=="XY"||transform.rotation[0]||transform.rotation[1]){reject("component needs an existing definition and XY-aligned placement");return;}
      target.push(0,"INSERT",...common,100,"AcDbBlockReference",2,clean(block.id),...point(transform.translation),41,format(transform.scale[0]),42,format(transform.scale[1]),43,format(transform.scale[2]),50,format(transform.rotation[2]));if(count)entities++;return;
    }
    if(feature.type==="drafting"||feature.type==="dimension"){
      let data=worldDraftingGeometry(document,object,feature);
      if(feature.type==="dimension"){
        const dimension=resolveDimension(feature.params);if(!dimension){reject("invalid annotation parameters");return;}
        data={lines:dimension.segments.map(points=>({points,closed:false,style})),texts:[{point:dimension.textPosition,text:dimension.text,height:3.5,angle:0,style}]};
      }
      for(const line of data.lines){poly(target,line.points,line.closed,name,line.style);if(count)entities++;}
      for(const text of data.texts){target.push(0,"TEXT",...common,100,"AcDbText",...point(text.point),40,format(text.height),1,clean(text.text),50,format(text.angle),7,"STANDARD",...(text.align==="center"?[72,1,...point(text.point,11)]:[]),100,"AcDbText");if(count)entities++;}
      return;
    }
    reject(`${feature.type} has no supported DXF representation`);
  };
  const featureByObject=new Map(Object.values(document.features).map(f=>[f.output,f]));
  const roots=(objectIds?.length?objectIds:document.rootObjects).filter(id=>{
    const object=document.objects[id];return object?.visible&&featureByObject.has(id)&&document.layers[object.layerId]?.visible;
  });
  const includedBlocks=new Set<string>(),visiting=new Set<string>();
  const includeBlock=(id:string)=>{
    if(visiting.has(id))throw new Error(`Cannot export cyclic component ${id}.`);
    if(includedBlocks.has(id))return;
    const block=document.blocks?.[id];if(!block)return;
    visiting.add(id);
    for(const member of block.members)if(member.type==="drafting"&&member.params.kind==="block")includeBlock(String(member.params.blockId));
    visiting.delete(id);includedBlocks.add(id);
  };
  for(const id of roots){const f=featureByObject.get(id)!;if(f.type==="drafting"&&f.params.kind==="block")includeBlock(String(f.params.blockId));}
  for(const id of includedBlocks){
    const block=document.blocks![id];
    blocks.push(0,"BLOCK",100,"AcDbEntity",8,"0",100,"AcDbBlockBegin",2,clean(block.id),70,0,...point([0,0,0]),3,clean(block.id),1,"");
    for(const member of block.members)write(blocks,{id:"member",name:"member",geometryId:"member",visible:true,layerId:member.layerId,transform:member.transform},{id:"member",type:member.type,output:"member",inputs:[],params:member.params},false);
    blocks.push(0,"ENDBLK",100,"AcDbEntity",8,"0",100,"AcDbBlockEnd");
  }
  for(const id of roots)write(body,document.objects[id],featureByObject.get(id)!,true);
  const ltypes=Object.entries({CONTINUOUS:[],DASHED:[3,-1.5],CENTER:[6,-1.5,1,-1.5]}).flatMap(([name,pattern])=>[0,"LTYPE",100,"AcDbSymbolTableRecord",100,"AcDbLinetypeTableRecord",2,name,70,0,3,name,72,65,73,pattern.length,40,pattern.reduce((sum,v)=>sum+Math.abs(v),0),...pattern.flatMap(v=>[49,v,74,0])]);
  const header=[0,"SECTION",2,"HEADER",9,"$ACADVER",1,"AC1021",9,"$INSUNITS",70,4,0,"ENDSEC",0,"SECTION",2,"TABLES",0,"TABLE",2,"LTYPE",5,"A0",100,"AcDbSymbolTable",70,3,...ltypes,0,"ENDTAB",0,"TABLE",2,"LAYER",5,"A1",100,"AcDbSymbolTable",70,layers.size+1,
    0,"LAYER",100,"AcDbSymbolTableRecord",100,"AcDbLayerTableRecord",2,"0",70,0,62,7,6,"CONTINUOUS",
    ...[...layers].flatMap(([name,style])=>[0,"LAYER",100,"AcDbSymbolTableRecord",100,"AcDbLayerTableRecord",2,name,70,0,62,7,...styled(style)]),0,"ENDTAB",0,"TABLE",2,"STYLE",5,"A2",100,"AcDbSymbolTable",70,1,0,"STYLE",100,"AcDbSymbolTableRecord",100,"AcDbTextStyleTableRecord",2,"STANDARD",70,0,40,0,41,1,50,0,71,0,42,2.5,3,"txt",4,"",0,"ENDTAB",0,"ENDSEC",0,"SECTION",2,"BLOCKS",...blocks,0,"ENDSEC",0,"SECTION",2,"ENTITIES"];
  return {text:[...header,...body,0,"ENDSEC",0,"EOF"].join("\n")+"\n",entities,skipped,warnings};
}
