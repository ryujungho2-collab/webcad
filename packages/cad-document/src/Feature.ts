export interface CadFeature {
  id: string;
  type:
    | "primitive"
    | "drawing"
    | "drafting"
    | "dimension"
    | "extrude"
    | "sweep"
    | "loft"
    | "transform"
    | "boolean"
    | "fillet"
    | "chamfer"
    | "revolve"
    | "image";

  inputs: string[];
  /** Live sources regenerate this feature. Independent copies retain a snapshot. */
  dependencyMode?: "live" | "snapshot";
  output: string;

  params: Record<string, unknown>;
  /** Typed persisted construction, evaluated by the shared live feature graph. */
  construction?: import("./Construction").CadConstructionDefinition;
  /** Live 2D repetition; params remain exact evaluated drawing geometry. */
  pattern?:import("./Pattern").CadPatternInstance;
}
