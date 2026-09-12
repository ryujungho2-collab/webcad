import {
  CadEngine,
  createBox,
  createCylinder,
  translate,
  cut,
  volume,
  shapeToMesh,
} from "../src/index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runSmokeTest() {
  console.log("=== agent-webcad kernel smoke test ===");

  console.log("[1] Initializing OpenCascade...");
  const engine = await CadEngine.create();

  assert(engine, "CadEngine was not created");
  assert(engine.oc, "OpenCascade runtime was not initialized");

  console.log("[2] Creating box...");
  const box = await createBox(50, 30, 10);
  assert(box, "Box creation failed");

  console.log("[3] Creating cylinder...");
  const cylinder = await createCylinder(5, 20);
  assert(cylinder, "Cylinder creation failed");

  console.log("[4] Translating cylinder...");
  const translatedCylinder = await translate(
    cylinder,
    25,
    15,
    -5,
  );

  assert(
    translatedCylinder,
    "Cylinder translation failed",
  );

  console.log("[5] Measuring box volume...");
  const beforeVolume = await volume(box);

  assert(
    Number.isFinite(beforeVolume) && beforeVolume > 0,
    `Invalid box volume: ${beforeVolume}`,
  );

  console.log("Box volume:", beforeVolume);

  console.log("[6] Performing boolean cut...");
  const result = await cut(
    box,
    translatedCylinder,
  );

  assert(result, "Boolean cut returned no result");

  console.log("[7] Measuring cut volume...");
  const afterVolume = await volume(result);

  assert(
    Number.isFinite(afterVolume) && afterVolume > 0,
    `Invalid cut volume: ${afterVolume}`,
  );

  assert(
    afterVolume < beforeVolume,
    `Boolean cut did not reduce volume: before=${beforeVolume}, after=${afterVolume}`,
  );

  console.log("Cut volume:", afterVolume);

  console.log("[8] Converting result to mesh...");
  const mesh = await shapeToMesh(result);

  assert(mesh, "shapeToMesh returned nothing");

  assert(
    mesh.positions.length > 0,
    "Mesh contains no vertices",
  );

  assert(
    mesh.indices.length > 0,
    "Mesh contains no triangle indices",
  );

  console.log(
    "Vertices:",
    mesh.positions.length / 3,
  );

  console.log(
    "Triangles:",
    mesh.indices.length / 3,
  );

  console.log("");
  console.log("✅ SMOKE TEST PASSED");
}

runSmokeTest().catch((error) => {
  console.error("");
  console.error("❌ SMOKE TEST FAILED");
  console.error(error);

  process.exitCode = 1;
});