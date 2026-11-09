import type {CadCommand,} from "@agent-webcad/cad-commands";
import type {SectionPresentation} from "@agent-webcad/cad-document";
import {dispatchCadCommand} from "../../src/state/dispatchCadCommand";
export async function curveApply(command:CadCommand){const r=await dispatchCadCommand(command);if(!r.ok)throw Error(r.reason);return r;}
export const curveStyle:SectionPresentation={background:false,keep:"negative",depth:100,hatch:false,spacing:2,angle:45,cutWeight:.5,backgroundWeight:.18,hatchWeight:.13,label:true};
/** Native BRep fixtures appended to R5; original parts and publications keep their IDs. */
export async function addCurveHatchFixture(){
 for(const [id,radius,height] of [["h2-outer",40,250],["h2-inner",16,300]] as const)await curveApply({type:"create-primitive",id,primitive:"cylinder",params:{radius,height}});
 await curveApply({type:"move-object",objectId:"h2-inner",translation:[0,0,-25]});
 await curveApply({type:"boolean-operation",id:"h2-ring",operation:"cut",target:"h2-outer",tool:"h2-inner"});
 await curveApply({type:"rotate-object",objectId:"h2-ring",rotation:[0,30,0]});
 await curveApply({type:"create-primitive",id:"h2-torus",primitive:"torus",params:{majorRadius:40,minorRadius:12}});
 await curveApply({type:"rotate-object",objectId:"h2-torus",rotation:[20,35,0]});
 await curveApply({type:"create-box",id:"h2-clip",width:120,depth:160,height:160});
 await curveApply({type:"move-object",objectId:"h2-clip",translation:[0,-80,-80]});
 await curveApply({type:"boolean-operation",id:"h2-canopy",operation:"intersect",target:"h2-torus",tool:"h2-clip"});
 for(const [id,name] of [["h2-ring","H2 elliptic ring"],["h2-canopy","H2 spline and cap"]])await curveApply({type:"register-model-part",part:{id,name,objectId:id}});
 await curveApply({type:"create-layer",id:"h2-drawings",name:"H2 curve cuts"});
 await curveApply({type:"set-layer-style",layerId:"h2-drawings",style:{color:"#202020",lineType:"continuous",lineWeight:.25}});
 for(const [id,part,height,origin,name] of [["h2-ellipse","h2-ring",80,[2060,-820],"H2 ELLIPSE + HOLE"],["h2-spline","h2-canopy",8,[2280,-820],"H2 SPLINE + LINE"]] as const)await curveApply({type:"upsert-model-section",view:{id,name,partIds:[part],basis:"XY",height,origin:[...origin],scale:1,layerId:"h2-drawings",presentation:{...curveStyle}}});
}
