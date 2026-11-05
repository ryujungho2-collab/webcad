import type {CadCommand} from "@agent-webcad/cad-commands";
import type {CadDocument} from "@agent-webcad/cad-document";
import {curveStations,type CurveStationOptions} from "../precision/curveStations";
import {WORK_PLANES,type Vec3} from "../precision/workPlane";
export type CurveLayoutOptions=CurveStationOptions&{id:string;layerId:string;tickLength:number;blockId?:string;blockAngle?:number};
/** Native, explicitly snapshot DIVIDE/MEASURE result, one reviewable Undo transaction. */
export function planCurveLayout(d:CadDocument,curveId:string,options:CurveLayoutOptions){
 if(!d.layers[options.layerId]?.visible||d.layers[options.layerId].locked||!Number.isFinite(options.tickLength)||options.tickLength<=0||options.tickLength>1e6||!Number.isFinite(options.blockAngle??0))throw Error("Choose an unlocked visible output layer, positive tick length and finite rotation.");
 if(options.blockId&&!d.blocks?.[options.blockId])throw Error("Choose an existing block definition.");
 const layout=curveStations(d,curveId,options),commands:Exclude<CadCommand,{type:"batch"}>[]=[],normal=WORK_PLANES[layout.workPlane];
 if(options.blockId&&layout.workPlane!=="XY")throw Error("Block layouts currently use XY; ticks support XY/XZ/YZ.");
 layout.stations.forEach((s,i)=>{const id=`${options.id}-${i}`;if(d.objects[id])throw Error("Layout output ID already exists; start a new layout.");
  if(options.blockId)commands.push({type:"insert-block",id,blockId:options.blockId,layerId:options.layerId,position:s.point,angle:s.angle+(options.blockAngle??0)});
  else {const end=s.point.map((v,j)=>v+(normal.xAxis[j]*s.normal[0]+normal.yAxis[j]*s.normal[1])*options.tickLength) as Vec3;commands.push({type:"create-drawing",id,layerId:options.layerId,drawing:"line",params:{workPlane:layout.workPlane,points:[s.point,end]}});}
 });return {...layout,command:{type:"batch",label:options.blockId?"Place blocks along curve":"Divide curve with normal ticks",commands} as CadCommand};
}
