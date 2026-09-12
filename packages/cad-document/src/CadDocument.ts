import { CadObject } from "./CadObject";
import { CadFeature } from "./Feature";
import { CadLayer } from "./Layer";

export interface CadDocument {
  id: string;
  revision: number;

  objects: Record<string, CadObject>;
  features: Record<string, CadFeature>;

  layers: Record<string, CadLayer>;

  rootObjects: string[];
  rootLayers: string[];
}