import test from "node:test";
import assert from "node:assert/strict";
import type {SectionDrawing} from "../src/precision/modelSection";
import {sectionHatch} from "../src/precision/sectionHatch";
import {ambiguousSectionBoundary} from "../src/precision/sectionBoundary";
import {sectionDrawingGeometry} from "../src/precision/modelSection";
import {splinePoint} from "../src/precision/splineGeometry";
import type {CadSpline} from "@agent-webcad/cad-document";
const line=(id:string,a:number[],b:number[]):SectionDrawing=>({kind:"line",sourceKey:id,partId:"part",params:{points:[a,b]}});
const ellipse=(id:string,rx=10,ry=6,patch:Record<string,unknown>={}):SectionDrawing=>({kind:"ellipse",sourceKey:id,partId:"part",params:{center:[0,0,0],axisU:[rx,0,0],axisV:[0,ry,0],startParam:0,sweep:Math.PI*2,...patch}});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<2e-7,`${a} != ${b}`);
const hatch=(curves:SectionDrawing[],angle=0,spacing=1)=>{const before=JSON.stringify(curves),h=sectionHatch(curves,[0,0],spacing,angle);assert.deepEqual(h.warnings,[]);assert.ok(h.lines.length);assert.equal(JSON.stringify(curves),before);return h.lines;};
const closedSpline=(domainScale=1):SectionDrawing=>({kind:"spline",sourceKey:"square",partId:"part",params:{degree:1,controlPoints:[[-10,-10,0],[10,-10,0],[10,10,0],[-10,10,0],[-10,-10,0]],weights:[1,3,.5,2,1],knots:[0,0,1,2,3,4,4].map(v=>v*domainScale),domain:[0,4*domainScale]}});

