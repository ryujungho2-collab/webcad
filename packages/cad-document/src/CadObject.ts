export interface CadObjectTransform {
  translation: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface CadObject {
  id: string;
  geometryId: string;
  name: string;
  visible: boolean;

  layerId: string;

  /** Object placement in document space. Rotation values are degrees. */
  transform?: CadObjectTransform;
}
