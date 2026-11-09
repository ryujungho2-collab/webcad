import type {CadDocument,SolidFinish} from "@agent-webcad/cad-document";
import {PlanModelBuilder,type PlanFloor} from "../src/architecture/planModel";
import {cafeModelAsset,CAFE_FINISHES as m,type ModelPiece} from "../src/library/cafeModelAssets";
import {getWorldDrawingGeometry} from "../src/precision/worldGeometry";
import {stairLayout} from "../src/precision/stairLayout";

const box=(name:string,x:number,y:number,z:number,width:number,depth:number,height:number,finish:SolidFinish=m.oak):ModelPiece=>({name,kind:"box",params:{width,depth,height},position:[x,y,z],finish});
export const CAFE_FLOORS:PlanFloor[]=[{id:"1f",name:"1F",sourceOrigin:[0,0],level:0},{id:"2f",name:"2F",sourceOrigin:[22000,0],level:3900}];
export const CAFE_OPENINGS=[{name:"main-stair",x:11400,y:9300,w:3000,d:4760},{name:"rear-stair",x:400,y:9700,w:2600,d:4200},{name:"lift",x:8550,y:12550,w:2050,d:2250}];

/** R0 spatial layout is kept. Only section levels and explicit missing Z dimensions are supplied. */
export function largeCafeModelDesign(document:CadDocument){
 const b=new PlanModelBuilder(document,"cafe3d"),features=new Map(Object.values(document.features).map(f=>[f.output,f]));
 for(const floor of CAFE_FLOORS){
  const number=floor.id==="1f"?1:2,frame=document.artboards?.[`layout-${number}`]?.frame;
  if(!frame)throw Error(`Missing issued native plan: layout-${number}`);
  for(const id of frame.memberIds){
   const o=document.objects[id],f=features.get(id);if(!o||!f)throw Error(`Missing issued member ${id}`);
   if(f.params.kind==="block"){
    const symbol=String(f.params.blockId).replace(/^cafe-/,"");
    b.block(id,cafeModelAsset(symbol),floor,["wc","basin"].includes(symbol)?"sanitary":"furniture");continue;
   }
   if(f.type!=="drawing"||f.params.closed!==true)continue;
   const g=getWorldDrawingGeometry(o,f);if(!g?.points?.length)continue;
   const xs=g.points.map(p=>p[0]-floor.sourceOrigin[0]),ys=g.points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,d=Math.max(...ys)-y;
   if(o.layerId==="cafe-walls"){
    const glazed=(x===0&&w===200)||(y===0&&d===200&&w>1000);
    if(glazed){
     const parts=[box("Sill",x,y,0,w,d,150,m.white),box("Glazing",x,y,150,w,d,2650,m.glass),box("Spandrel",x,y,2800,w,d,850,m.white)];
     const horizontal=w>d,len=horizontal?w:d;for(let v=0;v<len;v+=2500)parts.push(box("Mullion",x+(horizontal?v:65),y+(horizontal?65:v),150,horizontal?50:70,horizontal?70:50,2650,m.dark));
     b.pieces(id,parts,floor,"facade",[0,0,0],0,[id]);
    }else b.extrude(id,3650,floor,m.white,w===600&&d===600?"columns":"walls");
   }else if(o.layerId==="cafe-furniture"){
    const front=id==="cafe-bar-front",h=900;
    b.pieces(id,[box("Cabinet",x+20,y+20,100,w-40,d-40,h-140,m.oak),box("Countertop",x,y,h-40,w,d,40,m.oak),box("Plinth",x+60,y+60,0,w-120,d-120,100,m.dark)],floor,"joinery",[0,0,0],0,[id]);
    if(front)for(let v=800;v<w;v+=800)b.pieces(`${id}-joint-${v}`,[box("Front joint",x+v,y-1,110,5,3,735,m.dark)],floor,"joinery",[0,0,0],0,[id]);
   }
  }
  // Reuse the exact R0 lighting instances, not a second array of light positions.
  const rcp=document.artboards?.[`rcp-${number}`]?.frame;
  for(const id of rcp?.memberIds??[]){const f=features.get(id);if(document.objects[id]?.layerId==="cafe-rcp"&&f?.params.kind==="block")b.block(id,cafeModelAsset(String(f.params.blockId).replace(/^cafe-/,"")),floor,"lighting");}
  // Floor and ceiling profiles are editable geometry; holes continue through the intermediate slab.
  const sourceLayer=b.layer(floor,"profiles"),outer=`cafe3d-${floor.id}-slab-profile`;
  b.commands.push({type:"create-drawing",id:outer,layerId:sourceLayer,drawing:"polyline",params:{workPlane:"XY",closed:true,points:[[0,0,0],[15000,0,0],[15000,15000,0],[0,15000,0]]}});
  const profiles=[outer];if(number===2)for(const hole of CAFE_OPENINGS){const id=`${outer}-${hole.name}`;profiles.push(id);b.commands.push({type:"create-drawing",id,layerId:sourceLayer,drawing:"polyline",params:{workPlane:"XY",closed:true,points:[[hole.x,hole.y,0],[hole.x+hole.w,hole.y,0],[hole.x+hole.w,hole.y+hole.d,0],[hole.x,hole.y+hole.d,0]]}});}
  const slab=`cafe3d-${floor.id}-slab`;b.commands.push({type:"create-architectural-slab",id:slab,layerId:b.layer(floor,"slabs"),definition:{kind:"floor",sourceObjectIds:profiles,level:floor.level,thickness:250},finish:m.floor},{type:"register-model-part",part:{id:`part-${slab}`,name:`${floor.name} / Floor slab 250`,objectId:slab}});
  b.receipts.push({assemblyId:slab,sourceObjectIds:profiles,floorId:floor.id,role:"slabs",objectIds:[slab],mode:"live-profile"});
  b.pieces("ceiling",[box("Ceiling raft",400,400,3200,14200,8000,60,m.white)],floor,"ceiling");
  for(const [x,y,w,d]of [[3500,8500,7200,2600],[3500,11300,4500,3500]])b.pieces(`finish-${x}-${y}`,[box("Floor finish",x,y,1,w,d,8,y===11300?m.wet:m.concrete)],floor,"finishes");
  // Doors retain R0 pivots and swings; leaves are shown at the plan's open position.
  for(const id of frame.memberIds){const f=features.get(id),o=document.objects[id];if(!id.startsWith("cafe-door-")||!f||!o)continue;const g=getWorldDrawingGeometry(o,f);if(!g?.center||!g.radius)continue;const [cx,cy]=g.center,x=cx-floor.sourceOrigin[0],w=g.radius;b.pieces(id,[box("Door leaf",-20,0,0,40,w,2100,id.includes("door")&&cy===200?m.glass:m.oak)],floor,"doors",[x,cy,0],cy===200?180:0,[id]);}
 }
 const first=CAFE_FLOORS[0];
 for(const [name,x,y,width,going,landing]of [["main-stair",11400,9300,1400,280,1400],["rear-stair",400,9700,1200,250,1200]] as const){
  const s=stairLayout({rise:3900,risers:26,going,width,landing}),parts:ModelPiece[]=[];
  for(let i=0;i<12;i++){
   parts.push(box(`Flight 1 tread ${i+1}`,x,y+i*going,i*150,width,going,150,m.oak));
   parts.push(box(`Flight 2 tread ${i+1}`,x+width+200,y+s.run-(i+1)*going,1950+i*150,width,going,150,m.oak));
  }
  parts.push(box("Half landing",x,y+s.run,1800,s.width,landing,150,m.oak));
  for(const side of [0,s.width-40])for(let i=0;i<=12;i+=3){const z=side===0?i*150:3900-i*150;parts.push(box("Baluster",x+side,y+i*going,z,40,40,1000,m.dark));}
  const slope=Math.atan2(1800,s.run),length=Math.hypot(s.run,1800);
  parts.push({...box("Flight 1 handrail",x,y,1050,45,length,45,m.dark),rotation:[slope*180/Math.PI,0,0]});
  parts.push({...box("Flight 2 handrail",x+s.width-45,y,4950,45,length,45,m.dark),rotation:[-slope*180/Math.PI,0,0]});
  parts.push(box("Landing guard",x,y+s.length-45,1950,45,45,1000,m.dark),box("Landing handrail",x,y+s.length-45,2950,s.width,45,45,m.dark));
  b.pieces(name,parts,first,"stairs");
 }
 b.pieces("roof",[box("Roof slab",0,0,7550,15000,15000,250,m.concrete)],first,"roof");
 // Presentation snapshots default to an open model. Hidden roof/ceilings remain exact editable solids.
 const allIds=b.receipts.flatMap(r=>r.objectIds);
 for(const [id,layer]of Object.entries(document.layers))if(layer.visible)b.commands.push({type:"set-layer-visible",layerId:id,visible:false});
 for(const floor of CAFE_FLOORS)for(const role of ["profiles","ceiling"])b.commands.push({type:"set-layer-visible",layerId:`cafe3d-${floor.id}-${role}`,visible:false});
 b.commands.push({type:"set-layer-visible",layerId:"cafe3d-1f-roof",visible:false});
 for(const [id,board]of Object.entries(document.artboards??{}))if(board.visible)b.commands.push({type:"update-artboard",artboardId:id,visible:false});
 const offsets=Object.fromEntries(b.receipts.filter(r=>r.floorId==="2f"||r.role==="roof").flatMap(r=>r.objectIds).map(id=>[`part-${id}`,{direction:[0,0,1] as [number,number,number],distance:4500}]));
 b.commands.push({type:"upsert-exploded-view",view:{id:"cafe-floor-separation",name:"Separate floors",amount:1,offsets}});
 for(const [id,name,eye,target]of [
  ["overview","Two-storey overview",[25500,-27000,23000],[7500,7500,3000]],
  ["ground-interior","1F entrance / coffee bar",[13600,1200,1650],[6700,9000,1600]],
  ["upper-interior","2F seating",[13600,1200,5550],[7000,10000,5500]],
  ["stair","Stair coordination",[19500,3000,12000],[12900,11600,2400]],
 ] as [string,string,[number,number,number],[number,number,number]][])b.commands.push({type:"upsert-model-view",view:{id:`cafe-${id}`,name,camera:{projection:"perspective",eye,target,up:[0,0,1],near:10,far:200000,zoom:1,fov:50,aspect:1.6}}});
 return {commands:b.commands,receipts:b.receipts,allIds,layers:[...b.layers],floors:CAFE_FLOORS,openings:CAFE_OPENINGS};
}
