export interface CadFeature {
  id: string;
  type:
    | "primitive"
    | "drawing"
    | "extrude"
    | "transform"
    | "boolean"
    | "fillet";

  inputs: string[];
  output: string;

  params: Record<string, unknown>;
}
