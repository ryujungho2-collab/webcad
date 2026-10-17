import type { CadLayer, LayerStyle } from "@agent-webcad/cad-document";
export const DEFAULT_LAYER_STYLE: LayerStyle = {color:"#4f8cff",lineType:"continuous",lineWeight:0.25};
export const layerStyle = (layer?: CadLayer): LayerStyle => ({...DEFAULT_LAYER_STYLE,...layer?.style});
/** HLR visibility is an owned derived-geometry property, independent of source layers. */
export const modelDrawingStyle=(params:Record<string,unknown>,style:LayerStyle):LayerStyle=>typeof params.sectionLineWeight==="number"?{...style,lineType:"continuous",lineWeight:params.sectionLineWeight}:params.projectionVisibility==="hidden"?{...style,lineType:"dashed",lineWeight:Math.min(style.lineWeight,.18)}:style;
/** Dash lengths are physical paper millimetres in exported plots. */
export const paperDash = (type: LayerStyle["lineType"]): number[] => type === "dashed" ? [3,1.5] : type === "center" ? [6,1.5,1,1.5] : [];
/** Construction is a display aid with a dashed stroke, independent of its layer's line type. */
export const drawingLineType = (construction: unknown, style: LayerStyle): LayerStyle["lineType"] => construction ? "dashed" : style.lineType;
