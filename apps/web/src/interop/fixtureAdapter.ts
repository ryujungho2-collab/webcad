import { identityCoordinates, MAX_FIXTURE_BYTES, validateExchangeFixture, validFixtureRectangle, type CadDocument, type ExchangeFixture, type ExchangeImport, type ExchangeLoss, type ExchangePoint } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import type { DxfImportStats } from "./dxfImport";

export function decodeFixture(text: string): ExchangeFixture {
  if (new TextEncoder().encode(text).length > MAX_FIXTURE_BYTES) throw new Error("Exchange fixture exceeds the 2 MiB limit.");
  const fixture: unknown = JSON.parse(text);
  validateExchangeFixture(fixture);
  return fixture;
}
function workPlane(points: ExchangePoint[]): "XY" | "XZ" | "YZ" | undefined {
  // Reject instead of flattening: every point must share a principal plane.
  if (points.every(p=>Math.abs(p[2]-points[0][2]) <= 1e-7)) return "XY";
  if (points.every(p=>Math.abs(p[1]-points[0][1]) <= 1e-7)) return "XZ";
  if (points.every(p=>Math.abs(p[0]-points[0][0]) <= 1e-7)) return "YZ";
}
export function planFixtureImport(text: string, layerId: string): { command: CadCommand; stats: DxfImportStats; receipt: ExchangeImport } {
  const fixture = decodeFixture(text), id = `exchange-${crypto.randomUUID()}`;
  const factor = { mm: 1, cm: 10, m: 1000, inch: 25.4 }[fixture.coordinates.unit];
  const losses = structuredClone(fixture.losses), commands: Exclude<CadCommand,{type:"batch"}>[] = [];
  const receipt: ExchangeImport = { id, adapter: fixture.adapter, version: fixture.version, documentId: fixture.documentId, coordinates: structuredClone(fixture.coordinates), mappings: [], assets: structuredClone(fixture.assets), losses };
  const loss = (code:string,message:string,sourceId?:string) => losses.push({ code, message, ...(sourceId ? {sourceId} : {}) });
  for (const asset of fixture.assets) loss("asset-metadata-only", `Asset ${asset.id}: metadata retained; bytes are unavailable and will not be downloaded.`);
  for (const entity of fixture.entities) {
    if (entity.kind === "unsupported") { loss("unsupported-entity",entity.reason,entity.sourceId); continue; }
    if (entity.assetIds?.length) { loss("required-asset-unavailable", "Entity excluded: required asset bytes are unavailable.",entity.sourceId); continue; }
    const points = entity.points.map(p=>fixture.coordinates.origin.map((o,i)=>factor*(o + p.reduce((sum,n,j)=>sum+n*fixture.coordinates.axes[j][i],0))) as ExchangePoint);
    if (points.some(p=>p.some(n=>!Number.isFinite(n) || Math.abs(n)>1e12))) throw new Error("Exchange coordinates exceed the finite world/mm range.");
    if (entity.kind === "line" ? Math.hypot(...points[1].map((n,i)=>n-points[0][i])) <= 1e-6 : !validFixtureRectangle(points)) throw new Error("Exchange geometry is degenerate after unit/coordinate conversion.");
    const plane = workPlane(points);
    if (!plane) { loss("unsupported-plane", "Entity excluded: geometry leaves the XY/XZ/YZ authoring planes.",entity.sourceId); continue; }
    const objectId = `fixture-${crypto.randomUUID()}`;
    commands.push({ type: "create-drawing", id: objectId, name: entity.name ?? entity.sourceId, drawing: entity.kind, params: { workPlane: plane, points }, layerId });
    receipt.mappings.push({ sourceId: entity.sourceId, objectId, provenance: structuredClone(entity.provenance ?? {adapter:fixture.adapter,documentId:fixture.documentId,objectId:entity.sourceId}) });
  }
  if (!commands.length) throw new Error("No supported, asset-independent line or rectangle remains in this fixture.");
  commands.push({ type: "record-exchange-import", receipt });
  const command: CadCommand = { type: "batch", label: "Import exchange fixture", commands };
  if (!validateCommand(command)) throw new Error("Invalid exchange import plan.");
  return { command, receipt, stats: { entities: fixture.entities.length, created: receipt.mappings.length, skipped: losses.map(l=>`${l.sourceId ? `${l.sourceId}: ` : ""}${l.message}`), layers: [layerId], unitName: `${fixture.coordinates.unit} → mm` } };
}

export function fixtureReceiptDetails(receipt: ExchangeImport): string[] {
  return [
    `Source: ${receipt.adapter} / ${receipt.documentId} · fixture v${receipt.version}`,
    `Original coordinates: ${JSON.stringify(receipt.coordinates)}`,
    ...receipt.mappings.map(m=>`${m.sourceId} → ${m.objectId}; provenance ${m.provenance.adapter} / ${m.provenance.documentId} / ${m.provenance.objectId}`),
    ...receipt.assets.map(a=>`Asset ${a.id}: ${a.mediaType}, ${a.byteLength} bytes, SHA-256 ${a.sha256}; metadata only`),
  ];
}

