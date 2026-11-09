import {parseDesignStudy,type DesignBrief} from "./designStudy";
export type IntentQuestion={id:string;prompt:string;options:string[]};
export type ModelRun={provider:string;model:string;elapsedMs:number;inputTokens:number;outputTokens:number;repairs?:number;context?:{numCtx:number;outputReserved:number;utf8Bytes:number;truncate:false;inferenceCalls:number}};
export type DesignIntent={brief:DesignBrief;questions:IntentQuestion[];summary:string[];run?:ModelRun};
export type DesignRevision={label:string;feedback:string;command:unknown;fit?:unknown};
export const BUILTIN_COPILOT="/api/copilot/plan";
export const copilotDeadline=(endpoint:string)=>endpoint===BUILTIN_COPILOT?180000:30000;
export function parseModelRun(value:unknown):ModelRun|undefined{
 const r=value as ModelRun;if(!r||typeof r.provider!=="string"||r.provider.length>40||typeof r.model!=="string"||r.model.length>128||![r.elapsedMs,r.inputTokens,r.outputTokens].every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0))return;
 return {...r.context&&r.context.truncate===false&&[r.context.numCtx,r.context.outputReserved,r.context.utf8Bytes,r.context.inferenceCalls].every(n=>Number.isFinite(n)&&n>=0)?{context:r.context}:{},provider:r.provider,model:r.model,elapsedMs:r.elapsedMs,inputTokens:r.inputTokens,outputTokens:r.outputTokens,...Number.isInteger(r.repairs)&&r.repairs!>=0&&r.repairs!<=1?{repairs:r.repairs}:{}};
}
export function parseDesignIntent(value:unknown,documentId:string):DesignIntent{
 const v=value as Record<string,unknown>;
 if(!v||v.version!==1||!Array.isArray(v.questions)||v.questions.length>3||!v.questions.every(q=>q&&typeof q.id==="string"&&q.id.length>0&&q.id.length<=40&&typeof q.prompt==="string"&&q.prompt.length>0&&q.prompt.length<=500&&Array.isArray(q.options)&&q.options.length<=3&&q.options.every((s:unknown)=>typeof s==="string"&&s.length>0&&s.length<=200))||new Set(v.questions.map(q=>q.id)).size!==v.questions.length||!Array.isArray(v.summary)||v.summary.length>4||!v.summary.every(s=>typeof s==="string"&&s.length<=500))throw Error("Intent response needs a brief, up to three clear questions, and short notes.");
 const brief=parseDesignStudy(JSON.stringify({version:1,documentId,brief:v.brief,decisions:[]}),documentId).brief;
 return {brief,questions:v.questions,summary:v.summary,run:parseModelRun(v.run)};
}
export function confirmedIntent(brief:DesignBrief,questions:IntentQuestion[],answers:Record<string,string>):DesignBrief{
 if(questions.some(q=>!answers[q.id]?.trim()))throw Error("Answer the open questions before confirming this intent.");
 const confirmed=questions.map(q=>`${q.prompt} → ${answers[q.id].trim()}`).join("\n");
 const requirements=[brief.requirements,confirmed].filter(Boolean).join("\n");
 if(requirements.length>4000)throw Error("Confirmed requirements exceed 4000 characters. Shorten the answers or the brief.");
 return {...brief,requirements,questions:questions.length?"":brief.questions};
}
