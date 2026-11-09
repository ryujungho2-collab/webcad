import {roofProfiles} from "../tests/helpers/pavilionFixture";
import {fitSpline} from "../src/precision/fitSpline";
import {loftProfiles} from "../../../packages/cad-kernel/src/operations/loft";
import {inspectShape} from "@agent-webcad/cad-kernel";
const profiles=roofProfiles.map((p,i)=>({id:`roof${i}`,normal:[0,0,1] as [number,number,number],segments:[{...fitSpline(p as any,true,1,"C2"),kind:"spline" as const,topologyReference:`profile${i}`}]}));const shape=await loftProfiles(profiles);try{console.log(JSON.stringify(await inspectShape(shape)));}finally{shape.delete();}