/** Exact supported geometry in canonical mm, with original source identity carried separately. */
export function encodeFixture(document: CadDocument, objectIds?: string[]) {
  const fixture: ExchangeFixture = { schema: "webcad.exchange.fixture", version: 1, adapter: "webcad-fixture", documentId: document.id, coordinates: identityCoordinates(), entities: [], assets: [], losses: [] };
  const scope = objectIds ? new Set(objectIds) : undefined;
  const receipts = Object.values(document.exchangeImports ?? {}).filter(r=>!scope || r.mappings.some(m=>scope.has(m.objectId)));
  const mappings = new Map(receipts.flatMap(r=>r.mappings.map(m=>[m.objectId,m] as const)));
  const featureByObject = new Map(Object.values(document.features).map(f=>[f.output,f]));
  const losses: ExchangeLoss[] = fixture.losses;
  for (const id of objectIds ?? document.rootObjects) {
    const object = document.objects[id], feature = featureByObject.get(id);
    const reject = (reason:string) => { losses.push({code:"excluded-object",message:`${object?.name ?? id}: ${reason}`,sourceId:id}); fixture.entities.push({kind:"unsupported",sourceId:id,reason}); };
    if (!object || !feature) { reject("Missing object or geometry."); continue; }
    if (!object.visible || !document.layers[object.layerId]?.visible) { reject("Hidden geometry excluded."); continue; }
    const world = feature.type === "drawing" ? getWorldDrawingGeometry(object,feature) : undefined;
    if (!world || feature.construction || feature.pattern || feature.inputs.length || feature.params.construction || !["line","rectangle"].includes(world.kind) || world.profileSegments?.some(s=>s.kind !== "line")) { reject("Only independent straight lines and rectangles are supported."); continue; }
    const points = world.profileSegments?.length ? world.kind === "line" ? [world.profileSegments[0].start,world.profileSegments[0].end] : world.profileSegments.map(s=>s.start) : world.points;
    if (!points || !workPlane(points) || (world.kind === "rectangle" && !validFixtureRectangle(points))) { reject("Edited geometry is outside the exact fixture subset."); continue; }
    const mapping = mappings.get(id);
    fixture.entities.push({ kind: world.kind as "line"|"rectangle", sourceId: id, name: object.name.slice(0,200), points: structuredClone(points), provenance: structuredClone(mapping?.provenance ?? {adapter:"webcad-fixture",documentId:document.id,objectId:id}) });
  }
  // Historical receipts remain in WebCAD JSON. The exchange output reports their losses and asset metadata without inventing bytes.
  for (const receipt of receipts) {
    for (const asset of receipt.assets) {
      const existing = fixture.assets.find(a=>a.id === asset.id);
      if (!existing) fixture.assets.push(structuredClone(asset));
      else if (JSON.stringify(existing) !== JSON.stringify(asset)) {
        const renamed = `asset-${crypto.randomUUID()}`;
        fixture.assets.push({ ...asset,id:renamed });
        losses.push({code:"asset-id-conflict",message:`Conflicting asset ${asset.id} exported as ${renamed}; metadata only.`});
      }
    }
    for (const l of receipt.losses) losses.push({code:"source-loss",message:l.message});
    for (const m of receipt.mappings) if (!document.objects[m.objectId]) losses.push({code:"deleted-source-object",message:`Previously imported source ${m.sourceId} was deleted.`});
  }
  if (fixture.assets.length) losses.push({code:"asset-metadata-only",message:"Asset metadata only; no asset bytes restored or exported."});
  if (fixture.entities.some(e=>e.kind !== "unsupported")) losses.push({code:"geometry-only",message:"Constraints, topology IDs, layer styles, model views, Scene links and editable feature history remain in WebCAD JSON."});
  validateExchangeFixture(fixture);
  const text = JSON.stringify(fixture,null,2);
  if (new TextEncoder().encode(text).length > MAX_FIXTURE_BYTES) throw new Error("Export exceeds the fixture size limit; select a smaller subset.");
  const details = [
    `Source: ${fixture.adapter} / ${fixture.documentId} · fixture v1 · world/mm identity basis`,
    ...fixture.entities.filter(e=>e.kind !== "unsupported").map(e=>`${e.sourceId}; provenance ${e.provenance!.adapter} / ${e.provenance!.documentId} / ${e.provenance!.objectId}`),
    ...fixture.assets.map(a=>`Asset ${a.id}: ${a.mediaType}, ${a.byteLength} bytes, SHA-256 ${a.sha256}; metadata only`),
  ];
  return { text, details, entities: fixture.entities.filter(e=>e.kind !== "unsupported").length, skipped: losses.length, warnings: losses.map(l=>l.message) };
}
