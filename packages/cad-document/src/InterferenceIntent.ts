import type {CadDocument} from "./CadDocument";
export const INTERFERENCE_INTENTS=["intended-contact","intentional-overlap","forbidden-interference","undecided"] as const;
export type InterferenceIntent=typeof INTERFERENCE_INTENTS[number];
export type PairIntent={pair:[string,string];intent:InterferenceIntent;note:string};
export const interferencePairKey=(pair:readonly string[])=>JSON.stringify([...pair].sort());
export function validPairIntent(v:unknown):v is PairIntent{const a=v as PairIntent;return !!a&&typeof a==="object"&&!Array.isArray(a)&&Object.keys(a).length===3&&Array.isArray(a.pair)&&a.pair.length===2&&a.pair.every(id=>typeof id==="string"&&id.length>0&&id.length<=200)&&a.pair[0]!==a.pair[1]&&(INTERFERENCE_INTENTS as readonly string[]).includes(a.intent)&&typeof a.note==="string"&&a.note.length<=1000;}
export function validateInterferenceIntents(d:CadDocument){const values=d.interferenceIntents;if(values===undefined)return;if(!values||typeof values!=="object"||Array.isArray(values)||Object.keys(values).length>128)throw Error("Invalid pair-intent inventory.");for(const [key,a] of Object.entries(values))if(!validPairIntent(a)||key!==interferencePairKey(a.pair)||a.pair[0]>a.pair[1]||a.pair.some(id=>!Object.hasOwn(d.objects,id)))throw Error("Invalid pair-intent reference/key. Clear annotation before deleting a part.");}
