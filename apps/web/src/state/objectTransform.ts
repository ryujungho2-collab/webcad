import type {
  CadFeature,
  CadObject,
  CadObjectTransform,
} from "@agent-webcad/cad-document";

export const IDENTITY_OBJECT_TRANSFORM: CadObjectTransform = {
  translation: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

export function getObjectTransform(
  object: CadObject,
  feature?: CadFeature,
): CadObjectTransform {
  if (object.transform) {
    return {
      translation: [...object.transform.translation],
      rotation: [...object.transform.rotation],
      scale: Array.isArray(object.transform.scale)
        ? [...object.transform.scale] as [number, number, number]
        : [Number(object.transform.scale), Number(object.transform.scale), Number(object.transform.scale)],
    };
  }

  // Documents written before object transforms stored primitive placement
  // on the feature. Read that value as a migration-compatible fallback.
  const legacyPosition = feature?.params.position;
  const translation =
    Array.isArray(legacyPosition) && legacyPosition.length === 3
      ? legacyPosition.map(Number) as [number, number, number]
      : [...IDENTITY_OBJECT_TRANSFORM.translation] as [number, number, number];

  return {
    translation,
    rotation: [...IDENTITY_OBJECT_TRANSFORM.rotation] as [number, number, number],
    scale: [...IDENTITY_OBJECT_TRANSFORM.scale] as [number, number, number],
  };
}
