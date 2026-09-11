import { CadObject } from './CadObject';
import { CadFeature } from './Feature';

export interface CadDocument {
  id: string;
  revision: number;

  objects: Record<string, CadObject>;
  features: Record<string, CadFeature>;

  rootObjects: string[];
}