import {planArtboardPdf,ARTBOARD_PDF_DPI_OPTIONS,type ArtboardPdfDpi} from "./artboardPdf";
import {useEffect,useMemo,useRef,useState} from "react";
import {cadDocument} from "../state/cadDocument";
import {documentVersion,sameDocumentVersion,subscribeDocumentChanges} from "../state/documentSession";
import {preflightOutput,outputBoardDxf,type OutputFormat,type OutputIssue,type OutputPage} from "./outputPreflight";
import {encodeSvg} from "./svgWriter";
import {downloadFile} from "./exportModel";
import {ArtboardPdfDialog,type ArtboardPdfBoard} from "./ArtboardPdfDialog";
import "./outputPreflight.css";
function Thumbnail({svg,name}:{svg:string;name:string}){const [url,setUrl]=useState('');useEffect(()=>{const value=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));setUrl(value);return()=>URL.revokeObjectURL(value);},[svg]);return <img src={url||undefined} alt={`${name} output thumbnail`}/>;}
export function OutputPreflightDialog({initialIds,onClose,onInspect}:{initialIds?:string[];onClose:()=>void;onInspect:(issue:OutputIssue)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[format,setFormat]=useState<OutputFormat>('pdf'),[dpi,setDpi]=useState<ArtboardPdfDpi>(96),[generation,setGeneration]=useState(0),[ids,setIds]=useState(initialIds??Object.values(cadDocument.artboards??{}).filter(b=>b.visible).map(b=>b.id)),[ack,setAck]=useState(false),[message,setMessage]=useState(''),[pdf,setPdf]=useState<ArtboardPdfBoard[]>();
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 useEffect(()=>subscribeDocumentChanges(()=>setGeneration(g=>g+1)),[]);
 const [report,setReport]=useState<{pages:OutputPage[];version:ReturnType<typeof documentVersion>}>({pages:[],version:documentVersion()}),[scanning,setScanning]=useState(true),[progress,setProgress]=useState('');
 useEffect(()=>{let cancelled=false;setScanning(true);setReport({pages:[],version:documentVersion()});setAck(false);setMessage('');const version=documentVersion();
  const timer=setTimeout(()=>{void(async()=>{const pages:OutputPage[]=[];for(const [index,id] of ids.entries()){if(cancelled)return;setProgress(`Checking page ${index+1} of ${ids.length}`);await new Promise(resolve=>setTimeout(resolve,0));if(cancelled)return;pages.push(preflightOutput([id],format)[0]);}if(!cancelled){setReport({pages,version});setScanning(false);setProgress('');}})().catch(e=>{if(!cancelled){setMessage(e instanceof Error?e.message:String(e));setScanning(false);}});},0);return()=>{cancelled=true;clearTimeout(timer);};
 },[ids,format,generation]);
 useEffect(()=>{setAck(false);setMessage('');},[report]);
 const thumbnails=useMemo(()=>new Map(report.pages.filter(p=>p.scene).map(p=>[p.boardId,encodeSvg([],{items:p.scene!.items,viewBox:p.scene!.board,background:p.scene!.board.background})])),[report]);
 const errors=report.pages.flatMap(p=>p.issues.filter(i=>i.severity==='error')),warnings=report.pages.flatMap(p=>p.issues.filter(i=>i.severity==='warning'));
 const pdfPlan=useMemo(()=>format==='pdf'&&report.pages.length&&!scanning&&!errors.length?planArtboardPdf(report.pages.map(p=>p.scene!),dpi):null,[report,format,scanning,dpi]);
 const pdfError=pdfPlan&&'error' in pdfPlan?pdfPlan.error:'';
 const sets=[...new Map(Object.values(cadDocument.modelPresentation?.sheets??{}).filter(s=>s.publication).map(s=>[s.publication!.setId,s])).values()];
 const ready=!pdfError&&!scanning&&report.pages.length===ids.length&&!!ids.length&&!errors.length&&(!warnings.length||ack);
 function output(){if(!sameDocumentVersion(report.version)){setMessage('Document changed. Recheck before output.');return;}if(!ready)return;
  try{if(format==='pdf'){setPdf(report.pages.map(p=>({board:p.scene!.board,scene:p.scene!})));return;}
   for(const p of report.pages){const name=p.name.replace(/[^a-z0-9._-]+/gi,'-')||p.boardId;if(format==='svg')downloadFile(encodeSvg([],{items:p.scene!.items,viewBox:p.scene!.board,background:p.scene!.board.background}),`${name}.svg`,'image/svg+xml');else downloadFile(outputBoardDxf(p.boardId).text,`${name}.dxf`,'application/dxf');}
   setMessage(`Downloaded ${report.pages.length} ${format.toUpperCase()} page(s).`);
  }catch(e){setMessage(e instanceof Error?e.message:String(e));}
 }
 return <dialog ref={dialog} className="output-preflight" aria-label="Output preflight" aria-busy={scanning} onCancel={e=>{e.preventDefault();onClose();}}><header><h2>Output preflight</h2><button type="button" aria-label="Close output preflight" onClick={onClose}>×</button></header>
 <div className="output-preflight-controls"><label>Format<select aria-label="Preflight format" value={format} onChange={e=>setFormat(e.target.value as OutputFormat)}><option value="pdf">PDF</option><option value="svg">SVG</option><option value="dxf">DXF</option></select></label>{format==='pdf'&&<label>DPI<select aria-label="Preflight PDF resolution" value={dpi} onChange={e=>{setDpi(Number(e.target.value) as ArtboardPdfDpi);setAck(false);}}>{ARTBOARD_PDF_DPI_OPTIONS.map(v=><option key={v}>{v}</option>)}</select></label>}<button type="button" onClick={()=>setGeneration(g=>g+1)}>Recheck output</button><button type="button" onClick={()=>setIds(Object.values(cadDocument.artboards??{}).filter(b=>b.visible).map(b=>b.id))}>All visible pages</button></div>
 <div className="output-preflight-sets">{sets.map(s=><button key={s.publication!.setId} type="button" aria-label={`Check sheet set ${s.publication!.setId}`} onClick={()=>setIds(Object.values(cadDocument.modelPresentation!.sheets!).filter(v=>v.publication?.setId===s.publication!.setId).sort((a,b)=>a.publication!.page-b.publication!.page).map(v=>v.artboardId))}>Sheet set · {s.publication!.fields.drawingName}</button>)}</div>
 <fieldset><legend>Pages to check</legend>{Object.values(cadDocument.artboards??{}).map(b=><label key={b.id}><input type="checkbox" aria-label={`Check page ${b.name}`} checked={ids.includes(b.id)} onChange={e=>setIds(e.target.checked?[...ids,b.id]:ids.filter(id=>id!==b.id))}/>{b.name}{!b.visible?' · hidden':''}</label>)}</fieldset>
 <p role="status" aria-label="Preflight summary">{scanning?progress+" · ":""}{ids.length} pages · {errors.length+(pdfError?1:0)} errors · {warnings.length} warnings. Checking never modifies the document or Undo.</p>
 {pdfError&&<p role="alert" data-preflight-code="pdf-budget" data-severity="error">{pdfError} Choose a smaller page set or a lower DPI.</p>}
 <div className="output-preflight-pages">{report.pages.map(page=><section className="output-preflight-page" key={page.boardId} data-preflight-page={page.boardId}><div><h3>{page.name}</h3><small>{page.scaleLabel}{page.scene?` · ${page.scene.board.size.join(' × ')} mm`:''}</small>{page.scene?<Thumbnail name={page.name} svg={thumbnails.get(page.boardId)!}/>:<p>No output preview: resolve the errors below.</p>}</div><ul>{page.issues.map((issue,i)=><li key={i} data-preflight-code={issue.code} data-severity={issue.severity}><strong>{issue.severity}</strong> {issue.message}<button type="button" disabled={!cadDocument.artboards?.[issue.boardId]?.visible} onClick={()=>{onClose();onInspect(issue);}}>Show target</button></li>)}{!page.issues.length&&<li>No detected issues.</li>}</ul></section>)}</div>
 {warnings.length>0&&<label><input type="checkbox" aria-label="Accept output warnings" checked={ack} onChange={e=>setAck(e.target.checked)}/>I reviewed the warnings and accept this output.</label>}
 {message&&<p role="alert">{message}</p>}<footer><button type="button" onClick={onClose}>Close preflight</button><button type="button" aria-label="Continue checked output" disabled={!ready} onClick={output}>{format==='pdf'?'Preview checked PDF':`Download checked ${format.toUpperCase()}`}</button></footer>
 {pdf&&<ArtboardPdfDialog initialDpi={dpi} boards={pdf} activeBoardId={pdf[0]?.board.id??null} documentId={cadDocument.id} onClose={()=>setPdf(undefined)} onExported={setMessage}/>}
 </dialog>;
}
