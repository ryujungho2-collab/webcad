import { CadObject } from "./CadObject";
import { CadFeature } from "./Feature";
import { CadLayer } from "./Layer";
import { Sketch } from "./Sketch";

export interface CadDocument {
  id: string;
  revision: number;
  componentLibrary?:Record<string,import("./ArchitectureContent").ComponentDefinition>;

  objects: Record<string, CadObject>;
  features: Record<string, CadFeature>;
  /** Optional for version-1 files created before parametric sketches existed. */
  sketches?: Record<string, Sketch>;
  blocks?: Record<string, CadBlock>;
  variables?: Record<string, import("./Expressions").CadVariable>;
  parameterBindings?: Record<string, import("./Parameters").CadParameterBinding>;
  /** Illustrator-style output boards; geometry remains in document coordinates. */
  artboards?: Record<string, CadArtboard>;
  /** Directed presentation relations, independent of model parenting. */
  frameLinks?: Record<string, import("./FrameLink").CadFrameLink>;
  /** Flat presentation groups; collapse never changes output visibility. */
  workspaceSections?: Record<string, import("./WorkspaceSection").CadWorkspaceSection>;
  /** Original, embedded raster files shared by one or more image features. */
  rasterAssets?: Record<string, import("./RasterAsset").CadRasterAsset>;
  scenes?: Record<string, import("./Scene").CadScene>;
  /** Immutable source receipts; absent mapped objects are historical deletions. */
  exchangeImports?: Record<string, import("./ExchangeFixture").ExchangeImport>;
  /** Named camera snapshots; never model transforms or authoring work planes. */
  modelViews?: Record<string, import("./ModelView").CadModelView>;
  /** User-defined frames, optionally bound to an exact planar BRep face. */
  workPlanes?: Record<string, import("./WorkPlane").CadWorkPlane>;

  /** Stable parts, non-destructive exploded views and associative outlines. */
  modelPresentation?: import("./ModelPresentation").CadModelPresentation;

  layers: Record<string, CadLayer>;

  rootObjects: string[];
  rootLayers: string[];
}

export type CadBlockOverride = {
  objectId: string;
  vectorStyle?: import("./VectorStyle").CadVectorStyle;
  visible?: boolean;
};

export type CadBlock = {
  id: string;
  name: string;
  workPlane: "XY" | "XZ" | "YZ";
  members: { type: "drawing" | "drafting"; objectId?: string; params: Record<string, unknown>; transform: import("./CadObject").CadObjectTransform; layerId: string }[];
  overrides?: Record<string, CadBlockOverride>;
};

export type CadDrawingFrame = { stitch?:import("./FrameStitch").CadFrameStitch; memberIds: string[]; sourceOrigin: [number, number]; denominator: number };
export type CadArtboard = {
  frameSheet?: import("./FrameSheet").CadFrameSheet;
  /** Presentation references; never object parenting or model transforms. */
  frame?: CadDrawingFrame;
  id: string;
  name: string;
  workPlane: "XY" | "XZ" | "YZ";
  origin: [number, number];
  size: [number, number];
  background: string;
  backgroundOpacity: number;
  showGrid: boolean;
  visible: boolean;
  locked: boolean;
};
