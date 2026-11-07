import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeDocument } from "@agent-webcad/cad-document";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { queryProfileExtrudeRelations } from "../src/state/profileExtrudeRelations";
import { buildProfileExtrudeRelationFixture } from "./helpers/profileExtrudeRelationFixture";

test("both directions explain the same recorded live edge and sketch ownership without changing CAD state", async () => {
  await buildProfileExtrudeRelationFixture(true);
  const saved = serializeDocument(cadDocument), token = cadHistory.getStateToken();
  const forward = queryProfileExtrudeRelations(cadDocument, "profile");
  const reverse = queryProfileExtrudeRelations(cadDocument, "solid");
  assert.equal(forward.schema, "webcad.profile-extrude-relations.v1");
  assert.deepEqual(forward.document, { id: cadDocument.id, revision: cadDocument.revision });
  assert.equal(forward.role, "profile-candidate");
  assert.equal(reverse.role, "extrude");
  assert.equal(forward.relations.length, 1);
  assert.deepEqual(reverse.relations, [{ ...forward.relations[0], viewedFrom: "incoming" }]);
  const [relation] = forward.relations;
  assert.equal(relation.viewedFrom, "outgoing");
  assert.equal(relation.direction, "profile-to-extrude");
  assert.equal(relation.mode, "live");
  assert.equal(relation.status, "resolved");
  assert.equal(relation.source.objectId, "profile");
  assert.equal(relation.source.representation, "analytic-curve");
  assert.deepEqual(relation.source.sketchOwners, [{ sketchId: "owner", missing: false }]);
  assert.equal(relation.target.objectId, "solid");
  assert.equal(relation.target.representation, "brep");
  assert.deepEqual(relation.evidence, {
    graphRelation: "live-input", extrudeFeatureId: "feature-solid", recordedInputId: "profile", declaredDependencyMode: "live",
  });
  assert.ok(forward.codeEvidence.some(entry => entry.symbol === "liveFeatureInputs"));
  assert.deepEqual(JSON.parse(JSON.stringify(forward)), forward);
  relation.source.sketchOwners[0].missing = true;
  relation.source.label = "Modified detached result";
  assert.equal(serializeDocument(cadDocument), saved);
  assert.equal(cadHistory.getStateToken(), token);
});

test("a recorded snapshot is historical and an actual duplicate without input IDs has no edge", async () => {
  await buildProfileExtrudeRelationFixture();
  const copy = await dispatchCadCommand({ type: "duplicate-object", objectId: "solid" });
  assert.ok(copy.ok, copy.reason);
  assert.deepEqual(queryProfileExtrudeRelations(cadDocument, copy.createdIds[0]).relations, []);
  assert.equal(queryProfileExtrudeRelations(cadDocument, "profile").relations.length, 1);
  // A detached fixture represents a historical file that retained input IDs.
  const recorded = structuredClone(cadDocument);
  recorded.features["feature-solid"].dependencyMode = "snapshot";
  const [historical] = queryProfileExtrudeRelations(recorded, "profile").relations;
  assert.equal(historical.mode, "snapshot");
  assert.equal(historical.evidence.graphRelation, "snapshot-source");
});

test("unresolved inputs retain their IDs without a guessed replacement or representation", async () => {
  await buildProfileExtrudeRelationFixture();
  const detached = structuredClone(cadDocument);
  delete detached.features["feature-profile"];
  const [missingFeature] = queryProfileExtrudeRelations(detached, "solid").relations;
  assert.equal(missingFeature.status, "missing-source-feature");
  assert.equal(missingFeature.source.representation, null);
  delete detached.objects.profile;
  const [missingObject] = queryProfileExtrudeRelations(detached, "solid").relations;
  assert.equal(missingObject.status, "missing-source");
  assert.equal(missingObject.source.objectId, "profile");
  assert.equal(missingObject.source.missing, true);
  assert.equal(missingObject.mode, "live");
  delete detached.features["feature-solid"].dependencyMode;
  const [legacy] = queryProfileExtrudeRelations(detached, "solid").relations;
  assert.equal(legacy.mode, "snapshot");
  assert.equal(legacy.evidence.declaredDependencyMode, null);
  assert.deepEqual(queryProfileExtrudeRelations(detached, "unknown").relations, []);
});
