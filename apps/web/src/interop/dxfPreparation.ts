import { scaleEntity, type DxfParseResult } from "./dxfParser";

export const DXF_INPUT_UNITS = { mm: 1, cm: 10, m: 1000, inch: 25.4, foot: 304.8 } as const;
export type DxfPreparation = {
  layerRoles?:Record<string,"wall"|"opening"|"reference"|"exclude">;
  unitCheck?:{measuredMm:number;expectedMm:number};
  sourceName?:string;
  includedLayers?: string[];
  unit?: "file" | keyof typeof DXF_INPUT_UNITS;
  /** World point in resulting millimetres, mapped to world zero after OCS placement. */
  originMm?: [number, number, number];
  excludeText?: boolean;
  usedOnly?: boolean;
  reference?: boolean;
};
export type DxfPreparationReport = {
  excludedEntities: number; omittedBlocks: number; omittedLayers: number;
  dependencyLayers: string[]; reference: boolean; originMm: [number, number, number];
};

/** Suggestion only: the caller must show the chosen names before importing. */
export function suggestFloorPlanLayers(names: string[]): string[] {
  return names.filter(name => /(?:wall|door|window|opening|벽|문|창|개구부)/i.test(name));
}

/** Root filtering never cuts pieces out of a retained block definition. */
export function prepareDxf(parsed: DxfParseResult, options: DxfPreparation) {
  if(options.layerRoles&&Object.entries(options.layerRoles).some(([name,role])=>!parsed.layers.includes(name)||!["wall","opening","reference","exclude"].includes(role)))throw Error("Invalid source layer role.");
  if(options.unitCheck&&(![options.unitCheck.measuredMm,options.unitCheck.expectedMm].every(n=>Number.isFinite(n)&&n>0)||Math.abs(options.unitCheck.measuredMm-options.unitCheck.expectedMm)>Math.max(.01,options.unitCheck.expectedMm*.001)))throw Error("Known length does not match the reviewed input unit.");
  if (options.unit && options.unit !== "file" && !Object.hasOwn(DXF_INPUT_UNITS, options.unit)) throw Error("Choose a supported DXF input unit.");
  const origin = options.originMm ?? [0, 0, 0];
  if (origin.length !== 3 || !origin.every(Number.isFinite)) throw Error("Enter a finite world X, Y and Z base point in mm.");
  if (options.includedLayers?.some(name => !parsed.layers.includes(name))) throw Error("A selected source layer no longer exists.");
  const selected = new Set(options.includedLayers ?? parsed.layers);
  const entities = parsed.entities.filter(e => selected.has(e.layer) && !(options.excludeText && e.kind === "text"));
  const reachable = new Set<string>();
  const visit = (name: string) => {
    if (reachable.has(name)) return;
    reachable.add(name);
    for (const e of parsed.blocks[name]?.entities ?? []) if (e.kind === "insert") visit(e.block);
  };
  for (const e of entities) if (e.kind === "insert") visit(e.block);
  const blocks = Object.fromEntries(Object.entries(parsed.blocks).filter(([name]) => !options.usedOnly || reachable.has(name)));
  const used = new Set(entities.map(e => e.layer));
  for (const block of Object.values(blocks)) for (const e of block.entities) used.add(e.layer);
  const layers = options.usedOnly ? [...used] : [...new Set([...parsed.layers, ...used])];
  const scale = options.unit && options.unit !== "file" ? DXF_INPUT_UNITS[options.unit] / parsed.unitScale : 1;
  const prepared: DxfParseResult = {
    ...parsed, layers, entities: entities.map(e => scaleEntity(e, scale)),
    blocks: Object.fromEntries(Object.entries(blocks).map(([name, b]) => [name, {
      base: b.base.map(v => v * scale) as [number, number, number], entities: b.entities.map(e => scaleEntity(e, scale)),
    }])),
    unitName: options.unit && options.unit !== "file" ? `${options.unit} (override → mm)` : parsed.unitName,
  };
  const report: DxfPreparationReport = {
    excludedEntities: parsed.entities.length - entities.length,
    omittedBlocks: Object.keys(parsed.blocks).length - Object.keys(blocks).length,
    omittedLayers: parsed.layers.filter(name => !layers.includes(name)).length,
    dependencyLayers: [...used].filter(name => !selected.has(name)),
    reference: !!options.reference, originMm: [...origin],
  };
  return { parsed: prepared, report };
}
