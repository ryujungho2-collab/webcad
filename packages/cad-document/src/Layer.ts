export interface CadLayer {
  id: string;
  name: string;

  visible: boolean;
  locked: boolean;

  objectIds: string[];
  style?: LayerStyle;
}

export type LayerStyle = { color: string; lineType: "continuous" | "dashed" | "center"; lineWeight: number };
