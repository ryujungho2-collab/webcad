/** Shared millimetre geometry for two-flight 2D plans and sections. No code-compliance inference. */
export function stairLayout(input:{rise:number;risers:number;going:number;width:number;landing:number}){
 const {rise,risers,going,width,landing}=input;
 if(![rise,going,width,landing].every(v=>Number.isFinite(v)&&v>0)||!Number.isInteger(risers)||risers<4||risers>100||risers%2)throw Error("Use positive stair dimensions and an even riser count from 4 to 100.");
 const perFlight=risers/2,riser=rise/risers,run=(perFlight-1)*going;
 return {riser,perFlight,run,length:run+landing,width:2*width+200,steps:Array.from({length:risers},(_,i)=>({number:i+1,z:(i+1)*riser,flight:i<perFlight?0:1,tread:i%perFlight}))};
}
