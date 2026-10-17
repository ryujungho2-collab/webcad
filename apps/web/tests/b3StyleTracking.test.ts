import assert from "node:assert/strict";
import { test } from "node:test";
import { validDimensionStyle } from "@agent-webcad/cad-document";
import { validateCommand } from "@agent-webcad/cad-commands";
import { resolveDimension } from "../src/precision/dimensionGeometry";
import { trackingCandidates, type TrackingAnchor } from "../src/precision/trackingSnap";
import { WORK_PLANES } from "../src/precision/workPlane";
import { beforeEach } from "node:test";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { undoDocument, redoDocument } from "../src/state/history";
import { resetTestDocument } from "./helpers/documentHarness";
import { collectExportAnnotations } from "../src/export/exportModel";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
import { localDraftingGeometry } from "../src/precision/draftingGeometry";
import { layerStyle } from "../src/precision/layerStyle";

beforeEach(resetTestDocument);

test("dimension style changes presentation but retains measured model length", () => {
  const params={kind:"linear",workPlane:"XY",points:[[0,0],[25.4,0]],offset:10};
  const base=resolveDimension(params)!, styled=resolveDimension({...params,style:{lengthUnit:"in",precision:3,textHeight:5,arrowSize:6,textGap:4,paperScale:2}})!;
  assert.equal(base.value,25.4);
  assert.equal(styled.value,base.value);
  assert.equal(styled.text,"1.000 in");
  assert.equal(styled.textHeight,10);
  assert.deepEqual(styled.segments[0],base.segments[0]);
  assert.notDeepEqual(styled.segments[3],base.segments[3]);
  assert.deepEqual(styled.textPosition,[12.7,18,0]);
});

test("dimension style rejects malformed or out-of-range values at command boundary", () => {
  assert.equal(validDimensionStyle({precision:7}),false);
  assert.equal(validDimensionStyle({paperScale:0}),false);
  assert.equal(validateCommand({type:"update-dimension",objectId:"d",params:{style:{lengthUnit:"cm",precision:1}}}),true);
  assert.equal(validateCommand({type:"update-dimension",objectId:"d",params:{style:{lengthUnit:"px"}}}),false);
});

test("radial, diameter, angular and chain annotations share display formatting", () => {
  const style={lengthUnit:"cm" as const,angleUnit:"rad" as const,precision:1};
  assert.equal(resolveDimension({kind:"radius",center:[0,0],radius:10,style})?.text,"R 1.0 cm");
  assert.equal(resolveDimension({kind:"diameter",center:[0,0],radius:10,style})?.text,"Ø 2.0 cm");
  const angular=resolveDimension({kind:"angular",workPlane:"XY",first:{objectId:"a",segmentId:"s1"},second:{objectId:"b",segmentId:"s2"},branch:{firstRay:1,secondRay:1,sweep:"ccw"},radius:10,lines:[{kind:"line",workPlane:"XY",start:[0,0,0],end:[10,0,0]},{kind:"line",workPlane:"XY",start:[0,0,0],end:[0,10,0]}],style});
  assert.equal(angular?.text,"1.6 rad");
  assert.equal(angular?.value,Math.PI/2);
  const chain=localDraftingGeometry(cadDocument,{kind:"chain",workPlane:"XY",points:[[0,0,0],[10,0,0],[30,0,0]],orientation:"horizontal",offset:10,height:4,style},layerStyle(cadDocument.layers["layer-default"]));
  assert.deepEqual(chain.texts.map(text=>text.text),["1.0 cm","2.0 cm"]);
});

test("tracking candidates combine two acquired axes and cycle through nearby results", () => {
  const anchors:TrackingAnchor[]=[
    {point:[10,20,0],objectId:"a",source:"A"},
    {point:[30,40,0],objectId:"b",source:"B"},
  ];
  const project=(point:[number,number,number]):[number,number]=>[point[0]*2,point[1]*2];
  const candidates=trackingCandidates([30.2,20.1,0],anchors,WORK_PLANES.XY,project,12);
  assert.equal(candidates[0].axis,"intersection");
  assert.deepEqual(candidates[0].point,[30,20,0]);
  assert.deepEqual(candidates[0].sources,["A","B"]);
  assert.ok(candidates.length>1);
  assert.ok(trackingCandidates([30.2,20.1,0],anchors,WORK_PLANES.XY,project,12,"horizontal").every(candidate=>candidate.axis==="horizontal"));
  assert.equal(trackingCandidates([100,100,0],anchors,WORK_PLANES.XY,project,4).length,0);
});

test("style edit is undoable, round-trips through CAD JSON and drives SVG annotation text", async () => {
  const create=await dispatchCadCommand({type:"create-dimension",id:"styled",dimension:"linear",params:{workPlane:"XY",points:[[0,0],[25.4,0]],offset:10}});
  assert.ok(create.ok,create.reason);
  const edit=await dispatchCadCommand({type:"update-dimension",objectId:"styled",params:{style:{lengthUnit:"in",precision:1,textHeight:6,paperScale:2}}});
  assert.ok(edit.ok,edit.reason);
  const feature=Object.values(cadDocument.features).find(item=>item.output==="styled")!;
  assert.deepEqual(feature.params.points,[[0,0],[25.4,0]]);
  const exported=collectExportAnnotations("XY",cadDocument);
  assert.equal(exported.texts[0].text,"1.0 in");
  assert.equal(exported.texts[0].size,12);
  const restored=deserializeDocument(serializeDocument(cadDocument));
  assert.deepEqual(Object.values(restored.features).find(item=>item.output==="styled")?.params.style,feature.params.style);
  undoDocument();
  assert.equal(collectExportAnnotations("XY",cadDocument).texts[0].text,"25.40 mm");
  redoDocument();
  assert.equal(collectExportAnnotations("XY",cadDocument).texts[0].text,"1.0 in");
});
