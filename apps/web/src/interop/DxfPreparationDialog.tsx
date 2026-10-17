import { useState } from "react";
import { DxfReviewDialog, type DxfReview } from "./DxfReviewDialog";
import { planParsedDxfImport } from "./dxfImport";
import type { DxfParseResult } from "./dxfParser";
import { DXF_INPUT_UNITS, suggestFloorPlanLayers, type DxfPreparation } from "./dxfPreparation";
import {parseLength} from "../precision/units";

export type DxfPreparationSource = {
  review: Extract<DxfReview, { mode: "import" }>;
  parsed: DxfParseResult; layerByName: Map<string, string>; tag: string;
};

export function DxfPreparationDialog({ initial, revision, onClose, onApplied }: {
  initial: DxfPreparationSource; revision: number; onClose: () => void; onApplied: (ids: string[]) => void;
}) {
  const [source, setSource] = useState(initial.review);
  const [options, setOptions] = useState<DxfPreparation>({ includedLayers: initial.parsed.layers, unit: "file", usedOnly: true });
  const [origin, setOrigin] = useState(["0", "0", "0"]);
  const [search,setSearch]=useState(""),[pick,setPick]=useState<"base"|"length-start"|"length-end"|null>(null),[first,setFirst]=useState<[number,number]|null>(null),[measured,setMeasured]=useState<number|null>(null),[expected,setExpected]=useState(""),[assumed,setAssumed]=useState(false);
  const unknownUnit=options.unit==="file"&&initial.parsed.unitName.includes("assumed"),expectedMm=parseLength(expected),mismatch=expectedMm!==null&&measured!==null&&Math.abs(expectedMm-measured)>Math.max(.01,expectedMm*.001);
  const [dirty, setDirty] = useState(false), [error, setError] = useState("");
  function edit(patch: Partial<DxfPreparation>) { setOptions(value => ({ ...value, ...patch })); setDirty(true); setError(""); }
  function review() {
    if(unknownUnit&&!assumed){setError("Choose input units or explicitly confirm the assumed millimetres.");return;}
    if(expected.trim()&&(expectedMm===null||expectedMm<=0||mismatch)){setError("Resolve the known-length/unit mismatch before Review.");return;}
    if (origin.some(v => !v.trim() || !Number.isFinite(Number(v)))) { setError("Enter a finite base point in mm."); return; }
    const result = planParsedDxfImport(initial.parsed, initial.layerByName, initial.tag, { ...options,sourceName:initial.review.name,...(expectedMm!==null&&measured!==null?{unitCheck:{measuredMm:measured,expectedMm}}:{}), originMm: origin.map(Number) as [number, number, number] });
    if (!result.ok) { setError(result.reason); return; }
    setSource({ ...initial.review, command: result.command, stats: result.stats }); setDirty(false); setError("");
  }
  const controls = <fieldset className="dxf-preparation"><legend>Prepare floor plan · 평면도 준비</legend>
    <p>Choose source layers before tracing walls. Changes remain a proposal until Import. Original files and existing layers are preserved.</p>
    <div className="dxf-preparation-actions">
      <button type="button" onClick={() => { const names = suggestFloorPlanLayers(initial.parsed.layers); if (!names.length) { setError("No wall/door/window layer names matched. Select layers below."); return; } edit({ includedLayers: names, excludeText: true, reference: true, usedOnly: true }); }}>Suggest walls & openings</button>
      <button type="button" onClick={() => edit({ includedLayers: initial.parsed.layers })}>Select all source layers</button>
    </div>
    <p>Suggestions use names only; inspect the list. Retained blocks keep all nested contents, including text and dependency layers.</p>
    <label>Find source layers<input aria-label="Search DXF layers" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <div className="dxf-source-layers" aria-label="DXF source layers">{initial.parsed.layers.filter(name=>name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(name => <label key={name}>
      <input type="checkbox" aria-label={`Import source layer ${name}`} checked={options.includedLayers?.includes(name) ?? true} onChange={e => edit({layerRoles:{...options.layerRoles,[name]:e.target.checked?"reference":"exclude"}, includedLayers: e.target.checked ? [...(options.includedLayers ?? []), name] : options.includedLayers?.filter(n => n !== name) })}/>{name}
      <select aria-label={`DXF layer role ${name}`} value={!options.includedLayers?.includes(name)?"exclude":options.layerRoles?.[name]??"reference"} onChange={e=>{const role=e.target.value as NonNullable<DxfPreparation["layerRoles"]>[string];edit({layerRoles:{...options.layerRoles,[name]:role},includedLayers:role==="exclude"?options.includedLayers?.filter(n=>n!==name):[...new Set([...(options.includedLayers??[]),name])]});}}><option value="reference">Reference</option><option value="wall">Wall</option><option value="opening">Door / window</option><option value="exclude">Exclude</option></select>
    </label>)}</div>
    <label>Input units<select aria-label="DXF input units" value={options.unit} onChange={e => {setMeasured(null);setFirst(null);setPick(null);edit({ unit: e.target.value as DxfPreparation["unit"] });}}>
      <option value="file">File: {initial.parsed.unitName}</option>{Object.keys(DXF_INPUT_UNITS).map(unit => <option key={unit} value={unit}>{unit}</option>)}
    </select></label>
    {unknownUnit&&<label><input type="checkbox" aria-label="Confirm assumed DXF millimetres" checked={assumed} onChange={e=>{setAssumed(e.target.checked);setDirty(true);}}/>Source unit is unspecified; explicitly use assumed mm</label>}
    <label>Known length<input aria-label="DXF expected known length" placeholder="e.g. 4000mm (optional)" value={expected} onChange={e=>{setExpected(e.target.value);if(measured!==null)setDirty(true);setError("");}}/></label>
    <p>Preview length: {measured===null?"not measured":`${measured.toFixed(3)} mm`}{mismatch?" · unit mismatch":""}. Measure before changing settings; review unit changes before measuring again.</p>
    <button type="button" disabled={dirty} onClick={()=>{setPick("length-start");setFirst(null);}}>Pick known length in preview</button>
    <button type="button" disabled={dirty} onClick={()=>setPick("base")}>Pick base point in preview</button>
    {pick&&<p role="status">{pick==="base"?"Click the base point on the XY preview below. Z remains explicit.":pick==="length-start"?"Click first point of the known length.":"Click second point of the known length."}<button type="button" onClick={()=>setPick(null)}>Cancel point pick</button></p>}
    <p>All results use mm. Verify a known length after import. Base coordinates below are world mm after unit conversion.</p>
    <div className="dxf-origin">{["X", "Y", "Z"].map((axis, i) => <label key={axis}>Base {axis} → 0<input aria-label={`DXF base ${axis} mm`} type="number" value={origin[i]} onChange={e => { setOrigin(values => values.map((v, k) => k === i ? e.target.value : v)); setDirty(true); setError(""); }}/></label>)}</div>
    <label><input type="checkbox" aria-label="Exclude standalone DXF text" checked={!!options.excludeText} onChange={e => edit({ excludeText: e.target.checked })}/>Exclude standalone text</label>
    <label><input type="checkbox" aria-label="Omit unused DXF definitions" checked={!!options.usedOnly} onChange={e => edit({ usedOnly: e.target.checked })}/>Omit unused blocks and layers from this import</label>
    <label><input type="checkbox" aria-label="Lock DXF reference layers" checked={!!options.reference} onChange={e => edit({ reference: e.target.checked })}/>Import into separate, locked CAD reference layers</label>
    {error && <p role="alert">{error}</p>}
    <button type="button" aria-label="Review DXF preparation" disabled={!dirty||unknownUnit&&!assumed} onClick={review}>Review preparation</button>
    {dirty && <p role="status">Settings changed. Review preparation before importing.</p>}
  </fieldset>;
  return <DxfReviewDialog source={source} revision={revision} onClose={onClose} onApplied={onApplied} preparationControls={controls} preparationPending={dirty} preparationBlocked={unknownUnit&&!assumed||!!expected.trim()&&(expectedMm===null||expectedMm<=0||measured===null||mismatch)} onPreviewPick={pick?point=>{
    if(pick==="base"){const offset=source.stats.preparation?.originMm??[0,0,0];setOrigin([String(point[0]+offset[0]),String(point[1]+offset[1]),origin[2]]);setDirty(true);setPick(null);}
    else if(pick==="length-start"){setFirst(point);setPick("length-end");}
    else if(first){setMeasured(Math.hypot(point[0]-first[0],point[1]-first[1]));setPick(null);setDirty(true);}
  }:undefined}/>;
}
