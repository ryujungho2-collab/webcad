import artifacts from "../../scripts/localTestArtifacts.json";

/** Available only in the local browser runner; not a product data endpoint. */
export function localTestArtifactUrl(id: keyof typeof artifacts): string {
  return `/__local_test_artifact?id=${encodeURIComponent(id)}`;
}
