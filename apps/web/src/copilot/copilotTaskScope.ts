import {CAD_TOOLS,type CadToolName} from "./cadToolContract";
/** Route names through the existing registry; this grants no native edit permission. */
export function taskToolScope(prompt:string,solid?:{targetId?:string}){
 const kind=/실무 검토|도면 검토|여유.*검사|coordination review|clearance review/i.test(prompt)?"review":/관통|간섭|interference|penetration/i.test(prompt)?"interference":solid?.targetId&&/치수|가로|세로|높이|폭|깊이|두께|반지름|지름|width|height|depth|radius|dimension|parameter/i.test(prompt)?"parameter":"general";
 const names=kind==="review"?["cad.objects","cad.inspect","cad.coordinationReview","cad.architecture","cad.tools"]:kind==="interference"?["cad.objects","cad.inspect","cad.measure","cad.parameters","assembly.inspect","assembly.motion.inspect",...(solid?.targetId?["solid.parameter"]:[])]:kind==="parameter"?["cad.objects","cad.inspect","cad.measure","cad.parameters","solid.parameter"]:["cad.objects","cad.inspect","cad.measure","cad.faces","cad.edges","curve.circle","curve.fitted","curve.polyline","solid.primitive","solid.extrude","solid.boolean","solid.fillet","solid.chamfer"];
 return {kind,names:names.filter(n=>Object.hasOwn(CAD_TOOLS,n)) as CadToolName[]};
}
export function motionEvidenceSummary(report:any,intents:Record<string,any>={},targetId?:string){
 const targetPair=targetId?Object.values(intents).find((i:any)=>i.pair?.includes(targetId))?.pair:undefined;
 const selectedRows=targetPair?report.rows.filter((r:any)=>targetPair.every((id:string)=>r.pair.includes(id))):report.rows??[];
 const groups=new Map<string,any>();
 for(const row of selectedRows){const key=JSON.stringify([...row.pair].sort());let g=groups.get(key);if(!g){g={pair:row.pair,intent:intents[key]??null,observations:[]};groups.set(key,g);}
  const observation={rawStatus:row.baseStatus,policyStatus:row.status,commonVolume:row.commonVolume,volumeTolerance:row.volumeTolerance,relativeMotion:row.relativeMotion,reason:row.reason,exception:row.exception};
  const same=g.observations.find((o:any)=>JSON.stringify(o.measurement)===JSON.stringify(observation));if(same)same.angles.push(row.angle);else g.observations.push({angles:[row.angle],measurement:observation});
 }
 return {format:"motion-summary-v1",evidenceSource:"assembly.motion.inspect / OpenCascade B2",version:report.version,request:report.request,state:report.state,samplingFinished:report.samplingFinished,completedSamples:report.stats?.completedSamples,requestedAngles:report.angles,reportedRows:selectedRows.length,sourceRows:report.rows?.length,omittedRows:(report.rows?.length??0)-selectedRows.length,parts:targetPair?report.parts?.filter((p:any)=>targetPair.includes(p.id)):report.parts,reason:report.reason,pairs:[...groups.values()],warning:report.warning};
}
/** Project only the model transcript. Original report/measurements remain untouched. */
export function modelReadEvidence(read:any,intents?:Record<string,any>,targetId?:string){
 if(!read.ok)return read;
 if(read.name==="assembly.motion.inspect")return {...read,result:motionEvidenceSummary(read.result,intents,targetId)};
 if(read.name==="assembly.inspect")return {...read,result:{...read.result,assembly:{...read.result.assembly,joints:Object.fromEntries(Object.entries(read.result.assembly.joints).map(([id,j]:[string,any])=>{const {rest:_,...frame}=j;return [id,frame];}))},omitted:"Rest transforms omitted from model summary; exact frames remain available in the native read result."}};
 return read;
}

/** Guidance is derived from successful native reads; never invents Joint/body IDs. */
export function planningEvidenceGuide(results:any[]=[],targetId?:string){
 const assembly=results.find(r=>r.ok&&r.name==='assembly.inspect')?.result;
 const joints=Object.values(assembly?.assembly?.joints??{}) as any[];
 const joint=joints.find(j=>j.type==='revolute');
 const pair=assembly?.designIntents?.entries?.find((e:any)=>e.pair?.includes(targetId))?.pair;
 return {usedCallIds:results.map(r=>r.id),nextRead:!assembly?'Read assembly.inspect before constructing dependent motion calls.':undefined,
  motionOptionsExample:joint&&pair?.length===2?{jointId:joint.id,start:0,end:180,step:90,partIds:pair,exceptions:[],tolerance:1e-6}:undefined,
  motionContract:'Serialize the example as optionsJson. Fields jointId,start,end,step,partIds,exceptions,tolerance are required. Use a fresh call ID. Do not repeat successful reads.'};
}

export const positionOnlyRequest=(prompt:string)=>/위치만|position[- ]only|only\s+(?:move|reposition|translate)/i.test(prompt);

export function preservationQuestionConflict(clarification:any){
 return (clarification?.questions??[]).some((q:any)=>(q.options??[]).some((option:string)=>/axis|origin|회전축|원점/i.test(option)&&/변경|재배치|change|move|edit/i.test(option)))?'CONSTRAINT: clarification offers Joint axis/origin edits despite the preserved Joints/axis requirement. Remove those options; explain the unsupported position-only scope without changing requirements.':undefined;
}
