import type {CadDxfStyle,LayerStyle,CadVectorStyle} from "@agent-webcad/cad-document";
export type DxfInheritance={layer:LayerStyle;block:LayerStyle};
export function resolveDxfStyle(base:LayerStyle,policy?:CadDxfStyle,inherited?:DxfInheritance){
 const layer=policy?.layer0&&inherited?inherited.layer:base,style={...layer};
 if(policy?.color)style.color=policy.color==="by-block"?inherited?.block.color??"#000000":policy.color;
 if(policy?.lineType)style.lineType=policy.lineType==="by-block"?inherited?.block.lineType??"continuous":policy.lineType;
 if(policy?.lineWeight!==undefined)style.lineWeight=policy.lineWeight==="by-block"?inherited?.block.lineWeight??.25:policy.lineWeight;
 return {layer,style};
}
export function dxfVectorStyle(params:Record<string,unknown>,style:LayerStyle):CadVectorStyle|undefined{
 const original=params.vectorStyle as CadVectorStyle|undefined,policy=params.dxfStyle as CadDxfStyle|undefined;
 return policy?{stroke:style.color,fill:policy.fill?style.color:original?.fill??null,fillGradient:original?.fillGradient??null,opacity:original?.opacity??1,strokeWidth:style.lineWeight}:original;
}
