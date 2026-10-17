import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { CadDocument, CadRasterAsset } from "@agent-webcad/cad-document";
import { encodeBinaryStl, meshToTriangles } from "../src/export/stlWriter";
import { encodeSvg } from "../src/export/svgWriter";
import { collectArtboardExportDrawings, collectArtboardExportItems, collectExportDrawings, collectExportSolids } from "../src/export/exportModel";
import { clipSvgPolylinesToArtboard } from "../src/export/artboardSvg";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";

describe("stl writer", () => {
  test("encodes facet count, normals and little-endian vertices", () => {
    const triangles = meshToTriangles(
      [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0],
      [0, 1, 2, 3, 4, 5],
    );
    assert.equal(triangles.length, 2);
    assert.deepEqual(triangles[0].normal, [0, 0, 1]);
    const bytes = encodeBinaryStl(triangles);
    assert.equal(bytes.length, 84 + 2 * 50);
    const view = new DataView(bytes.buffer);
    assert.equal(view.getUint32(80, true), 2);
    assert.equal(view.getFloat32(84 + 8, true), 1);
  });

  test("degenerate facets encode a zero normal without throwing", () => {
    const triangles = meshToTriangles([0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 1, 2]);
    assert.deepEqual(triangles[0].normal, [0, 0, 0]);
    assert.equal(encodeBinaryStl(triangles).length, 84 + 50);
  });

  test("empty mesh encodes a valid empty solid", () => {
    const bytes = encodeBinaryStl([]);
    assert.equal(bytes.length, 84);
    assert.equal(new DataView(bytes.buffer).getUint32(80, true), 0);
  });
});

describe("svg writer", () => {
  test("emits closed polygons and open polylines with flipped Y", () => {
    const svg = encodeSvg([
      { points: [[0, 0], [10, 0], [10, 5], [0, 5]], closed: true },
      { points: [[0, 0], [5, 5]], closed: false },
    ]);
    assert.ok(svg.startsWith("<svg xmlns"));
    assert.ok(svg.includes("<polygon points=\"0,0 10,0 10,-5 0,-5\" />"));
    assert.ok(svg.includes("<polyline points=\"0,0 5,-5\" />"));
    assert.ok(svg.includes("viewBox="));
  });

  test("artboard SVG keeps exact page bounds and paints its background", () => {
    const svg = encodeSvg([{ points: [[12, 24], [20, 30]], closed: false }], {
      viewBox: { origin: [10, 20], size: [100, 80] }, background: "#f0e8d8",
    });
    assert.ok(svg.includes('viewBox="10 -100 100 80"'));
    assert.ok(svg.includes('<rect x="10" y="-100" width="100" height="80" fill="#f0e8d8" stroke="none" />'));
    assert.ok(svg.includes('<g clip-path="url(#artboard-crop)">'));
  });

  test("artboard clipping trims open paths without closing partial contours across frame edges", () => {
    const clipped = clipSvgPolylinesToArtboard([
      { points: [[-5, 5], [5, 5], [15, 5]], closed: false },
      { points: [[-5, 5], [5, 5], [5, 15]], closed: true },
      { points: [[20, 20], [30, 30]], closed: false },
    ], { origin: [0, 0], size: [10, 10] });
    assert.deepEqual(clipped[0].points, [[0, 5], [5, 5], [10, 5]]);
    assert.equal(clipped[0].closed, false);
    assert.deepEqual(clipped[1].points, [[0, 5], [5, 5], [5, 10]]);
    assert.equal(clipped[1].closed, false);
    assert.equal(clipped.length, 2);
  });

  test("empty input stays valid", () => {
    assert.ok(encodeSvg([]).includes("<svg xmlns"));
  });
});

