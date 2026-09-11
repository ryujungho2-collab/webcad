export type CadCommand =
  | {
      type: "create-box";
      id?: string;
      width: number;
      depth: number;
      height: number;
      position?: [number, number, number];
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
    };