import {test,beforeEach} from "node:test";
import assert from "node:assert/strict";
import {validSpline,serializeDocument,deserializeDocument,type CadSpline} from "@agent-webcad/cad-document";
import {readDxfSpline,reconstructDxfFit} from "../src/interop/dxfSpline";
import {parseDxf} from "../src/interop/dxfParser";
import {planDxfImport} from "../src/interop/dxfImport";
import {prepareDxf} from "../src/interop/dxfPreparation";
import {encodeDxf} from "../src/interop/dxfWriter";
import {splinePoint,trimSpline,splineBezierSpans,sampleSpline} from "../src/precision/splineGeometry";
import {periodicSource,periodicTags,fitTags,fitPoints,curveDxfFixture} from "./helpers/curveDxfFixture";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {undoDocument,redoDocument} from "../src/state/history";
import {getWorldDrawingGeometry} from "../src/precision/worldGeometry";
beforeEach(resetTestDocument);
const close=(a:number[],b:number[],eps=1e-8)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<=eps,`${a} != ${b}`);
const parsed=(tags=periodicTags())=>{const p=parseDxf(curveDxfFixture(tags));assert.deepEqual(p.warnings,[]);assert.equal(p.entities[0]?.kind,"spline");return p.entities[0] as CadSpline;};
const fields=(tags:(number|string)[])=>{const pairs:[number,string][]=[];for(let i=2;i<tags.length;i+=2)pairs.push([Number(tags[i]),String(tags[i+1])]);return pairs;};
// Independent recursive Cox basis, including the left limit at the period end.
function reference(s:CadSpline,t:number){const u=t===s.domain[1]?t-1e-12:t,basis=(i:number,p:number):number=>{if(!p)return s.knots[i]<=u&&u<s.knots[i+1]?1:0;const a=s.knots[i+p]-s.knots[i],b=s.knots[i+p+1]-s.knots[i+1];return (a?(u-s.knots[i])/a*basis(i,p-1):0)+(b?(s.knots[i+p+1]-u)/b*basis(i+1,p-1):0);},w=s.controlPoints.map((_,i)=>basis(i,s.degree)*(s.weights?.[i]??1)),sum=w.reduce((a,b)=>a+b,0);return [0,1,2].map(j=>s.controlPoints.reduce((n,p,i)=>n+p[j]*w[i]/sum,0));}
test("wrapped rational periodic basis normalizes one exact period with original seam and domain",()=>{
 const p=parseDxf(curveDxfFixture(periodicTags())),s=p.entities[0] as CadSpline;
 assert.deepEqual(p.warnings,[]);assert.match(p.curveConversions![0],/cyclic editing/);assert.ok(validSpline(s));assert.deepEqual(s.domain,[0,4]);
 for(let i=0;i<=400;i++)close(splinePoint(s,i/100),reference(periodicSource,i/100));
 close(splinePoint(s,0),[80/3,0,0]);close(splinePoint(s,4),[80/3,0,0]);
 assert.deepEqual(s.knots.slice(0,3),[0,0,0]);assert.deepEqual(s.knots.slice(-3),[4,4,4]);
 for(let degree=1;degree<=8;degree++){
  const count=degree+2,unique=Array.from({length:count},(_,i)=>[30*Math.cos(i*2*Math.PI/count),30*Math.sin(i*2*Math.PI/count),0] as [number,number,number]),w=unique.map((_,i)=>1+i/10),source:CadSpline={degree,controlPoints:[...unique,...unique.slice(0,degree)],weights:[...w,...w.slice(0,degree)],knots:Array.from({length:count+2*degree+1},(_,i)=>i-degree),domain:[0,count]};
  const tags=[0,'SPLINE',70,7,71,degree,72,source.knots.length,73,source.controlPoints.length,74,0,...source.knots.flatMap(t=>[40,t]),...source.weights!.flatMap(v=>[41,v]),...source.controlPoints.flatMap(p=>[10,p[0],20,p[1],30,p[2]])],normalized=readDxfSpline(fields(tags)).curve;
  for(let i=0;i<=20;i++)close(splinePoint(normalized,count*i/20),reference(source,count*i/20));
 }
});
test("nonclamped right endpoint insertion preserves rational source, all spans and repeated trimming",()=>{
 const s=trimSpline(periodicSource);assert.deepEqual(trimSpline(s),s);
 const spans=splineBezierSpans(periodicSource);assert.equal(spans.length,4);
 close(spans.at(-1)!.h.at(-1)!.slice(0,3).map(v=>v/spans.at(-1)!.h.at(-1)![3]),reference(periodicSource,4));
 for(let i=0;i<=100;i++)close(splinePoint(s,4*i/100),reference(periodicSource,4*i/100));
 const finite={...periodicSource,domain:[.3,3.7] as [number,number]},trim=trimSpline(finite);for(let i=0;i<=100;i++)close(splinePoint(trim,.3+3.4*i/100),splinePoint(finite,.3+3.4*i/100));
});
test("periodic WCS points are scaled from inches without applying a tilted normal as OCS",()=>{
 const tags=periodicTags();for(let i=0;i<tags.length;i+=2)if(tags[i]===20){tags[i]=30;}else if(tags[i]===30){tags[i]=20;}
 const p=parseDxf(curveDxfFixture([...tags,210,0,220,-1,230,0],1)),s=p.entities[0] as CadSpline;
 assert.deepEqual(p.warnings,[]);for(let i=0;i<100;i++){const q=reference(periodicSource,i/25);close(splinePoint(s,i/25),[q[0]*25.4,0,q[1]*25.4]);}
});
test("fit-only reconstructs deterministic natural cubic and exposes lack of between-point error bound",()=>{
 const a=parseDxf(curveDxfFixture(fitTags())),b=parseDxf(curveDxfFixture(fitTags()));assert.deepEqual(a,b);assert.deepEqual(a.warnings,[]);
 assert.match(a.curveConversions![0],/no source-curve deviation bound/);const s=a.entities[0] as CadSpline;
 const lengths=fitPoints.slice(1).map((p,i)=>Math.hypot(...p.map((v,j)=>v-fitPoints[i][j]))),sum=lengths.reduce((a,b)=>a+b,0);let t=0;close(splinePoint(s,0),fitPoints[0]);for(let i=0;i<lengths.length;i++){t+=lengths[i]/sum;close(splinePoint(s,Math.min(1,t)),fitPoints[i+1]);}
 const p=s.controlPoints;for(const axis of [0,1,2]){assert.ok(Math.abs(p[0][axis]-2*p[1][axis]+p[2][axis])<1e-10);assert.ok(Math.abs(p.at(-1)![axis]-2*p.at(-2)![axis]+p.at(-3)![axis])<1e-10);}
 const straight=reconstructDxfFit([[0,0,0],[1,2,3]],1e-10).curve;close(splinePoint(straight,.3),[.3,.6,.9]);
});
test("fit cubic C1/C2 joins match in the explicit chord parameter, not just fit vertices",()=>{
 const s=parsed(fitTags()),p=s.controlPoints,ts=[...new Set(s.knots)],n=(p.length-1)/3;
 for(let i=1;i<n;i++){const dt0=ts[i]-ts[i-1],dt1=ts[i+1]-ts[i],k=i*3;
  close(p[k].map((v,j)=>3*(v-p[k-1][j])/dt0),p[k+1].map((v,j)=>3*(v-p[k][j])/dt1));
  close(p[k].map((v,j)=>6*(v-2*p[k-1][j]+p[k-2][j])/dt0**2),p[k+2].map((v,j)=>6*(v-2*p[k+1][j]+p[k][j])/dt1**2));
 }
});
test("rejects ambiguous periodic wrap, weights, knot extension, unknown flags and invalid counts",()=>{
 const base=fields(periodicTags()),reject=(f:[number,string][],pattern:RegExp)=>assert.throws(()=>readDxfSpline(f),pattern);
 reject(base.map(([c,v],i)=>[c,i===base.length-6?'1':v]),/repeat/);
 let seen=0;reject(base.map(([c,v])=>[c,c===41&&++seen===6?'3':v]),/repeat/);
 seen=0;reject(base.map(([c,v])=>[c,c===40&&++seen===1?'-2.1':v]),/extensions/);
 reject(base.map(([c,v])=>[c,c===70?'64':v]),/flags/);reject(base.map(([c,v])=>[c,c===73?'5':v]),/counts/);
 reject(base.map(([c,v])=>[c,c===70?'4294967299':v]),/flags/);
 reject(base.map(([c,v])=>[c,c===41?'0':v]),/positive weights/);
});
test("strict SPLINE coordinates and tolerances reject malformed values instead of zero fallback",()=>{
 const base=fields(fitTags());for(const extra of [[[44,'-1']],[[12,'1'],[22,'0']],[[210,'0'],[220,'0'],[230,'0']]] as [number,string][][])assert.throws(()=>readDxfSpline([...base,...extra]));
 const bad=parseDxf(curveDxfFixture([...fitTags(),21,7]));assert.equal(bad.entities.length,0);assert.match(bad.warnings[0],/duplicate/);
 assert.equal(parseDxf(curveDxfFixture([...fitTags(),230,1])).entities.length,1);
 for(const code of [71,74,11,21]){const b=base.map(([c,v])=>[c,c===code?'NaN':v] as [number,string]);assert.throws(()=>readDxfSpline(b));}
 assert.throws(()=>readDxfSpline(base.filter(([c])=>c!==21)),/missing Y/);
});
test("unsupported fit conditions stay explicit; no hidden periodic/closed/tangent guess",()=>{
 for(const flags of [1,2,4]){const p=parseDxf(curveDxfFixture(fitTags().map((v,i,a)=>a[i-1]===70?flags:v)));assert.equal(p.entities.length,0);assert.match(p.warnings[0],/open nonrational/);}
 assert.throws(()=>reconstructDxfFit([[0,0,0],[0,0,0],[1,1,0]],1e-8),/ill-conditioned/);
 const closed=[...fitTags(),11,65,21,0,31,0],count=closed.findIndex((v,i)=>i%2===0&&v===74);closed[count+1]=5;const rejected=parseDxf(curveDxfFixture(closed));assert.equal(rejected.entities.length,0);assert.match(rejected.warnings[0],/closed fit-only/);
 assert.throws(()=>reconstructDxfFit(Array.from({length:87},(_,i)=>[i,Math.sin(i),0]),1e-8),/256-pole/);
 const s=reconstructDxfFit(Array.from({length:86},(_,i)=>[i,Math.sin(i),0]),1e-8).curve;assert.equal(s.controlPoints.length,256);assert.ok(validSpline(s));
});
test("auxiliary fit data uses authoritative control basis with a separate conversion note",()=>{
 const tags=[...periodicTags(),11,0,21,0];const index=tags.findIndex((v,i)=>i%2===0&&v===74);tags[index+1]=1;const p=parseDxf(curveDxfFixture(tags));assert.equal(p.entities.length,1);assert.match(p.curveConversions![0],/auxiliary fit/);
});
test("block member normalization and reviewed unit overrides retain explicit bases and source-wide notes",()=>{
 const source=parseDxf(curveDxfFixture()),prepared=prepareDxf(source,{unit:'cm',includedLayers:['Periodic'],usedOnly:true}).parsed;
 assert.equal(prepared.entities.length,1);assert.equal(prepared.curveConversions?.length,2);
 const a=source.entities[0] as CadSpline,b=prepared.entities[0] as CadSpline;for(let i=0;i<=40;i++)close(splinePoint(b,i/10),splinePoint(a,i/10).map(v=>v*10));
 const block=[0,'SECTION',2,'BLOCKS',0,'BLOCK',2,'Curves',10,0,20,0,30,0,...periodicTags(),...fitTags(),0,'ENDBLK',0,'ENDSEC',0,'SECTION',2,'ENTITIES',0,'INSERT',8,'Placement',2,'Curves',10,0,20,0,30,0,0,'ENDSEC',0,'EOF',''].join('\n');
 const p=parseDxf(block);assert.deepEqual(p.warnings,[]);assert.equal(p.blocks.Curves.entities.length,2);assert.equal(p.curveConversions?.length,2);assert.match(p.curveConversions![0],/Block "Curves"/);
 const plan=planDxfImport(block,new Map(),'block');assert.ok(plan.ok);assert.equal(plan.stats.curveConversions?.length,2);assert.deepEqual(plan.stats.skipped,[]);
});
test("tiny finite parameters and extreme valid rational weights roundtrip without decimal truncation",async()=>{
 const s={...periodicSource,knots:periodicSource.knots.map(t=>t*1e-14),domain:[0,4e-14] as [number,number],weights:[1e-9,1.0001e-9,1e-9,1.0001e-9,1e-9,1.0001e-9]};
 assert.ok((await dispatchCadCommand({type:'create-drawing',id:'tiny',drawing:'spline',params:{...s,workPlane:'XY'}})).ok);
 const d=encodeDxf(cadDocument,['tiny']),p=parseDxf(d.text);assert.deepEqual(p.warnings,[]);const r=p.entities[0] as CadSpline;
 assert.deepEqual(r.domain,s.domain);for(let i=0;i<=100;i++)close(splinePoint(r,i*4e-16),splinePoint(s,i*4e-16),1e-10);
 const crop=parseDxf(encodeDxf(cadDocument,['tiny'],{paperBounds:[10,-1,30,41]}).text);assert.ok(crop.entities.length>=2);for(const c of crop.entities)for(const q of sampleSpline(c as CadSpline))assert.ok(q[0]>=10-1e-7&&q[0]<=30+1e-7);
});
test("Review import, edit, Undo, finite crop, export/reimport and portable source remain exact",async()=>{
 const result=planDxfImport(curveDxfFixture(),new Map(),'e2');assert.ok(result.ok);assert.equal(result.stats.curveConversions?.length,2);assert.deepEqual(result.stats.skipped,[]);
 const before=documentState(),plan=await previewCadCommand(result.command);assert.ok(plan.result.ok);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(plan.planId)).ok);
 const imported=documentState(),ids=cadDocument.rootObjects.filter(id=>Object.values(cadDocument.features).some(f=>f.output===id&&f.params.kind==='spline'));assert.equal(ids.length,2);
 assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),imported);
 const id=ids[0],feature=Object.values(cadDocument.features).find(f=>f.output===id)!,s=feature.params as unknown as CadSpline;
 const changed={...s,controlPoints:s.controlPoints.map(p=>[p[0]+5,p[1],p[2]] as [number,number,number]),domain:[.2,3.8] as [number,number]};
 assert.ok((await dispatchCadCommand({type:'update-spline',objectId:id,spline:changed})).ok);
 const g=getWorldDrawingGeometry(cadDocument.objects[id],Object.values(cadDocument.features).find(f=>f.output===id)!)!.spline!;
 const out=encodeDxf(cadDocument,[id]),again=parseDxf(out.text);assert.equal(out.skipped,0);assert.deepEqual(again.warnings,[]);assert.equal(again.curveConversions?.length,0);
 const r=again.entities[0] as CadSpline;for(let i=0;i<=200;i++)close(splinePoint(r,.2+3.6*i/200),splinePoint(g,.2+3.6*i/200));
 const cropped=encodeDxf(cadDocument,[id],{paperBounds:[10,-2,30,42]}),c=parseDxf(cropped.text);assert.ok(c.entities.length>=2);for(const piece of c.entities){assert.equal(piece.kind,'spline');for(const p of sampleSpline(piece as CadSpline,.01))assert.ok(p[0]>=10-1e-7&&p[0]<=30+1e-7);}
 assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