describe("export facade", () => {
  const original = structuredClone(cadDocument);

  function restore(snapshot: CadDocument) {
    delete cadDocument.artboards;
    delete cadDocument.blocks;
    delete cadDocument.rasterAssets;
    if(snapshot.blocks)cadDocument.blocks=structuredClone(snapshot.blocks);
    if(snapshot.rasterAssets)cadDocument.rasterAssets=structuredClone(snapshot.rasterAssets);
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
      objects: {
        box: {
          id: "box", geometryId: "geometry-box", name: "Box", visible: true, layerId: "layer-default",
          transform: { translation: [10, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
      },
      features: {
        "feature-box": {
          id: "feature-box", type: "primitive", inputs: [], output: "box",
          params: { kind: "box", width: 10, depth: 8, height: 6 },
        },
      },
      layers: { "layer-default": { id: "layer-default", name: "Default", visible: true, locked: false, objectIds: ["box"] } },
      rootObjects: ["box"],
      rootLayers: ["layer-default"],
    } as unknown as CadDocument);
    cadHistory.clear();
  });
  afterEach(() => {
    restore(original);
    cadHistory.clear();
  });

  test("box exports 12 facets with the translation baked", async () => {
    const triangles = await collectExportSolids();
    assert.equal(triangles.length, 12);
    const xs = triangles.flatMap((triangle) => triangle.vertices.map((vertex) => vertex[0]));
    assert.ok(Math.min(...xs) >= 10 - 1e-6);
    assert.ok(Math.max(...xs) - Math.min(...xs) <= 10 + 1e-6);
  });

  test("hidden objects and drawings are skipped", async () => {
    cadDocument.objects.box.visible = false;
    assert.equal((await collectExportSolids()).length, 0);
  });

  test("drawings export on the active plane only", () => {
    const topology = createDrawingTopology("line", { points: [[0, 0, 0], [10, 0, 0]] }, "line");
    cadDocument.objects.line = {
      id: "line", geometryId: "geometry-line", name: "Line", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-line"] = {
      id: "feature-line", type: "drawing", inputs: [], output: "line",
      params: { kind: "line", workPlane: "XY", points: [[0, 0, 0], [10, 0, 0]], topology },
    };
    cadDocument.layers["layer-default"].objectIds.push("line");
    cadDocument.rootObjects.push("line");
    const lines = collectExportDrawings("XY");
    assert.equal(lines.length, 1);
    assert.deepEqual(lines[0].points, [[0, 0], [10, 0]]);
    assert.equal(collectExportDrawings("XZ").length, 0);
  });

  test("active artboard export clips visible plane geometry to its own sheet", () => {
    const topology = createDrawingTopology("line", { points: [[-5, 5, 0], [105, 5, 0]] }, "line");
    cadDocument.objects.line = {
      id: "line", geometryId: "geometry-line", name: "Through line", visible: true, layerId: "layer-default",
      transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    cadDocument.features["feature-line"] = { id: "feature-line", type: "drawing", inputs: [], output: "line", params: { kind: "line", workPlane: "XY", points: [[-5, 5, 0], [105, 5, 0]], topology, vectorStyle: { stroke: "#164f42", fill: null, opacity: 0.65, strokeWidth: 1.2 } } };
    cadDocument.layers["layer-default"].objectIds.push("line");
    cadDocument.rootObjects.push("line");
    cadDocument.artboards = { sheet: { id: "sheet", name: "Sheet", workPlane: "XY", origin: [0, 0], size: [100, 80], background: "#ffffff", visible: true, locked: false } };
    const lines = collectArtboardExportDrawings("sheet");
    assert.deepEqual(lines.map(line => line.points), [[[0, 5], [100, 5]]]);
    assert.deepEqual([lines[0].color, lines[0].opacity, lines[0].lineWeight], ["#164f42", 0.65, 1.2]);
    assert.throws(() => collectArtboardExportDrawings("missing"), /visible artboard/);
  });

  test("artboard export scene preserves mixed raster/vector document order", async () => {
    assert.ok((await dispatchCadCommand({type:"create-artboard",id:"ordered-board",workPlane:"XY",origin:[0,0],size:[100,80]})).ok);
    const encoded="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=",imageId="ordered-image",vectorId="ordered-vector";
    const asset:CadRasterAsset={id:"asset-order",name:"order.png",mimeType:"image/png",width:1,height:1,byteLength:Buffer.from(encoded,"base64").length,dataUrl:`data:image/png;base64,${encoded}`,contentHash:"a".repeat(64)};
    cadDocument.rasterAssets={[asset.id]:asset};
    cadDocument.objects[imageId]={id:imageId,geometryId:`geometry-${imageId}`,name:"Image",visible:true,layerId:"layer-default",transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
    cadDocument.features[`feature-${imageId}`]={id:`feature-${imageId}`,type:"image",inputs:[],output:imageId,params:{kind:"image",assetId:asset.id,workPlane:"XY",width:20,height:10,crop:{x:0,y:0,width:1,height:1}}};
    cadDocument.objects[vectorId]={id:vectorId,geometryId:`geometry-${vectorId}`,name:"Vector",visible:true,layerId:"layer-default",transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
    cadDocument.features[`feature-${vectorId}`]={id:`feature-${vectorId}`,type:"drawing",inputs:[],output:vectorId,params:{kind:"line",workPlane:"XY",points:[[0,0,0],[30,0,0]],topology:createDrawingTopology("line",{points:[[0,0,0],[30,0,0]]},"line")}};
    cadDocument.layers["layer-default"].objectIds.push(imageId,vectorId);cadDocument.rootObjects.push(imageId,vectorId);
    const items=collectArtboardExportItems("ordered-board");
    assert.deepEqual(items.map(item=>item.type),["image","polyline"]);
  });

  test("artboard composition includes visible dimension linework and text", async () => {
    assert.ok((await dispatchCadCommand({type:"create-artboard",id:"dimension-board",workPlane:"XY",origin:[0,0],size:[100,80]})).ok);
    assert.ok((await dispatchCadCommand({type:"create-dimension",id:"unsupported-dimension",dimension:"linear",params:{workPlane:"XY",points:[[0,0],[20,0]],offset:5}})).ok);
    const items=collectArtboardExportItems("dimension-board");
    assert.ok(items.some(item=>item.type==="polyline"));
    assert.ok(items.some(item=>item.type==="text"&&item.text.text.includes("20")));
  });

  test("component SVG export keeps source vector style and instance transform", async () => {
    const style = { stroke: "#164f42", fill: "#d9f4ea", fillGradient: null, opacity: 0.65, strokeWidth: 1.2 };
    assert.ok((await dispatchCadCommand({ type: "create-drawing", id: "source", drawing: "rectangle", params: {
      workPlane: "XY", points: [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0]], vectorStyle: style,
    } })).ok);
    assert.ok((await dispatchCadCommand({ type: "define-block", id: "symbol", name: "Symbol", objectIds: ["source"], base: [0, 0, 0] })).ok);
    assert.ok((await dispatchCadCommand({ type: "insert-block", id: "instance", blockId: "symbol", position: [100, 50, 0] })).ok);

    const drawings = collectExportDrawings("XY");
    const instance = drawings.find(line => line.points.some(([x, y]) => x >= 100 && y >= 50));
    assert.ok(instance);
    assert.deepEqual([instance.color, instance.fill, instance.opacity, instance.lineWeight], ["#164f42", "#d9f4ea", 0.65, 1.2]);
    assert.ok(instance.points.every(([x, y]) => x >= 100 - 1e-6 && x <= 120 + 1e-6 && y >= 50 - 1e-6 && y <= 60 + 1e-6));
  });

  test("component member override reaches artboard SVG export", async () => {
    assert.ok((await dispatchCadCommand({ type: "create-drawing", id: "plain", drawing: "rectangle", params: { workPlane: "XY", points: [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0]] } })).ok);
    assert.ok((await dispatchCadCommand({ type: "define-block", id: "symbol", name: "Symbol", objectIds: ["plain"], base: [0, 0, 0] })).ok);
    assert.ok((await dispatchCadCommand({ type: "insert-block", id: "instance", blockId: "symbol", position: [50, 50, 0] })).ok);
    assert.ok((await dispatchCadCommand({ type: "create-artboard", id: "board", workPlane: "XY", origin: [40, 40], size: [50, 40] })).ok);
    const style = { stroke: "#ff0000", fill: "#00ff00", fillGradient: null, opacity: 0.8, strokeWidth: 2 };
    assert.ok((await dispatchCadCommand({ type: "set-block-override", blockId: "symbol", objectId: "plain", vectorStyle: style })).ok);
    const lines = collectArtboardExportDrawings("board").filter(line => line.objectId === "instance");
    assert.equal(lines.length, 1);
    assert.deepEqual([lines[0].color, lines[0].fill, lines[0].opacity, lines[0].lineWeight], ["#ff0000", "#00ff00", 0.8, 2]);
  });
});
