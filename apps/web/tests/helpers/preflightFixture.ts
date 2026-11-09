import {resetTestDocument} from "./documentHarness";
import {dispatchCadCommand} from "../../src/state/dispatchCadCommand";
import {cadDocument} from "../../src/state/cadDocument";
export async function preflightFixture(){resetTestDocument();const run=async(c:Parameters<typeof dispatchCadCommand>[0])=>{const r=await dispatchCadCommand(c);if(!r.ok)throw Error(r.reason);};
 await run({type:"create-box",id:"body",width:40,depth:30,height:20});await run({type:"register-model-part",part:{id:"part",name:"Part",objectId:"body"}});
 await run({type:"upsert-model-projection",id:"view",name:"Plan",partIds:["part"],basis:"XY",origin:[40,60],scale:1,layerId:"layer-default"});
 await run({type:"upsert-model-sheet",id:"sheet",name:"Review A4",artboardId:"paper",denominator:1,placements:{view:[40,60]},origin:[0,0],size:[210,297]});
 const source=Object.values(cadDocument.modelPresentation!.projections.view.outputs)[0].objectId;
 await run({type:"upsert-model-note",id:"note",sourceObjectId:source,anchor:"center",mode:"live",quantity:"text",text:"CHECK NOTE",point:[205,290],height:3.5,layerId:"layer-default"});
}
