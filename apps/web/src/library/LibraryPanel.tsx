import {ExternalScenePanel} from "./ExternalScenePanel";
import {useEffect,useMemo,useState} from "react";
import {deserializeDocument,type CadDocument} from "@agent-webcad/cad-document";
import {cadDocument} from "../state/cadDocument";
import {applyCadPlan,discardCadPlan,previewCadCommand,getCadPlanDraftingGeometry,type CadPlanPreview} from "../state/documentPlans";
import {commandInteraction} from "../state/commandInteraction";
import {CommandReview} from "../ui/CommandReview";
import {parsePointEntry} from "../precision/pointInput";
import {WORK_PLANES,planeToWorld,worldToPlane,type WorkPlaneId} from "../precision/workPlane";
import {libraryCatalog,type LibraryItem} from "./libraryCatalog";
import {libraryPlan} from "./libraryPlan";
import "./library.css";
type Props={query:string;revision:number;selectedIds:string[];layerId:string;plane:WorkPlaneId;onChange:()=>void};
export function LibraryPanel({query,revision,selectedIds,layerId,plane,onChange}:Props){
 const [source,setSource]=useState<{doc:CadDocument;name:string}|null>(null),[selected,setSelected]=useState('door-900'),[category,setCategory]=useState('All');
 const [position,setPosition]=useState('0,0'),[scale,setScale]=useState('1'),[angle,setAngle]=useState('0'),[token,setToken]=useState(()=>crypto.randomUUID()),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [review,setReview]=useState<{key:string;preview:CadPlanPreview;instanceId:string;dependencies:string[]}|null>(null);
 const local:LibraryItem[]=Object.values(cadDocument.blocks??{}).map(block=>({id:`local:${block.id}`,name:block.name,category:'Project components',source:'Current project',license:'Project content',block}));
 const imported:LibraryItem[]=Object.values(source?.doc.blocks??{}).map(block=>({id:`file:${block.id}`,name:block.name,category:'File components',source:source!.name,license:'Source file · license unspecified',block}));
 const items=[...libraryCatalog,...local,...imported],item=items.find(i=>i.id===selected),filtered=items.filter(i=>(category==='All'||i.category===category)&&(!query||`${i.name} ${i.category} ${i.source}`.toLowerCase().includes(query)));
 const point=parsePointEntry(position),world=point?planeToWorld(point,WORK_PLANES[plane]):null;
 const key=JSON.stringify([selected,position,scale,angle,token,revision,selectedIds,layerId,plane,source?.name]);
 const inputError=!item?'Choose a library item.':item.block&&item.block.workPlane!==plane?`Switch to the ${item.block.workPlane} work plane before inserting.`:item.hatch&&plane!=='XY'?'Use the XY work plane for this hatch preset.':!world?'Enter a position such as 25mm,10mm.':!scale.trim()||!Number.isFinite(Number(scale))||Number(scale)<=0?'Enter a positive scale.':!angle.trim()||!Number.isFinite(Number(angle))?'Enter a finite angle in degrees.':undefined;
 const interaction=commandInteraction({command:'Library',targets:item?.block?[]:selectedIds,draftKey:key,reviewedKey:review?.key,preview:review?.preview,inputError:inputError||error||undefined,pending:busy});
 useEffect(()=>{setReview(null);setError('');if(inputError||!item)return;let cancelled=false,id:string|undefined;const timer=setTimeout(()=>{try{const p=libraryPlan(cadDocument,item,{position:world!,scale:Number(scale),angle:Number(angle),layerId,selectedIds,token,local:item.id.startsWith('local:'),blocks:source?.doc.blocks});void previewCadCommand(p.command).then(preview=>{id=preview.planId;if(cancelled)discardCadPlan(id);else setReview({key,preview,instanceId:p.instanceId,dependencies:p.dependencies});}).catch(e=>{if(!cancelled)setError(String(e.message??e));});}catch(e){setError(e instanceof Error?e.message:String(e));}},120);return()=>{cancelled=true;clearTimeout(timer);if(id)discardCadPlan(id);};},[key,inputError]);
 const geometry=useMemo(()=>review&&review.key===key?getCadPlanDraftingGeometry(review.preview.planId,review.instanceId):undefined,[review,key]);
 const paths=(geometry?.lines??[]).map(l=>l.points.map(p=>worldToPlane(p,WORK_PLANES[plane]))),points=[...paths.flat(),...(geometry?.texts??[]).flatMap(t=>{const p=worldToPlane(t.point,WORK_PLANES[plane]);return [p,[p[0]+t.height*t.text.length*.6,p[1]+t.height]];})];
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),width=Math.max(...xs)-minX,height=Math.max(...ys)-minY,pad=Math.max(width,height,1)*.08;
 async function apply(){if(!interaction.canApply||!review)return;setBusy(true);try{const r=await applyCadPlan(review.preview.planId);if(!r.ok){setError(r.reason??'Review again.');return;}setToken(crypto.randomUUID());setReview(null);onChange();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 async function load(file:File|undefined){if(!file)return;setReview(null);try{if(file.size>20*1024*1024)throw Error('Choose a WebCAD file smaller than 20 MiB.');const doc=deserializeDocument(await file.text());const first=Object.values(doc.blocks??{})[0];if(!first)throw Error('This file has no reusable components. Create a component from drawings first.');setToken(crypto.randomUUID());setSource({doc,name:file.name});setCategory('File components');setSelected(`file:${first.id}`);}catch(e){setError(e instanceof Error?e.message:String(e));}}
 return <div className="library-panel"><ExternalScenePanel revision={revision} layerId={layerId} onChange={onChange}/><label>Category<select aria-label="Library category" value={category} onChange={e=>setCategory(e.target.value)}>{['All',...new Set(items.map(i=>i.category))].map(c=><option key={c}>{c}</option>)}</select></label>
 <label className="library-file">Open components from WebCAD<input type="file" aria-label="Open component library file" accept=".json,.webcad.json" onChange={e=>{void load(e.target.files?.[0]);e.target.value='';}}/></label>
 <small role="status">{filtered.length} library items</small><div className="library-items" role="listbox" aria-label="Library items">{filtered.map(i=><button type="button" role="option" aria-selected={i.id===selected} key={i.id} data-library-item={i.id} onClick={()=>{setSelected(i.id);setToken(crypto.randomUUID());}}>{i.name}<small>{i.category}</small></button>)}{!filtered.length&&<p role="status">No matching library items.</p>}</div>
 {item&&<section aria-label="Library placement"><strong>{item.name}</strong><p className="library-source">Source: {item.source}<br/>{item.license}</p>
 <div className="library-preview" aria-label="Library preview">{points.length?<svg viewBox={`${minX-pad} ${-minY-height-pad} ${width+pad*2} ${height+pad*2}`} role="img" aria-label={`${item.name} preview`}>{paths.map((p,i)=><polyline key={i} points={p.map(v=>`${v[0]},${-v[1]}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={Math.max(width,height,1)*.005}/>)}{geometry?.texts.map((t,i)=>{const p=worldToPlane(t.point,WORK_PLANES[plane]);return <text key={`text-${i}`} x={p[0]} y={-p[1]} fontSize={t.height} fill="currentColor" transform={`rotate(${-t.angle},${p[0]},${-p[1]})`}>{t.text}</text>;})}</svg>:item.style?<svg viewBox="0 0 100 40" style={{background:"#fff"}} role="img" aria-label="Line style preview"><path d="M10 20H90" stroke={item.style.stroke} strokeWidth={item.style.strokeWidth*8}/></svg>:<p>Choose editable boundaries to preview this preset.</p>}</div>
 {item.style&&<p>Stroke {item.style.stroke} · {item.style.strokeWidth} mm</p>}
 <p>Units: mm · origin: component base (0,0) · plane: {item.block?.workPlane??plane}. Imported WebCAD coordinates stay in mm.</p>
 {item.block&&<><label>Position<input aria-label="Library position" value={position} onChange={e=>setPosition(e.target.value)}/></label><label>Scale<input aria-label="Library scale" value={scale} onChange={e=>setScale(e.target.value)}/></label><label>Angle °<input aria-label="Library angle" value={angle} onChange={e=>setAngle(e.target.value)}/></label><p>Definitions: {review?.dependencies.join(' → ')||'Existing project reference'}. {item.id.startsWith('local:')?'Uses the existing definition without copying it.':'Creates independent definitions on the active layer.'} No external assets in built-ins.</p></>}
 <CommandReview state={interaction}/><div className="property-actions"><button type="button" aria-label="Apply library item" disabled={!interaction.canApply} onClick={()=>void apply()}>{item.block?'Insert':'Apply preset'}</button><button type="button" disabled={busy} onClick={()=>{setSelected('');setReview(null);}}>Cancel</button></div>
 </section>}
 {error&&!item&&<p role="alert">{error}</p>}
 </div>;
}
