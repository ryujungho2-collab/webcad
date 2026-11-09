import type {SerializedOperand} from "../../src/cad/kernelProtocol";
/** Eight independent two-solid occlusion groups, shuffled source order. */
export function separatedHlrFixture(delta=0):SerializedOperand[]{
 return [0,1].flatMap(row=>Array.from({length:8},(_,i)=>({params:{kind:i%2?'cylinder':'box',...(i%2?{radius:8+delta*(i===1&&row===0?1:0),height:20}:{width:20+delta*(i===0&&row===0?1:0),depth:15,height:20})},transform:{translation:[i*55+row*4,row*6,0],rotation:[0,0,0],scale:[1,1,1]}})));
}
