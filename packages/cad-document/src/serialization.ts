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

  migrateDrawingTopology(document);
  return document;
}

/**
 * Add stable topology references to drawings saved before topology metadata
 * existed. IDs are derived from the feature id and semantic role/index, so an
 * old file can be opened, edited, saved and reopened without changing refs.
 */
function migrateDrawingTopology(document: CadDocument) {
  for (const feature of Object.values(document.features)) {
    if (feature.type !== "drawing") continue;
    const params = feature.params as Record<string, unknown>;
    const existing = params.topology as { version?: number } | undefined;
    if (existing?.version === 1) continue;
    const kind = String(params.kind ?? "drawing");
    const controls: { id: string; role: string; index?: number }[] = [];
    const segments: { id: string; startControlId: string; endControlId: string }[] = [];
    const curves: { id: string; kind: string }[] = [];
    const control = (role: string, index?: number) => {
      const suffix = index === undefined ? role : `${role}-${index}`;
      const entry = { id: `${feature.id}:control:${suffix}`, role, ...(index === undefined ? {} : { index }) };
      controls.push(entry);
      return entry.id;
    };
    if (Array.isArray(params.points)) {
      (params.points as unknown[]).forEach((_, index) => control("vertex", index));
      const closed = kind === "rectangle" || params.closed === true;
      for (let index = 0; index < controls.length - 1; index += 1) {
        segments.push({ id: `${feature.id}:segment:${index}`, startControlId: controls[index].id, endControlId: controls[index + 1].id });
      }
      if (closed && controls.length > 2) segments.push({ id: `${feature.id}:segment:${controls.length - 1}`, startControlId: controls.at(-1)!.id, endControlId: controls[0].id });
    } else if (kind === "circle") {
      control("center"); control("radius"); curves.push({ id: `${feature.id}:curve:circle`, kind: "circle" });
    } else if (kind === "arc") {
      control("center"); control("start"); control("end"); curves.push({ id: `${feature.id}:curve:arc`, kind: "arc" });
    }
    params.topology = { version: 1, controls, segments, curves };
  }
}
