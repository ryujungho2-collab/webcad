import type { LayerStyle } from "@agent-webcad/cad-document";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

/** Shader dash pattern shared with paper/DXF: long dash, gap, short dash, gap. */
export function applyCenterPattern(material:LineMaterial,type?:LayerStyle["lineType"]) {
  if(type!=="center")return;
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace(
      "if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard;",
      "float phase = mod(vLineDistance + dashOffset, 10.0); if ((phase > 6.0 && phase < 7.5) || phase > 8.5) discard;",
    );
  };
  material.customProgramCacheKey=()=>"cad-center-6-1.5-1-1.5";
}
