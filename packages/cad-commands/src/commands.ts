import type { SketchConstraint, SketchGeometry, SketchPointRef, SketchWorkPlane } from "@agent-webcad/cad-document";

/** Explicit routing from a replaced source to reviewed output pieces. */
export type ContourReferenceRoute = { dependentId: string; sourceId: string; referenceSlot?: "first" | "second"; resultIndices: number[]; segmentIndex?: number; pointIndex?: number; branch?: "positive" | "negative" };
export type ContourBridge = { fromId: string; fromEnd: "start" | "end"; toId: string; toEnd: "start" | "end" };

export type CadCommand =
  | { type: "upsert-scene"; scene: import("@agent-webcad/cad-document").CadScene }
  | { type: "delete-scene"; sceneId: string }
  | { type: "create-artboard"; id?: string; name?: string; workPlane: import("@agent-webcad/cad-document").SketchWorkPlane; origin: [number, number]; size: [number, number]; background?: string }
  | { type: "update-artboard"; artboardId: string; name?: string; origin?: [number, number]; size?: [number, number]; workPlane?: import("@agent-webcad/cad-document").SketchWorkPlane; background?: string; visible?: boolean; locked?: boolean }
  | { type: "delete-artboard"; artboardId: string }
  | { type: "insert-image"; id?: string; layerId?: string; asset: import("@agent-webcad/cad-document").CadRasterAsset; workPlane: import("@agent-webcad/cad-document").SketchWorkPlane; center: [number, number, number]; width: number; height: number }
  | { type: "replace-image-source"; objectId: string; asset: import("@agent-webcad/cad-document").CadRasterAsset }
  | { type: "update-image"; objectId: string; width?: number; height?: number; crop?: import("@agent-webcad/cad-document").CadImageCrop; mask?: import("@agent-webcad/cad-document").CadImageMask; opacity?: number; adjustments?: import("@agent-webcad/cad-document").CadImageAdjustments }
  | { type: "create-construction"; id?: string; name?: string; definition: import("@agent-webcad/cad-document").CadConstructionDefinition; workPlane: SketchWorkPlane; construction?: boolean; layerId?: string }
  | { type: "edit-polyline"; objectId: string; operation: "insert" | "delete" | "open" | "close"; segmentId?: string; controlId?: string; point?: [number, number, number] }
  | { type: "lengthen-drawing"; objectId: string; endpoint: "start" | "end"; mode: "total" | "delta" | "percent"; value: number }
  | { type: "stretch-drawings"; objectIds: string[]; workPlane: SketchWorkPlane; first: [number, number, number]; second: [number, number, number]; delta: [number, number, number] }
  | { type: "join-drawings"; objectIds: string[]; id?: string; bridges?: ContourBridge[]; referenceRoutes?: ContourReferenceRoute[] }
  | { type: "trim-contour"; objectId: string; cutterIds: string[]; pickPoint: [number, number, number]; rejoin?: boolean; referenceRoutes?: ContourReferenceRoute[] }
  | { type: "explode-drawings"; objectIds: string[] }
  | { type: "break-drawing"; objectId: string; firstPoint: [number, number, number]; secondPoint?: [number, number, number] }
  | {type:"create-pattern";id?:string;sourceObjectIds:string[];spec:import("@agent-webcad/cad-document").CadPatternSpec;layerId?:string}
  | {type:"update-pattern";patternId:string;spec:import("@agent-webcad/cad-document").CadPatternSpec}
  | {type:"detach-pattern"|"delete-pattern";patternId:string}
  | { type:"set-variable"; name:string; quantity:import("@agent-webcad/cad-document").VariableQuantity; expression:string }
  | { type:"remove-variable"; name:string }
  | { type:"set-parameter-binding"; target:import("@agent-webcad/cad-document").ParameterTarget; expression:string }
  | { type:"remove-parameter-binding"; bindingId:string }
  | {type:"set-layer-style";layerId:string;style:import("@agent-webcad/cad-document").LayerStyle}
  | {type:"set-vector-style";objectId:string;style:import("@agent-webcad/cad-document").CadVectorStyle}
  | {type:"create-drafting";id?:string;layerId?:string;params:Record<string,unknown>}
  | {type:"update-drafting";objectId:string;params:Record<string,unknown>}
  | {type:"define-block";id:string;name:string;objectIds:string[];base:[number,number,number]}
  | {type:"update-block";blockId:string;name?:string;objectIds?:string[];base?:[number,number,number]}
  | {type:"insert-block";id?:string;blockId:string;layerId?:string;position:[number,number,number];angle?:number}
  | {
      type: "batch";
      /** Human-readable intent used by History without changing transaction semantics. */
      label?: string;
      commands: Exclude<CadCommand, { type: "batch" }>[];
    }
  | { type: "create-sketch"; id: string; workPlane: SketchWorkPlane; layerId?: string }
  | { type: "add-sketch-geometry"; sketchId: string; geometry: SketchGeometry; constraints?: SketchConstraint[] }
  | { type: "set-sketch-construction"; sketchId: string; geometryIds: string[]; construction: boolean }
  | { type: "remove-sketch-geometry"; sketchId: string; geometryId: string }
  | { type: "add-sketch-constraint"; sketchId: string; constraint: SketchConstraint }
  | { type: "remove-sketch-constraint"; sketchId: string; constraintId: string }
  | { type: "set-sketch-dimension"; sketchId: string; constraintId: string; value: number }
  | { type: "move-sketch-point"; sketchId: string; point: SketchPointRef; position: [number, number]; /** Grip keeps operation anchors; solve-connected lets unpinned linked points follow all saved constraints. */ behavior?: "grip" | "solve-connected" }
  | { type: "move-sketch-segment"; sketchId: string; geometryId: string; segmentId: string; delta: [number, number] }
  | { type: "transform-sketch-geometry"; sketchId: string; geometryIds: string[]; translation: [number, number]; center: [number, number]; angle: number; scale: number }
  | { type: "duplicate-sketch-geometry"; sketchId: string; geometryIds: string[]; offset: [number, number] }
  | { type: "offset-sketch-geometry"; sketchId: string; geometryId: string; distance: number; side?: "left" | "right" }
  | { type: "trim-sketch-geometry" | "extend-sketch-geometry"; sketchId: string; targetId: string; cutterId: string; pickPoint: [number, number, number] }
  | {
      type: "create-drawing";
      id?: string;
      name?: string;
      drawing: "line" | "polyline" | "rectangle" | "circle" | "arc" | "point" | "infinite-line" | "ray";
      params: Record<string, unknown>;
      layerId?: string;
    }
  | {
      /** Static annotation in work-plane coordinates (no live link to the measured geometry). */
      type: "create-dimension";
      id?: string;
      dimension: "linear" | "radius" | "diameter";
      params: Record<string, unknown>;
      layerId?: string;
    }
  | {
      type: "update-dimension";
      objectId: string;
      params: Record<string, unknown>;
    }
  | {
      type: "edit-drawing-control";
      objectId: string;
      controlId: string;
      point: [number, number, number];
    }
  | {
      type: "edit-drawing-segment";
      objectId: string;
      segmentId: string;
      delta: [number, number, number];
    }
  | {
      type: "connect-drawings";
      firstId: string;
      secondId: string;
      /** Points on the two branches to retain. */
      firstPoint: [number, number, number];
      secondPoint: [number, number, number];
      treatment: "fillet" | "chamfer";
      distance: number;
      /** Chamfer setback on secondId, in world mm; omitted means symmetric. */
      secondDistance?: number;
      id?: string;
    }
  | { type: "create-dimension"; id?: string; dimension: "angular"; params: import("@agent-webcad/cad-document").AngularDimensionDefinition; layerId?: string }
  | {
      type: "edit-drawing-corner";
      objectId: string;
      controlId: string;
      treatment: "fillet" | "chamfer";
      distance: number;
      /** Chamfer setback on the next edge; omitted means equal setbacks. */
      secondDistance?: number;
      /** Omitted preserves legacy model-space distances. */
      distanceSpace?: "world";
    }
  | {
      type: "close-drawing-profile";
      objectId: string;
    }
  | {
      type: "create-extrude";
      profileObjectIds: string[];
      distance: number;
      layerId?: string;
      id?: string;
    }
  | {
      type: "update-extrude";
      objectId: string;
      distance: number;
    }
  | {
      type: "create-revolve";
      profileObjectIds: string[];
      /** Profile work-plane axis ("x" | "y") through the plane origin. */
      axis: "x" | "y";
      /** Sweep angle in degrees, (0, 360]. */
      angle?: number;
      layerId?: string;
      id?: string;
    }
  | {
      type: "create-sweep";
      /** Exactly one closed profile (same loop rules as extrude). */
      profileObjectIds: string[];
      /** One open drawing (line/polyline/arc/circle) used as the spine. */
      pathObjectId: string;
      layerId?: string;
      id?: string;
    }
  | {
      type: "create-loft";
      /** Two or more closed profiles, lofted in the given order. */
      profileObjectIds: string[];
      /** Ruled (straight spans) instead of smooth blending. */
      ruled?: boolean;
      layerId?: string;
      id?: string;
    }
  | {
      type: "update-revolve";
      objectId: string;
      angle: number;
    }
  | {
      type: "offset-drawing";
      objectId: string;
      distance: number;
      side?: "left" | "right";
    }
  | {
      type: "trim-drawing" | "extend-drawing";
      targetId: string;
      cutterId: string;
      pickPoint: [number, number, number];
    }
  | {
      type: "create-primitive";
      id?: string;
      primitive: "box" | "cylinder" | "sphere" | "cone" | "torus";
      params: Record<string, number>;
      position?: [number, number, number];
      layerId?: string;
    }
  | {
      type: "create-box";
      id?: string;
      width: number;
      depth: number;
      height: number;
      position?: [number, number, number];
      layerId?: string;
    }
  | {
      type: "boolean-cut";
      target: string;
      tool: string;
    }
  | {
      type: "boolean-operation";
      operation: "union" | "cut" | "intersect";
      target: string;
      tool: string;
      /** Deterministic result id for planned chains (pavilion/building generators). Defaults to random. */
      id?: string;
    }
  | {
      type: "fillet";
      target: string;
      edges: string[];
      radius: number;
    }
  | {
      // Symmetric chamfer only: one distance applied to every listed edge.
      // Asymmetric (distance1/distance2) needs face disambiguation the
      // current kernel binding cannot express; deferred, not faked.
      type: "chamfer";
      target: string;
      edges: string[];
      distance: number;
    }
  | {
      type: "create-layer";
      id?: string;
      name?: string;
    }
  | {
      type: "rename-layer";
      layerId: string;
      name: string;
    }
  | {
      type: "set-layer-visible";
      layerId: string;
      visible: boolean;
    }
  | {
      type: "set-layer-locked";
      layerId: string;
      locked: boolean;
    }
  | {
      type: "delete-layer";
      layerId: string;
    }
  | {
      type: "move-object-to-layer";
      objectId: string;
      layerId: string;
    }
  | {
      type: "set-object-visible";
      objectId: string;
      visible: boolean;
    }
  | {
      type: "isolate-object";
      objectId: string;
    }
  | {
      type: "show-all-objects";
    }
  | {
      type: "rename-object";
      objectId: string;
      name: string;
    }
  | {
      type: "update-box";
      objectId: string;
      width: number;
      depth: number;
      height: number;
    }
  | {
      type: "update-primitive";
      objectId: string;
      params: Record<string, number>;
    }
  | {
      type: "move-object";
      objectId: string;
      translation: [number, number, number];
    }
  | {
      type: "rotate-object";
      objectId: string;
      rotation: [number, number, number];
    }
  | {
      type: "scale-object";
      objectId: string;
      scale: [number, number, number];
    }
  | {
      type: "delete-object";
      objectId: string;
    }
  | {
      type: "duplicate-object";
      objectId: string;
      /** World-space displacement of the new copy. Defaults to 10 mm in X. */
      offset?: [number, number, number];
    };
