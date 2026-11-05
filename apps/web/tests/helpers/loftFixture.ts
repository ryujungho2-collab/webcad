import {cadDocument} from "../../src/state/cadDocument";
import {createCadToolSession} from "../../src/copilot/cadToolSession";
import type {CadToolCall} from "../../src/copilot/cadToolContract";
import {dispatchCadCommand} from "../../src/state/dispatchCadCommand";

export const loftContext=(selectionIds=["editableLoft"])=>({document:cadDocument,selectionIds,layerId:"layer-default",workPlane:"XY" as const});
export const loftEdit=(ruled:boolean):CadToolCall=>({id:"loft-edit",name:"solid.loft.update",arguments:{objectId:"editableLoft",ruled}});
export async function installEditableLoft(){
 const calls:CadToolCall[]=[20,10,25].map((radius,i)=>({id:`section${i}`,name:"curve.circle",arguments:{id:`section${i}`,plane:"XY",center:[0,0,i*30],radius}}));
 calls.push({id:"loft",name:"solid.loft",arguments:{id:"editableLoft",profileObjectIds:["section0","section1","section2"],ruled:true}});
 const plan=await createCadToolSession(loftContext([])).plan(calls),result=await dispatchCadCommand(plan.command);
 if(!result.ok)throw Error(result.reason);
}
