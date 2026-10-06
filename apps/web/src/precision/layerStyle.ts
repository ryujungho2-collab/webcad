import type { CadLayer, LayerStyle } from "@agent-webcad/cad-document";
export const DEFAULT_LAYER_STYLE: LayerStyle = {color:"#4f8cff",lineType:"continuous",lineWeight:0.25};
export const layerStyle = (layer?: CadLayer): LayerStyle => ({...DEFAULT_LAYER_STYLE,...layer?.style});
/** Dash lengths are physical paper millimetres in exported plots. */
export const paperDash = (type: LayerStyle["lineType"]): number[] => type === "dashed" ? [3,1.5] : type === "center" ? [6,1.5,1,1.5] : [];
