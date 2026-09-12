import type {
  CadDocument,
} from "./CadDocument";

type SerializedCadFile = {
  format: "agent-webcad";
  version: 1;
  document: CadDocument;
};

export function serializeDocument(
  document: CadDocument
): string {
  const file: SerializedCadFile = {
    format: "agent-webcad",
    version: 1,
    document,
  };

  return JSON.stringify(
    file,
    null,
    2
  );
}

export function deserializeDocument(
  data: string
): CadDocument {
  const parsed =
    JSON.parse(data) as unknown;

  if (
    typeof parsed !== "object" ||
    parsed === null
  ) {
    throw new Error(
      "Invalid CAD file."
    );
  }

  const file =
    parsed as Partial<SerializedCadFile>;

  if (
    file.format !==
      "agent-webcad" ||
    file.version !== 1 ||
    !file.document
  ) {
    throw new Error(
      "Unsupported CAD file format."
    );
  }

  const document =
    file.document;

  if (
    typeof document.id !== "string" ||
    typeof document.revision !== "number" ||
    typeof document.objects !== "object" ||
    typeof document.features !== "object" ||
    typeof document.layers !== "object" ||
    !Array.isArray(
      document.rootObjects
    ) ||
    !Array.isArray(
      document.rootLayers
    )
  ) {
    throw new Error(
      "Invalid CAD document structure."
    );
  }

  return document;
}