test("ellipse outer and hole rows match independent analytic roots without changing exact axes",()=>{
 const curves=[ellipse("outer"),ellipse("hole",4,2)],rows=hatch(curves);
 for(const row of rows){const [a,b]=row.points,y=a[1],outer=10*Math.sqrt(1-y*y/36);near(Math.max(Math.abs(a[0]),Math.abs(b[0])),outer);if(Math.abs(y)<2){const inner=4*Math.sqrt(1-y*y/4);assert.ok(b[0]<=-inner+2e-7||a[0]>=inner-2e-7);}}
 assert.deepEqual(rows.filter(r=>r.points[0][1]===0).map(r=>r.points.map(p=>Math.round(p[0]))),[[-10,-4],[4,10]]);
 assert.equal(ambiguousSectionBoundary(curves),false);
});
test("conjugate axes, reversed sweep and seam shifts retain material under arbitrary hatch angle",()=>{
 const e=ellipse("skew",10,6,{axisU:[10,3,0],axisV:[2,6,0],startParam:1.234,sweep:-2*Math.PI}),rows=hatch([e],37,.7),det=54;
 for(const r of rows)for(const p of r.points){const u=(6*p[0]-2*p[1])/det,v=(-3*p[0]+10*p[1])/det;near(u*u+v*v,1);}
 const equivalent=ellipse("other",10,6,{axisU:[10,3,0],axisV:[2,6,0],startParam:1.234,sweep:2*Math.PI});const other=hatch([equivalent],37,.7);assert.equal(rows.length,other.length);for(let i=0;i<rows.length;i++)for(let j=0;j<2;j++)for(let k=0;k<2;k++)near(rows[i].points[j][k],other[i].points[j][k]);
});
test("finite elliptic arc and its diameter form a real closed boundary, not a full ellipse",()=>{
 const arc={...ellipse("arc"),kind:"elliptic-arc" as const,params:{...ellipse("arc").params,sweep:Math.PI}},rows=hatch([arc,line("diameter",[-10,0],[10,0])]);assert.ok(rows.every(r=>r.points[0][1]>=0));
 const open=sectionHatch([arc],[0,0],1,0);assert.equal(open.lines.length,0);assert.match(open.warnings.join(),/open/);
});
test("cubic spline/line closure uses polynomial roots and keeps a nested circular hole empty",()=>{
 const spline:SectionDrawing={kind:"spline",sourceKey:"arch",partId:"part",params:{degree:3,controlPoints:[[-10,0,0],[-10,10,0],[10,10,0],[10,0,0]],knots:[0,0,0,0,1,1,1,1],domain:[0,1]}},hole:SectionDrawing={kind:"circle",sourceKey:"hole",partId:"part",params:{center:[0,3,0],radius:1.25}},rows=hatch([spline,line("bottom",[10,0],[-10,0]),hole]);
 for(const r of rows){const y=r.points[0][1],t=(1-Math.sqrt(1-4*y/30))/2,x=-10+60*t*t-40*t*t*t;near(Math.max(...r.points.map(p=>Math.abs(p[0]))),Math.abs(x));if(Math.abs(y-3)<1.25){const v=Math.sqrt(1.25**2-(y-3)**2);assert.ok(r.points[1][0]<=-v+2e-7||r.points[0][0]>=v-2e-7);}}
});
test("positive rational weights and a very short parameter domain do not change square geometry",()=>{
 const a=hatch([closedSpline()]),b=hatch([closedSpline(1e-12)]);assert.equal(a.length,b.length);for(let i=0;i<a.length;i++){near(a[i].points[0][0],-10);near(a[i].points[1][0],10);assert.deepEqual(a[i].points,b[i].points);}
});
test("rational quadratic full circle spline agrees with independent circle intersections",()=>{
 const w=Math.SQRT1_2,s:SectionDrawing={kind:"spline",sourceKey:"rational-circle",partId:"part",params:{degree:2,controlPoints:[[10,0,0],[10,10,0],[0,10,0],[-10,10,0],[-10,0,0],[-10,-10,0],[0,-10,0],[10,-10,0],[10,0,0]],weights:[1,w,1,w,1,w,1,w,1],knots:[0,0,0,1,1,2,2,3,3,4,4,4],domain:[0,4]}};
 for(const row of hatch([s],0,1))for(const p of row.points)near(p[0]*p[0]+p[1]*p[1],100);
});
test("trimmed spline domain closes only its retained interval and exact endpoint chord",()=>{
 const s:CadSpline={degree:3,controlPoints:[[-10,0,0],[-10,10,0],[10,10,0],[10,0,0]],knots:[0,0,0,0,1,1,1,1],domain:[.2,.8]},a=splinePoint(s,.2),b=splinePoint(s,.8);
 const rows=hatch([{kind:"spline",sourceKey:"trim",partId:"part",params:{...s}},line("chord",b,a)],0,.5);
 assert.ok(rows.every(r=>r.points.every(p=>p[1]>=4.8-1e-7&&Math.abs(p[0])<=Math.abs(a[0])+1e-7)));
});
test("multiple disjoint rings, tangency rows and ambiguous tiny/precision boundaries stay bounded",()=>{
 const island=hatch([ellipse("outer"),ellipse("hole",4,2),ellipse("island",2,1)]);assert.deepEqual(island.filter(r=>r.points[0][1]===0).map(r=>r.points.map(p=>Math.round(p[0]))),[[-10,-4],[-2,2],[4,10]]);
 const curves=[ellipse("left",4,2,{center:[-10,0,0]}),ellipse("right",4,2,{center:[10,0,0]})],rows=hatch(curves);
 assert.deepEqual(rows.filter(r=>r.points[0][1]===0).map(r=>r.points.map(p=>Math.round(p[0]))),[[-14,-6],[6,14]]);
 const tiny={...closedSpline(),params:{...closedSpline().params,controlPoints:(closedSpline().params.controlPoints as number[][]).map(p=>p.map(v=>v*1e-10))}},tooLarge=ellipse("large",10,6,{center:[1e8,0,0]});
 for(const g of [tiny,tooLarge]){const h=sectionHatch([g],[0,0],1,0);assert.equal(h.lines.length,0);assert.ok(h.warnings.length);}
});
test("touching, crossing, coincident and self-crossing curve boundaries fail closed",()=>{
 const bow={...closedSpline(),params:{...closedSpline().params,controlPoints:[[-10,-10,0],[10,10,0],[-10,10,0],[10,-10,0],[-10,-10,0]]}};
 const cubicLoop:SectionDrawing={kind:"spline",sourceKey:"loop",partId:"part",params:{degree:3,controlPoints:[[0,0,0],[3,3,0],[-3,3,0],[1,0,0]],knots:[0,0,0,0,1,1,1,1],domain:[0,1]}};
 for(const curves of [[cubicLoop,line("loop-close",[1,0],[0,0])],[ellipse("interior-tangent",10,6,{startParam:1.2}),ellipse("inside-touch",4,2,{center:[0,4,0],startParam:.7})],[ellipse("a"),ellipse("touch",4,2,{center:[6,0,0]})],[ellipse("a"),ellipse("cross",8,4,{center:[8,0,0]})],[ellipse("a"),ellipse("duplicate")],[bow],[ellipse("a"),line("cross",[-20,0],[20,0])]]){const h=sectionHatch(curves,[0,0],1,0);assert.equal(h.lines.length,0);assert.ok(h.warnings.length);assert.equal(ambiguousSectionBoundary(curves),true);}
});
test("invalid and sub-resolution inputs diagnose rather than repairing the source; valid parts remain",()=>{
 const bad={...closedSpline(),params:{...closedSpline().params,weights:[0,1,1,1,1]}},curves=[bad,{...ellipse("good"),partId:"good"}],h=sectionHatch(curves,[0,0],1,0);assert.ok(h.lines.length);assert.ok(h.lines.every(r=>r.partId==="good"));assert.match(h.warnings.join(),/invalid spline/);
 const excessive=sectionHatch(Array.from({length:300},()=>closedSpline()),[0,0],1,0);assert.equal(excessive.lines.length,0);assert.match(excessive.warnings.join(),/1,024 Bezier/);
 assert.throws(()=>sectionHatch([ellipse("a")],[0,0],0,0),/Invalid/);assert.throws(()=>sectionHatch([ellipse("a")],[0,0],.00001,0),/4,000/);
});
test("exact concentric conics receive stable distinct cut IDs while coincident copies reject",()=>{
 const view={id:"v",name:"V",basis:"XY" as const,height:0,partIds:["p"],origin:[0,0] as [number,number],scale:1,layerId:"layer-default",outputs:{},status:"resolved" as const};
 const curves=[ellipse("outer"),ellipse("hole",4,2)].map(g=>({kind:"ellipse" as const,...g.params})) as Parameters<typeof sectionDrawingGeometry>[2];
 const a=sectionDrawingGeometry(view,"p",curves),b=sectionDrawingGeometry(view,"p",[...curves].reverse());assert.equal(new Set(a.map(g=>g.sourceKey)).size,2);assert.deepEqual(a,b);assert.throws(()=>sectionDrawingGeometry(view,"p",[curves[0],curves[0]]),/coincident/);
});
