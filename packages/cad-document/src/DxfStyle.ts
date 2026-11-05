/** DXF presentation inheritance; geometry remains ordinary editable CAD paths. */
export type CadDxfStyle={color?:string|"by-block";lineType?:"continuous"|"dashed"|"center"|"by-block";lineWeight?:number|"by-block";layer0?:boolean;fill?:boolean};
export function validDxfStyle(v:unknown):v is CadDxfStyle{
 if(!v||typeof v!=="object"||Array.isArray(v))return false;const s=v as CadDxfStyle;
 return (s.color===undefined||s.color==="by-block"||typeof s.color==="string"&&/^#[0-9a-f]{6}$/i.test(s.color))&&(s.lineType===undefined||["continuous","dashed","center","by-block"].includes(s.lineType))&&(s.lineWeight===undefined||s.lineWeight==="by-block"||typeof s.lineWeight==="number"&&Number.isFinite(s.lineWeight)&&s.lineWeight>=0&&s.lineWeight<=100)&&(s.layer0===undefined||typeof s.layer0==="boolean")&&(s.fill===undefined||typeof s.fill==="boolean");
}
