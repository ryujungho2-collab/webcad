export type CadCommand =
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
