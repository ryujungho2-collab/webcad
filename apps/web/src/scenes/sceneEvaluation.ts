import { validScene, type CadDocument, type CadScene } from "@agent-webcad/cad-document";
import { collectExportDrawings, collectExportImages } from "../export/exportModel";
import { encodeSvg, type SvgExportItem } from "../export/svgWriter";
import { worldDraftingGeometry } from "../precision/draftingGeometry";
import { WORK_PLANES, type WorkPlaneId } from "../precision/workPlane";

function finiteComponent(document:CadDocument,id:string,plane:WorkPlaneId,path=new Set<string>()):boolean {
 const block=document.blocks?.[id];if(!block||block.workPlane!==plane||path.has(id))return false;
 const next=new Set(path);next.add(id);
 return block.members.every(m=>m.type==="drawing"?!["point","infinite-line","ray"].includes(String(m.params.kind)):m.params.kind==="block"&&finiteComponent(document,String(m.params.blockId),plane,next));
}

export type SceneFrame={objectId:string;x:number;y:number;width:number;height:number;items:SvgExportItem[]};
export function evaluateScene(document:CadDocument,scene:CadScene,timeMs=0,stateId?:string){
 if(!validScene(scene)||!Number.isFinite(timeMs))throw new Error("Enter valid scene inputs and a finite playback time.");
 const board=document.artboards?.[scene.artboardId];if(!board)throw new Error("Choose an existing artboard for this scene.");
 if(!board.visible)throw new Error("Show the artboard before presenting this scene.");
 const state=stateId?scene.states.find(s=>s.id===stateId):undefined;if(stateId&&!state)throw new Error("Choose an existing scene state.");
 const members=new Set(scene.objectIds),scope={...document,rootObjects:document.rootObjects.filter(id=>members.has(id))};
 const drawings=collectExportDrawings(board.workPlane,scope),images=collectExportImages(board.workPlane,scope);
 let cursor=0;const frames:SceneFrame[]=[];
 for(const objectId of scene.objectIds){
  const object=document.objects[objectId];if(!object)throw new Error(`Missing scene object ${objectId}. Reassign its reference.`);
  const items:SvgExportItem[]=[...drawings.filter(d=>d.objectId===objectId).map(polyline=>({type:"polyline" as const,polyline})),...images.filter(i=>i.id===objectId).map(image=>({type:"image" as const,image}))];
  if(!object.visible||document.layers[object.layerId]?.visible===false||state?.hiddenObjectIds.includes(objectId))continue;
  const feature=Object.values(document.features).find(f=>f.output===objectId);
  if(feature?.type==="drafting"&&feature.params.kind==="block"){
   const data=worldDraftingGeometry(document,object,feature),normal=WORK_PLANES[board.workPlane].normal;
   const heights=data.lines.flatMap(l=>l.points.map(p=>p.reduce((sum,v,i)=>sum+v*normal[i],0)));
   if(!finiteComponent(document,String(feature.params.blockId),board.workPlane)||data.texts.length||!heights.length||Math.max(...heights)-Math.min(...heights)>1e-6)throw new Error(`${object.name} has unsupported component artwork. Use finite vector members on ${board.workPlane}; text and tilted components need a separate output adapter.`);
  }
  if(!items.length||feature?.type==="drafting"&&["text","chain"].includes(String(feature.params.kind)))throw new Error(`${object.name} cannot be presented as finite artwork on ${board.workPlane}. Choose supported vector/image objects on the board plane.`);
  const points=items.flatMap(item=>item.type==="polyline"?item.polyline.points:(()=>{const i=item.image,r=i.rotation*Math.PI/180;return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[i.center[0]+x*i.width/2*Math.cos(r)-y*i.height/2*Math.sin(r),i.center[1]+x*i.width/2*Math.sin(r)+y*i.height/2*Math.cos(r)]);})());
  const minX=Math.min(...points.map(p=>p[0])),maxY=Math.max(...points.map(p=>p[1])),width=Math.max(...points.map(p=>p[0]))-minX,height=maxY-Math.min(...points.map(p=>p[1]));
  let dx=0,dy=0,opacity=1;
  if(scene.layout.direction!=="free"){
   dx=board.origin[0]+scene.layout.padding-minX+(scene.layout.direction==="row"?cursor:0);
   dy=board.origin[1]+board.size[1]-scene.layout.padding-maxY-(scene.layout.direction==="column"?cursor:0);
   const available=board.size[scene.layout.direction==="row"?0:1]-2*scene.layout.padding;
   const cross=board.size[scene.layout.direction==="row"?1:0]-2*scene.layout.padding;
   if(cursor+(scene.layout.direction==="row"?width:height)>available+1e-6||(scene.layout.direction==="row"?height:width)>cross+1e-6)throw new Error("Auto Layout exceeds the artboard. Reduce gap/padding, enlarge the board or use Free layout.");
   cursor+=(scene.layout.direction==="row"?width:height)+scene.layout.gap;
  }
  const track=scene.tracks.find(t=>t.objectId===objectId);
  if(track){let t=Math.min(1,Math.max(0,(timeMs-track.startMs)/(track.endMs-track.startMs)));if(track.easing==="ease-in-out")t=t*t*(3-2*t);dx+=track.from[0]+(track.to[0]-track.from[0])*t;dy+=track.from[1]+(track.to[1]-track.from[1])*t;opacity=track.from[2]+(track.to[2]-track.from[2])*t;}
  const moved=items.map((item):SvgExportItem=>item.type==="image"?{type:"image",image:{...item.image,center:[item.image.center[0]+dx,item.image.center[1]+dy],opacity:(item.image.opacity??1)*opacity}}:{type:"polyline",polyline:{...item.polyline,points:item.polyline.points.map(p=>[p[0]+dx,p[1]+dy]),opacity:(item.polyline.opacity??1)*opacity}});
  frames.push({objectId,x:minX+dx,y:maxY+dy,width,height,items:moved});
 }
 return {board,frames,svg:encodeSvg([],{items:frames.flatMap(f=>f.items),viewBox:{origin:board.origin,size:board.size},background:board.background})};
}
