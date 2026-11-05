import assert from "node:assert/strict";
import {test} from "node:test";
import {largeCafeDesign} from "../scripts/largeCafeDesign";
import {CAFE_SYMBOLS,cafeSymbolCommands} from "../src/library/cafeSymbols";
import {stairLayout} from "../src/precision/stairLayout";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {worldDraftingGeometry} from "../src/precision/draftingGeometry";
import {resetTestDocument} from "./helpers/documentHarness";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
const execute=async(c:Parameters<typeof dispatchCadCommand>[0])=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);};
function bounds(id:string){const feature=Object.values(cadDocument.features).find(f=>f.output===id)!;const points=worldDraftingGeometry(cadDocument,cadDocument.objects[id],feature).lines.flatMap(l=>l.points);return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
const overlap=(a:number[],b:number[])=>Math.min(a[2],b[2])-Math.max(a[0],b[0])>1e-5&&Math.min(a[3],b[3])-Math.max(a[1],b[1])>1e-5;
test("two-flight stair geometry agrees between plan run, landing and 3900mm developed section",()=>{
 const s=stairLayout({rise:3900,risers:26,going:280,width:1400,landing:1400});assert.equal(s.riser,150);assert.equal(s.perFlight,13);assert.equal(s.run,3360);assert.equal(s.length,4760);assert.equal(s.width,3000);assert.equal(s.steps[12].z,1950);assert.equal(s.steps[25].z,3900);
 for(const risers of [0,3,25,102])assert.throws(()=>stairLayout({rise:3900,risers,going:280,width:1400,landing:1400}));
});
test("all twenty original reusable CAD assets have the catalogued physical bounds and survive native serialization",async()=>{
 resetTestDocument();await execute({type:"batch",commands:[{type:"create-layer",id:"assets",name:"Assets"},...cafeSymbolCommands("assets"),...CAFE_SYMBOLS.map((s,i)=>({type:"insert-block" as const,id:`check-${s.id}`,blockId:`cafe-${s.id}`,position:[i*10000,0,0] as [number,number,number],layerId:"assets"}))]});
 for(const s of CAFE_SYMBOLS){const b=bounds(`check-${s.id}`);assert.ok(Math.abs(b[2]-b[0]-s.size[0])<.01,`${s.id} width`);assert.ok(Math.abs(b[3]-b[1]-s.size[1])<.01,`${s.id} depth`);}
 assert.equal(Object.keys(deserializeDocument(serializeDocument(cadDocument)).blocks!).length,20);
});
test("two-floor cafe seating is counted from actual block placements and does not overlap seats, cores or columns",async()=>{
 resetTestDocument();const design=largeCafeDesign();await execute({type:"batch",commands:design.commands.filter(c=>c.type!=="create-dimension")});assert.deepEqual(design.seatCounts,[40,60]);
 for(const floor of [1,2]){const seats=design.placements.filter(p=>p.floor===floor&&p.seats),origin=(floor-1)*22000;
  const cores=[[11200,9000,14800,14800],[200,9500,3300,14800],[3500,11300,8000,14800],[8400,12400,10750,14800]];
  const columns=[3600,11100].flatMap(x=>[3500,11500].map(y=>[x-300,y-300,x+300,y+300]));
  for(const p of seats){const b=bounds(p.id).map((v,i)=>v-(i%2===0?origin:0));assert.ok(b[0]>=200&&b[1]>=200&&b[2]<=14800&&b[3]<=14800,p.id);assert.ok([...cores,...columns].every(c=>!overlap(b,c)),`${floor}F ${p.symbol} core/column`);}
  for(let i=0;i<seats.length;i++)for(let j=i+1;j<seats.length;j++)assert.equal(overlap(bounds(seats[i].id),bounds(seats[j].id)),false,`${floor}F ${seats[i].symbol} / ${seats[j].symbol}`);
 }
 const nearestWindow=design.placements.find(p=>p.floor===2&&p.symbol==="table2"&&p.x===3200)!,stool=design.placements.find(p=>p.floor===2&&p.symbol==="stool")!;
 assert.ok(bounds(nearestWindow.id)[0]-bounds(stool.id)[2]>=1100,"Upper window counter has at least the 1100mm task circulation target");
 const stairApproach=design.placements.find(p=>p.floor===2&&p.symbol==="table4"&&p.y===6880)!;assert.ok(9300-bounds(stairApproach.id)[3]>=1500,"Main stair front approach is clear by the task's 1500mm target");
});
