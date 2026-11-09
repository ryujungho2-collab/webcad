import {validateCopilotEndpoint,type CopilotConnection} from "./copilotConnection";
const key="agent-webcad.copilot-connection.v1";
export function loadCopilotSettings():CopilotConnection{
 try{const v=JSON.parse(localStorage.getItem(key)??"null");if(v&&["rules","gateway"].includes(v.mode)&&typeof v.endpoint==="string"&&v.endpoint.length<=1000&&(v.model===undefined||typeof v.model==="string"&&/^[A-Za-z0-9][A-Za-z0-9_./:-]{0,127}$/.test(v.model))){validateCopilotEndpoint(v.endpoint,location.href);return {mode:v.mode,endpoint:v.endpoint,...v.model?{model:v.model}:{}};}}catch{}
 return {mode:"rules",endpoint:"/api/copilot/plan"};
}
export function saveCopilotSettings(value:CopilotConnection){try{validateCopilotEndpoint(value.endpoint,location.href);localStorage.setItem(key,JSON.stringify(value));}catch{}}
