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

  layers: Record<string, CadLayer>;

  rootObjects: string[];
  rootLayers: string[];
}
