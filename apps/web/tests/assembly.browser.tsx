import * as THREE from "three";
import {useState,useEffect} from "react";
import {createRoot} from "react-dom/client";
import raw from "../../../output/projects/rotating-laptop-stand/laptop-stand.webcad.json?raw";
import {motionSourceSignature} from "../src/state/assemblyMotion";
import {deserializeDocument,serializeDocument,interferencePairKey} from "@agent-webcad/cad-document";
import {CadViewport} from "../src/viewport/CadViewport";
import {AssemblyPanel} from "../src/properties/AssemblyPanel";
import {cadDocument} from "../src/state/cadDocument";
import {subscribeDocumentChanges} from "../src/state/documentSession";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {restoreTestDocument} from "./helpers/documentHarness";
import {createCadToolSession} from "../src/copilot/cadToolSession";
import {measureSolidDistance,projectKernelMetrics} from "../src/cad/kernelGeometryService";
import {undoDocument,redoDocument,cadHistory} from "../src/state/history";
import {openDocumentFile} from "../src/state/documentFile";
import {selectedAssemblyJoint,assemblyPreview} from "../src/state/assemblyPreview";
import {assemblyMatrix} from "../src/state/assemblyCommands";
import {installBrowserChecks} from "./helpers/browserChecks";
import {click,choose,text,waitFor,input,physical} from "./helpers/physicalInput";
import "../src/styles.css";import "../src/ui/tokens.css";import "../src/ui/inspector.css";
restoreTestDocument(deserializeDocument(raw));const initial=structuredClone(cadDocument.objects),geometry=JSON.stringify(cadDocument.features),metrics:any[]=[];
function Harness(){const [revision,setRevision]=useState(cadDocument.revision);useEffect(()=>subscribeDocumentChanges(()=>setRevision(cadDocument.revision)),[]);return <div style={{display:"grid",gridTemplateColumns:"1fr 350px",height:"calc(100vh - 35px)",width:"100vw"}}><div style={{position:"relative",minWidth:0}}><CadViewport documentRevision={revision} selectedObjectId="stand-turntable" selectedObjectIds={["stand-turntable"]} gridVisible={false} projectionMode="orthographic" transformMode={null} viewAction={{id:1,type:"fit-all"}}/></div><div style={{padding:12,overflow:"auto"}}><AssemblyPanel revision={revision} onDocumentChange={()=>setRevision(cadDocument.revision)}/><button onClick={()=>void undoDocument()}>Assembly Undo</button><button onClick={()=>void redoDocument()}>Assembly Redo</button></div></div>;}
createRoot(document.getElementById("root")!).render(<Harness/>);
const button=document.getElementById("run-assembly") as HTMLButtonElement,output=document.getElementById("assembly-result")!;
button.onclick=async()=>{const checks:string[]=[],check=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push("PASS: "+label);output.textContent=checks.join(String.fromCharCode(10));};try{
 await waitFor(()=>!!document.querySelector("canvas"));await click("Assembly joints");
 const selectPart=async(label:string,id:string)=>{const s=document.querySelector('[aria-label="'+label+'"]') as HTMLSelectElement;await choose(label,[...s.options].findIndex(o=>o.value===id));};
 const apply=async()=>{await waitFor(()=>!![...document.querySelectorAll("button")].find(b=>b.textContent==="Apply Joint"));await click("Apply Joint");await waitFor(()=>assemblyPreview()===null);};
 await selectPart("Joint parent","stand-base");await click("Review Ground");check(!cadDocument.assembly,"Ground preview leaves live document unchanged");await apply();check(cadDocument.assembly?.grounded.includes("stand-base"),"Native Ground Apply");
 await selectPart("Joint child","stand-turntable");await text("Joint ID","bearing");await text("Joint origin","0,0,20");await click("Review Joint");await apply();check(cadDocument.assembly!.joints.bearing.type==="revolute","Native Revolute Joint creation");
 await selectPart("Joint parent","stand-turntable");await selectPart("Joint child","stand-support");await text("Joint ID","support");await choose("Joint type",1);await click("Review Joint");await apply();check(cadDocument.assembly!.joints.support.type==="fixed","Native Fixed Joint creation");
 for(const [id,parentId,childId] of [["plate","stand-support","stand-plate"],["lip","stand-plate","stand-lip"],["shaft","stand-base","stand-shaft"]]){const r=await dispatchCadCommand({type:"assembly-joint-create",joint:{id,type:"fixed",parentId,childId,origin:[0,0,0],axis:[0,0,1],angle:0}});if(!r.ok)throw Error(r.reason);}
 await choose("Assembly Joint",1);
 await click("Review 90°");await waitFor(()=>!!assemblyPreview());check(cadDocument.assembly!.joints.bearing.angle===0,"Angle Preview does not publish");await click("Cancel Joint preview");check(cadDocument.assembly!.joints.bearing.angle===0&&!assemblyPreview(),"Native Cancel preserves angle");
 for(const angle of [90,180,0]){const start=performance.now();await click("Review "+angle+"°");await apply();let max=0;for(const id of ["stand-turntable","stand-support","stand-plate","stand-lip"]){const e=new THREE.Vector3(...initial[id].transform!.translation).applyAxisAngle(new THREE.Vector3(0,0,1),angle*Math.PI/180),actual=cadDocument.objects[id].transform!.translation;max=Math.max(max,e.distanceTo(new THREE.Vector3(...actual)));const expectedMatrix=new THREE.Matrix4().makeRotationZ(angle*Math.PI/180).multiply(assemblyMatrix(initial[id].transform!)),actualMatrix=assemblyMatrix(cadDocument.objects[id].transform!);if(expectedMatrix.elements.some((v,i)=>Math.abs(v-actualMatrix.elements[i])>1e-7))throw Error("Upper orientation did not follow Joint: "+id);}metrics.push({angle,maxPositionErrorMm:max,reviewApplyMs:performance.now()-start});check(max<1e-7,"All upper parts rotate together at "+angle+" degrees");await waitFor(()=>performance.getEntriesByName("agent-webcad:viewport-sync").some(e=>(e as PerformanceMeasure).detail?.documentRevision===cadDocument.revision));const shot=await (await input({type:"screenshot"})).json();(globalThis as any).cadTestArtifacts??={};(globalThis as any).cadTestArtifacts["assembly-"+angle+".png"]=shot.data;}
 await click("Assembly Undo");await waitFor(()=>cadDocument.assembly!.joints.bearing.angle===180);await click("Assembly Redo");await waitFor(()=>cadDocument.assembly!.joints.bearing.angle===0);check(true,"Native Undo/Redo restores absolute Joint state");
 check(JSON.stringify(cadDocument.features)===geometry,"All original BRep/Mesh geometry data retained");
 const serialized=serializeDocument(cadDocument);await openDocumentFile(new File([serialized],"laptop-stand-assembly.webcad.json",{type:"application/json"}));check(cadDocument.assembly!.joints.bearing.angle===0&&Object.keys(cadDocument.assembly!.joints).length===5,"v62 file load preserves full assembly");
 check(JSON.stringify(cadDocument.features)===geometry,"Geometry preserved after reload");

 if(document.documentElement.dataset.assemblyLifecycle==="true"){
 const matrices=()=>Object.fromEntries(Object.values(cadDocument.objects).map(o=>[o.id,assemblyMatrix(o.transform!).elements]));
 const close=(a:ReturnType<typeof matrices>,b:ReturnType<typeof matrices>)=>Object.keys(a).every(id=>a[id].every((n,i)=>Math.abs(n-b[id][i])<1e-7));
 await choose("Assembly Joint",1);await waitFor(()=>selectedAssemblyJoint()?.jointId==="bearing");check(!!document.querySelector('[aria-label="Assembly validity"]')?.textContent?.includes("valid"),"Inspector exposes selected Joint validity");
 const world=matrices();
 await text("Edit Joint origin","10,20,30");await text("Edit Joint axis","0,1,0");await text("Edit Joint minimum","0");await text("Edit Joint maximum","180");await click("Review Joint edit");await waitFor(()=>!!assemblyPreview());check(cadDocument.assembly!.joints.bearing.axis[2]===1,"Frame edit Preview leaves document unchanged");
 await click("Cancel Joint preview");check(close(matrices(),world)&&cadDocument.assembly!.joints.bearing.axis[2]===1,"Frame edit Cancel preserves original state");
 await click("Review Joint edit");await apply();check(cadDocument.assembly!.joints.bearing.axis[1]===1&&close(matrices(),world),"Native axis/origin/limit edit preserves World Pose");
 const gizmoShot=await(await input({type:"screenshot"})).json();(globalThis as any).cadTestArtifacts["assembly-joint-gizmo.png"]=gizmoShot.data;
 await selectPart("New Joint parent","stand-shaft");await click("Review Joint reparent");await apply();check(cadDocument.assembly!.joints.bearing.parentId==="stand-shaft"&&close(matrices(),world),"Native Reparent preserves complete subtree World Pose");
 await selectPart("New Joint parent","stand-lip");await click("Review Joint reparent");await waitFor(()=>[...document.querySelectorAll('[role="status"]')].some(e=>e.textContent?.includes("cycle")));check(cadDocument.assembly!.joints.bearing.parentId==="stand-shaft"&&close(matrices(),world),"Cyclic reparent cannot publish");
 await click("Review Joint delete");await waitFor(()=>!!assemblyPreview());check(!!cadDocument.assembly!.joints.bearing,"Delete Preview retains live Joint");await apply();
 check(!cadDocument.assembly!.joints.bearing&&!!cadDocument.assembly!.joints.support&&close(matrices(),world),"Native Delete detaches only parent edge; descendants/world poses retained");
 await waitFor(()=>selectedAssemblyJoint()===null);check(true,"Deleting selected Joint clears gizmo selection");
 await click("Assembly Undo");await waitFor(()=>!!cadDocument.assembly!.joints.bearing);check(close(matrices(),world),"Lifecycle Undo restores Joint and world pose");
 await click("Assembly Redo");await waitFor(()=>!cadDocument.assembly!.joints.bearing);check(close(matrices(),world),"Lifecycle Redo restores independent root policy");
 const saved=serializeDocument(cadDocument);await openDocumentFile(new File([saved],"assembly-lifecycle.webcad.json",{type:"application/json"}));check(!cadDocument.assembly!.joints.bearing&&!!cadDocument.assembly!.joints.support&&close(matrices(),world),"Lifecycle reload retains detached root and downstream rest frames");check(JSON.stringify(cadDocument.features)===geometry,"Lifecycle keeps all original BRep/Mesh geometry");
 }


 if(document.documentElement.dataset.assemblyMotion==="true"){
 const box=await dispatchCadCommand({type:"create-primitive",id:"motion-obstacle",primitive:"box",params:{width:10,depth:10,height:2},position:[-115,-5,127]});if(!box.ok)throw Error(box.reason);
 const ground=await dispatchCadCommand({type:"assembly-ground",objectId:"motion-obstacle",grounded:true});if(!ground.ok)throw Error(ground.reason);
 const baseline=serializeDocument(cadDocument),history=cadHistory.getPastLabels().length;
 const summary=[...document.querySelectorAll("summary")].find(s=>s.textContent==="Motion Inspection")!;await physical(summary);
 await text("Motion parts","stand-plate,motion-obstacle");await text("Motion start","0");await text("Motion end","180");await text("Motion step","90");
 await click("Inspect Motion");await waitFor(()=>!!document.querySelector('[aria-label="Motion inspection results"]'));
 const rows=()=>[...document.querySelectorAll<HTMLElement>("[data-motion-status]")].sort((a,b)=>Number(a.dataset.motionAngle)-Number(b.dataset.motionAngle));check(rows().length===3&&rows().map(r=>r.dataset.motionStatus).join(",")==="penetration,no-penetration,penetration","Native sweep detects obstruction at0/180 and clears tested90");
 check(Math.abs(Number(rows()[0].dataset.motionVolume)-200)<1e-5,"Actual OCCT Common volume is200mm3");
 check(serializeDocument(cadDocument)===baseline&&cadHistory.getPastLabels().length===history,"Inspection leaves complete document, Joint angles and history unchanged");
 await click("Preview motion result 2");await waitFor(()=>!!assemblyPreview());check(assemblyPreview()!.highlightIds?.includes("motion-obstacle")&&assemblyPreview()!.joint?.angle===180&&cadDocument.assembly!.joints.bearing.angle===0,"Collision preview poses/highlights are detached from live Joint angle");
 const image=await(await input({type:"screenshot"})).json();(globalThis as any).cadTestArtifacts["assembly-motion-180.png"]=image.data;await click("Clear Motion preview");check(!assemblyPreview()&&serializeDocument(cadDocument)===baseline,"Clear inspection preview restores unchanged authoring state");
 const req={jointId:"bearing",start:0,end:180,step:90,partIds:["stand-plate","motion-obstacle"],exceptions:[],tolerance:1e-6};
 const session=createCadToolSession({document:cadDocument,selectionIds:[],layerId:"layer-default",workPlane:"XY"}),reply=await session.read({id:"inspect",name:"assembly.motion.inspect",arguments:{optionsJson:JSON.stringify(req)}});
 check(reply.ok&&(reply.result as any).rows.map((r:any)=>r.baseStatus).join(",")===rows().map(r=>r.dataset.motionStatus).join(","),"Read-only MCP and native UI classify identical samples");
 await text("Motion exceptions JSON",'[["stand-plate","motion-obstacle"]]');await click("Inspect Motion");await waitFor(()=>rows().length===3);check(rows().every(r=>r.textContent?.includes("intentional-exception"))&&rows()[0].dataset.motionStatus==="penetration","Explicit exceptions retain raw penetration rather than skipping computation");

 if(document.documentElement.dataset.interferenceTriage==="true"){
 await text("Motion exceptions JSON","[]");await text("Motion parts","stand-support,stand-plate,motion-obstacle,stand-base,stand-shaft");await click("Inspect Motion");await waitFor(()=>!!document.querySelector('[aria-label="Motion inspection results"]'));
 const domRows=()=>[...document.querySelectorAll<HTMLElement>("[data-triage-category]")],order=["motion-dependent-penetration","invariant-penetration","contact","no-penetration","unverified"],rawRows=()=>JSON.stringify(domRows().map(r=>[r.dataset.motionAngle,r.dataset.motionStatus,r.dataset.motionVolume,r.dataset.triageCategory]));
 const sorted=domRows().map(r=>order.indexOf(r.dataset.triageCategory!));check(sorted.every((n,i)=>i===0||n>=sorted[i-1]),"Triage orders motion-dependent penetration before invariant penetration and contact");
 const support=()=>domRows().find(r=>r.textContent?.includes("stand-support / stand-plate")&&r.dataset.motionStatus==="penetration")!;
 check(support().dataset.triageCategory==="invariant-penetration"&&support().textContent?.includes("구조적으로 불변"),"Fixed support/plate overlap gets a structural invariant explanation");
 const raw=rawRows(),sig=motionSourceSignature(cadDocument),before=serializeDocument(cadDocument);await physical(support().querySelector("button")!);await choose("Pair design intent",1);await text("Pair explanation","Designed mounting insertion");
 await click("Review pair intent");await waitFor(()=>!![...document.querySelectorAll("button")].find(b=>b.textContent==="Apply pair intent"));check(serializeDocument(cadDocument)===before,"Intent Preview is metadata-only and does not publish");
 await click("Cancel pair intent");check(!cadDocument.interferenceIntents&&rawRows()===raw,"Intent Cancel keeps raw measurements unchanged");
 await click("Review pair intent");await waitFor(()=>!![...document.querySelectorAll("button")].find(b=>b.textContent==="Apply pair intent"));await click("Apply pair intent");const key=interferencePairKey(["stand-support","stand-plate"]);await waitFor(()=>cadDocument.interferenceIntents?.[key]?.intent==="intentional-overlap");
 check(!!document.querySelector('[aria-label="Motion inspection results"]')&&rawRows()===raw&&motionSourceSignature(cadDocument)===sig,"Intent Apply retains cached BRep rows and entire geometry without inspection rerun");
 check(support().textContent?.includes("intentional-overlap")&&support().textContent?.includes("원래 기하 판정과 Common 체적은 유지"),"Intentional overlap is a user annotation, not a suppressed geometric penetration");
 const annotated=serializeDocument(cadDocument);check(JSON.parse(annotated).version===63,"Intent uses explicit v63 serialization");
 const picture=await(await input({type:"screenshot"})).json();(globalThis as any).cadTestArtifacts["interference-triage.png"]=picture.data;
 await click("Review remove intent");await waitFor(()=>!![...document.querySelectorAll("button")].find(b=>b.textContent==="Apply pair intent"));await click("Apply pair intent");await waitFor(()=>!cadDocument.interferenceIntents);
 check(rawRows()===raw&&motionSourceSignature(cadDocument)===sig&&JSON.parse(serializeDocument(cadDocument)).version===62,"Removing final intent leaves measurements intact and retains v62 compatibility");
 await openDocumentFile(new File([annotated],"annotated-laptop.webcad.json",{type:"application/json"}));check(cadDocument.interferenceIntents?.[key]?.note==="Designed mounting insertion"&&motionSourceSignature(cadDocument)===sig,"v63 native reload preserves intent and original geometry");
 }

 const cancel=new AbortController(),beforeCancelled=projectKernelMetrics().cancelledTasks,op={params:{kind:"box",width:10,depth:10,height:10}};
 const pending=measureSolidDistance(op,op,1e-6,{signal:cancel.signal});cancel.abort();let rejected=false;try{await pending;}catch{rejected=true;}check(rejected&&projectKernelMetrics().cancelledTasks>beforeCancelled,"Real BRep Worker request cancellation rejects without document changes");
 const change=await dispatchCadCommand({type:"rename-object",objectId:"motion-obstacle",name:"Obstacle renamed"});if(!change.ok)throw Error(change.reason);
 await waitFor(()=>!document.querySelector('[aria-label="Motion inspection results"]'));check(!assemblyPreview(),"Document generation change discards inspection results and preview");
 (globalThis as any).cadTestMetrics={motion:reply.result,phaseA:metrics};
 }

 if(document.documentElement.dataset.assemblyDrive==="true"){
  const box=await dispatchCadCommand({type:"create-primitive",id:"motion-obstacle",primitive:"box",params:{width:10,depth:10,height:2},position:[-115,-5,127]});if(!box.ok)throw Error(box.reason);
  const ground=await dispatchCadCommand({type:"assembly-ground",objectId:"motion-obstacle",grounded:true});if(!ground.ok)throw Error(ground.reason);
  const baseline=serializeDocument(cadDocument),history=cadHistory.getPastLabels().length,status=()=>document.querySelector<HTMLElement>('[aria-label="Joint drive status"]')!;
  const stillBaseline=(label:string)=>check(serializeDocument(cadDocument)===baseline&&cadHistory.getPastLabels().length===history&&cadDocument.assembly!.joints.bearing.angle===0,label);
  const pose=(id:string)=>assemblyMatrix(assemblyPreview()!.poses[id]).elements;
  await physical([...document.querySelectorAll("summary")].find(s=>s.textContent==="Motion Inspection")!);
  await text("Motion parts","stand-plate,motion-obstacle");await text("Motion start","0");await text("Motion end","180");await text("Motion step","90");
  await click("Inspect Motion");await waitFor(()=>!!document.querySelector('[aria-label="Motion inspection results"]'));
  await physical([...document.querySelectorAll("summary")].find(s=>s.textContent==="Joint Drive")!);
  await waitFor(()=>(document.querySelector('[aria-label="Drive Joint"]') as HTMLSelectElement)?.value==="bearing");
  await text("Joint drive range end","180");await text("Joint drive speed","360");
  // Play: preview only, followers move, document/history untouched.
  await click("Play Joint drive");await waitFor(()=>!!assemblyPreview()&&Number(status().dataset.angle)>0);
  check(status().dataset.playing==="true"&&assemblyPreview()!.joint?.id==="bearing","Play starts a Joint preview animation");
  stillBaseline("Playback never edits the document, Joint angle or Undo history");
  await click("Pause Joint drive");const paused=status().dataset.angle;await new Promise(r=>setTimeout(r,300));
  check(status().dataset.playing==="false"&&status().dataset.angle===paused&&!!assemblyPreview(),"Pause freezes the pose and keeps the preview");
  // Slider/number: followers (whole upper tree) rotate with the driver.
  await text("Joint drive angle","90");await waitFor(()=>assemblyPreview()?.joint?.angle===90);
  const expected=new THREE.Matrix4().makeRotationZ(Math.PI/2).multiply(assemblyMatrix(initial["stand-plate"].transform!)).elements,actual=pose("stand-plate");
  check(expected.every((v,i)=>Math.abs(v-actual[i])<1e-6),"Numeric drive rotates downstream Joint children together");
  check(document.querySelector('[aria-label="Joint drive followers"]')!.textContent!.includes("stand-plate"),"Panel lists parts that move with the driver");
  stillBaseline("Scrubbing leaves the live document unchanged");
  // Non-repeat playback runs min to max and stops by itself.
  await physical(document.querySelector('[aria-label="Joint drive repeat"]')!);await click("Play Joint drive");
  await waitFor(()=>status().dataset.playing==="false"&&Number(status().dataset.angle)===180);check(true,"Playback without repeat stops at the range end");
  // Interference sampled by Motion Inspection is highlighted at that angle.
  await click("Jump to interference 180");await waitFor(()=>!!document.querySelector('[aria-label="Joint drive interference"]'));
  check(assemblyPreview()!.highlightIds?.includes("motion-obstacle"),"Sampled interference highlights the offending parts");
  const shot=await(await input({type:"screenshot"})).json();(globalThis as any).cadTestArtifacts["assembly-drive-interference.png"]=shot.data;
  await click("Stop Joint drive");check(!assemblyPreview(),"Stop clears the preview");stillBaseline("Stop restores the authoring state exactly");
  // Commit is the only write: one Undo step, persisted through save and reopen.
  await text("Joint drive angle","180");await click("Commit drive angle");await waitFor(()=>cadDocument.assembly!.joints.bearing.angle===180);
  check(cadHistory.getPastLabels().length===history+1&&!assemblyPreview(),"Commit records a single Undo step and clears the preview");
  await click("Assembly Undo");await waitFor(()=>cadDocument.assembly!.joints.bearing.angle===0);await click("Assembly Redo");await waitFor(()=>cadDocument.assembly!.joints.bearing.angle===180);
  await openDocumentFile(new File([serializeDocument(cadDocument)],"assembly-drive.webcad.json",{type:"application/json"}));
  check(cadDocument.assembly!.joints.bearing.angle===180&&!assemblyPreview(),"Reopened file keeps only the committed angle, no preview");
 }

 if(document.documentElement.dataset.assemblyMotion!=="true")(globalThis as any).cadTestMetrics=metrics;output.textContent=checks.join(String.fromCharCode(10))+String.fromCharCode(10)+"ALL "+checks.length+" CHECKS PASSED";
 }catch(e){output.textContent=checks.join(String.fromCharCode(10))+String.fromCharCode(10)+"FAIL: "+String(e instanceof Error?e.stack:e);}};
installBrowserChecks(button,output);
