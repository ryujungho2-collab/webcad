export type CadCommand =
  | { type: "batch"; commands: Exclude<CadCommand, { type: "batch" }>[] }
  | {
      type: "create-drawing";
      id?: string;
      drawing: "line" | "polyline" | "rectangle" | "circle" | "arc";
      params: Record<string, unknown>;
      layerId?: string;
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
    }
  | {
      type: "fillet";
      target: string;
      edges: string[];
      radius: number;
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
    };
