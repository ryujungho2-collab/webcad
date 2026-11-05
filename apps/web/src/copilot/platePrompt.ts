import type {MountingPlateSpec} from "./mountingPlate";
const number="(\\d+(?:\\.\\d+)?)", unit="(mm|cm|m)?";
const mm=(value:string,suffix="mm")=>Number(value)*(suffix==="cm"?10:suffix==="m"?1000:1);
/** Bounded local language grammar. Unknown or conflicting conditions are never discarded. */
export function parsePlateCreation(text:string):MountingPlateSpec|undefined {
 if(!/(?:판|plate)/.test(text)||!/(?:구멍|holes?)/.test(text))return;
 const take=(pattern:RegExp)=>{const matches=[...text.matchAll(new RegExp(pattern.source,"g"))];if(matches.length!==1)throw Error("Specify each plate dimension and hole condition exactly once.");return matches[0];};
 const triple=text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?/);
 const named=(key:string)=>take(new RegExp(`(?:${key})\\s*(?:는|은|가|을|를)?\\s*${number}\\s*${unit}`));
 const dimensions=triple?[triple]:[named("가로|폭|width"),named("세로|깊이|depth"),named("두께|thickness")];
 const margin=take(/(?:모서리(?:에서)?\s*(?:간격)?|여백|margin)\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?/);
 const diameter=take(/(?:구멍\s*)?(?:지름|diameter)\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?/);
 const counts=[...text.matchAll(/(?:구멍|holes?)\s*(4|네|네\s*개|four|\d+)\s*(?:개)?|(\d+|네|four)\s*(?:개의?\s*)?(?:구멍|holes?)/g)];
 if(counts.length!==1||!["4","네","네 개","four"].includes((counts[0][1]??counts[0][2]).trim()))throw Error("Specify exactly four circular through holes (구멍 네 개 / 구멍 4개).");
 let rest=text;for(const match of [...dimensions,margin,diameter,counts[0]])rest=rest.replace(match[0]," ");
 const words=["만들어주세요","만들어줘","만들어","그려주세요","그려줘","해주세요","주세요","안쪽","관통","모서리","mounting","through","corners","corner","edges","edge","plate","holes","hole","create","make","with","four","from","the","and","판","각","에서","으로","씩","개의","개","에","인","을","를","와","과","a"];
 rest=rest.replace(new RegExp(words.join("|"),"g"),"").replace(/[\s,.;:!?“”"'()]/g,"");
 if(rest)throw Error("This plate recipe supports four circular through holes and fixed edge margins. Remove additional features or conditions and Plan again.");
 return {width:triple?mm(triple[1],triple[4]):mm(dimensions[0][1],dimensions[0][2]),depth:triple?mm(triple[2],triple[4]):mm(dimensions[1][1],dimensions[1][2]),thickness:triple?mm(triple[3],triple[4]):mm(dimensions[2][1],dimensions[2][2]),margin:mm(margin[1],margin[2]),holeDiameter:mm(diameter[1],diameter[2])};
}
export function splitPlatePreservation(text:string):{edit:string;marginMm:number}|undefined {
 const match=/^(.+?[.!])\s*구멍(?:은|을|는)?\s*(?:각\s*)?모서리에서\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(?:간격을?\s*)?유지(?:해줘|해주세요)[.!]?$/.exec(text);
 return match?{edit:match[1],marginMm:mm(match[2],match[3])}:undefined;
}
