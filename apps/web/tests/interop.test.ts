import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument } from "@agent-webcad/cad-document";
import { validateCommand } from "@agent-webcad/cad-commands";
import { parseDxf } from "../src/interop/dxfParser";
import { planDxfImport } from "../src/interop/dxfImport";
import { encodeDxf } from "../src/interop/dxfWriter";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, undoDocument } from "../src/state/history";
import { exportStepBytes } from "../src/export/exportModel";

const SAMPLE = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1009
9
$INSUNITS
70
1
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
2
0
LAYER
2
Walls
70
0
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
8
Walls
10
0.0
20
0.0
30
0.0
11
3.937007874015748
21
0.0
31
0.0
0
LWPOLYLINE
8
Walls
90
3
70
1
10
0.0
20
0.0
10
3.937
20
0.0
10
3.937
20
3.937
0
CIRCLE
8
0
10
5.0
20
5.0
30
0.0
40
0.3937
0
ARC
8
0
10
0.0
20
0.0
30
0.0
40
1.0
50
0.0
51
90.0
0
SOLID
8
0
10
0.0
0
3DFACE
8
0
0
ENDSEC
0
EOF
`;

describe("dxf parser", () => {
  test("reads units, layers and the entity subset", () => {
    const parsed = parseDxf(SAMPLE);
    assert.equal(parsed.unitName, "inches");
    assert.equal(parsed.unitScale, 25.4);
    assert.ok(parsed.layers.includes("Walls"));
    // Inches scale to mm: 3.937in line -> 100mm.
    const line = parsed.entities.find((entity) => entity.kind === "line");
    assert.ok(line && line.kind === "line");
    assert.ok(Math.abs(line.points[1][0] - 100) < 1e-6);
    assert.equal(parsed.entities.filter((entity) => entity.kind === "polyline").length, 1);
    assert.equal(parsed.entities.filter((entity) => entity.kind === "circle").length, 1);
    assert.equal(parsed.entities.filter((entity) => entity.kind === "arc").length, 1);
    assert.ok(parsed.warnings.some((warning) => warning.includes("SOLID")));
    assert.ok(parsed.warnings.some((warning) => warning.includes("3DFACE")));
  });

  test("empty and garbage inputs stay safe", () => {
    assert.equal(parseDxf("").entities.length, 0);
    assert.equal(parseDxf("not\ndxf\nat\nall\n").entities.length, 0);
  });
});

describe("dxf import plan", () => {
  test("plans layers plus drawings as one valid batch", () => {
    const planned = planDxfImport(SAMPLE, new Map(), "test");
    assert.equal(planned.ok, true);
    if (!planned.ok) return;
    assert.equal(validateCommand(planned.command), true);
    assert.equal(planned.stats.created, 4);
    assert.equal(planned.stats.unitName, "inches");
    assert.ok(planned.stats.layers.includes("Walls"));
    assert.ok(planned.stats.skipped.length >= 2);
  });

  test("existing layers are reused, nothing planned twice", () => {
    const first = planDxfImport(SAMPLE, new Map(), "test");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const layerByName = new Map<string, string>();
    if (first.command.type === "batch") {
      for (const child of first.command.commands) {
        if (child.type === "create-layer" && child.id && child.name) layerByName.set(child.name, child.id);
      }
    }
    const second = planDxfImport(SAMPLE, layerByName, "test");
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(validateCommand(second.command), true);
    assert.ok(
      second.command.type !== "batch" ||
      !second.command.commands.some((child) => child.type === "create-layer"),
    );
  });

  test("files without entities reject", () => {
    const planned = planDxfImport("0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n", new Map(), "test");
    assert.equal(planned.ok, false);
  });
});

describe("dxf export and round trip", () => {
  const original = structuredClone(cadDocument);

  function restore(snapshot: CadDocument) {
    cadDocument.id = snapshot.id;
    cadDocument.revision = snapshot.revision;
    cadDocument.objects = structuredClone(snapshot.objects);
    cadDocument.features = structuredClone(snapshot.features);
    cadDocument.layers = structuredClone(snapshot.layers);
    cadDocument.rootObjects = [...snapshot.rootObjects];
    cadDocument.rootLayers = [...snapshot.rootLayers];
  }

  beforeEach(() => {
    restore({
      id: "test-document",
      revision: 0,
      objects: {},
      features: {},
      layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: [] } },
      rootObjects: [],
      rootLayers: ["layer-default"],
    } as unknown as CadDocument);
    cadHistory.clear();
  });
  afterEach(() => {
    restore(original);
    cadHistory.clear();
  });

  test("line and circle export then re-import", async () => {
    const linePoints: [number, number, number][] = [[0, 0, 0], [100, 0, 0]];
    cadDocument.objects.line = {
      id: "line", geometryId: "geometry-line", name: "Line", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-line"] = {
      id: "feature-line", type: "drawing", inputs: [], output: "line",
      params: { kind: "line", workPlane: "XY", points: linePoints, topology: createDrawingTopology("line", { points: linePoints }, "line") },
    };
    cadDocument.objects.circ = {
      id: "circ", geometryId: "geometry-circ", name: "Circle", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-circ"] = {
      id: "feature-circ", type: "drawing", inputs: [], output: "circ",
      params: { kind: "circle", workPlane: "XY", center: [0, 0, 0], radius: 10, topology: createDrawingTopology("circle", { center: [0, 0, 0], radius: 10 }, "circ") },
    };
    cadDocument.layers["layer-default"].objectIds.push("line", "circ");
    cadDocument.rootObjects.push("line", "circ");

    const exported = encodeDxf(cadDocument);
    assert.equal(exported.entities, 2);
    assert.equal(exported.skipped, 0);
    const reparsed = parseDxf(exported.text);
    assert.equal(reparsed.entities.length, 2);
    assert.deepEqual(reparsed.warnings, []);

    const planned = planDxfImport(exported.text, new Map([["Default", "layer-default"]]), "roundtrip");
    assert.equal(planned.ok, true);
    if (!planned.ok) return;
    const result = await dispatchCadCommand(planned.command);
    assert.equal(result.ok, true);
    // The DXF default layer "0" is created alongside the two drawings.
    assert.equal(result.createdIds.length, 3);
    assert.equal(result.createdIds.filter((id) => cadDocument.objects[id]).length, 2);
    assert.equal(undoDocument(), true);
    assert.equal(cadDocument.objects[result.createdIds[1]], undefined);
  });

  test("imported sample applies as one history entry", async () => {
    const planned = planDxfImport(SAMPLE, new Map(), "apply");
    assert.equal(planned.ok, true);
    if (!planned.ok) return;
    const result = await dispatchCadCommand(planned.command);
    assert.equal(result.ok, true);
    assert.ok(cadDocument.layers["dxf-apply-Walls"]);
    assert.equal(result.createdIds.filter((id) => cadDocument.objects[id]).length, 4);
    assert.deepEqual(cadHistory.getPastLabels(), ["Import DXF (4 entities)"]);
  });

  test("step export writes ISO-10303 for a box", async () => {
    const created = await dispatchCadCommand({
      type: "create-primitive", id: "box", primitive: "box",
      params: { width: 10, depth: 10, height: 10 },
    });
    assert.equal(created.ok, true);
    const bytes = await exportStepBytes();
    const head = new TextDecoder().decode(bytes.slice(0, 64));
    assert.ok(head.includes("ISO-10303-21"), head);
    assert.ok(bytes.length > 1000);
  }, { timeout: 120_000 });
});
