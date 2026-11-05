import {dispatchCadCommand} from "../../src/state/dispatchCadCommand";
import {cadDocument} from "../../src/state/cadDocument";
import {resetTestDocument} from "./documentHarness";
export async function projectTreeFixture(){
 resetTestDocument();
 const run=async(c:Parameters<typeof dispatchCadCommand>[0])=>{const r=await dispatchCadCommand(c);if(!r.ok)throw Error(r.reason);};
 await run({type:"create-primitive",id:"body",name:"주거 원본",primitive:"box",params:{width:40,depth:30,height:20}});
 await run({type:"register-model-part",part:{id:"part",name:"주거 부품",objectId:"body"}});
 await run({type:"upsert-model-projection",id:"front",name:"주거 정면",partIds:["part"],basis:"XZ",origin:[100,100],scale:1,layerId:"layer-default"});
 await run({type:"upsert-model-section",view:{id:"cut",name:"주거 단면",partIds:["part"],basis:"YZ",height:10,origin:[200,100],scale:1,layerId:"layer-default",outputs:{},status:"resolved"}});
 await run({type:"upsert-model-sheet",id:"sheet",name:"주거 A4",artboardId:"paper",denominator:2,placements:{front:[540,40]},origin:[500,0],size:[210,297]});
 const ids=["frame","detail"];
 for(const id of ids)await run({type:"create-artboard",id,name:id==="detail"?"주거 상세":"주거 프레임",workPlane:"XY",origin:[800,0],size:[100,80],frame:{memberIds:Object.values(cadDocument.modelPresentation!.sections!.cut.outputs).map(o=>o.objectId),sourceOrigin:[190,90],denominator:id==="detail"?1:2}});
 await run({type:"upsert-frame-link",link:{id:"link",fromId:"frame",toId:"detail",placement:"right",gap:10,fixed:false,reference:{kind:"detail",number:"1"}}});
}
