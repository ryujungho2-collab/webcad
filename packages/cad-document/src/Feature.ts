export interface CadFeature {
  id: string;
  type:
    | "primitive"
    | "drawing"
    | "transform"
    | "boolean"
    | "fillet";

  inputs: string[];
  output: string;

  params: Record<string, unknown>;
}
