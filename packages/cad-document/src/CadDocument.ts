import { CadObject } from "./CadObject";
import { CadFeature } from "./Feature";
import { CadLayer } from "./Layer";
import { Sketch } from "./Sketch";

export interface CadDocument {
  id: string;
  revision: number;

  objects: Record<string, CadObject>;
  features: Record<string, CadFeature>;
  /** Optional for version-1 files created before parametric sketches existed. */
  sketches?: Record<string, Sketch>;
  blocks?: Record<string, CadBlock>;
  variables?: Record<string, import("./Expressions").CadVariable>;
  parameterBindings?: Record<string, import("./Parameters").CadParameterBinding>;
  /** Illustrator-style output boards; geometry remains in document coordinates. */
  artboards?: Record<string, CadArtboard>;
  /** Original, embedded raster files shared by one or more image features. */
  rasterAssets?: Record<string, import("./RasterAsset").CadRasterAsset>;
  scenes?: Record<string, import("./Scene").CadScene>;

  layers: Record<string, CadLayer>;

  rootObjects: string[];
  rootLayers: string[];
}

export type CadBlock = { id:string; name:string; workPlane:"XY"|"XZ"|"YZ"; members:{type:"drawing"|"drafting"; params:Record<string,unknown>; transform:import("./CadObject").CadObjectTransform; layerId:string}[] };

export type CadArtboard = {
  id: string;
  name: string;
  workPlane: "XY" | "XZ" | "YZ";
  origin: [number, number];
  size: [number, number];
  background: string;
  visible: boolean;
  locked: boolean;
};
