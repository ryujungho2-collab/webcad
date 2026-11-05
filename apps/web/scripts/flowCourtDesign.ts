import type {CadCommand} from "@agent-webcad/cad-commands";
import {GALLERY_SYMBOLS,gallerySymbolCommands} from "../src/library/gallerySymbols";
import {fitSpline} from "../src/precision/fitSpline";
import {sampleSpline} from "../src/precision/splineGeometry";
import {FLOW_ANCHORS,FLOW_ATRIUM,FLOW_STAIRS,flowOutline,flowBoundary,flowInnerBoundary,flowAreas,atriumOpenings,flowFloorOpenings,flowExtents,inside,bridge,bridgeNormal,roofHeight,type P} from "./flowCourtGeometry";
import {stairLayout} from "../src/precision/stairLayout";
type Flat=Exclude<CadCommand,{type:"batch"}>;
export type FlowPlacement={id:string;symbol:string;floor:number;x:number;y:number;angle:number;seats:number};
export function flowCourtDesign(){
 const commands:Flat[]=[],frames:{id:string;name:string;ids:string[];origin:P;size:P;scale:number}[]=[],sheets:{id:string;name:string;frames:string[];size:P}[]=[],placements:FlowPlacement[]=[];
 const colors:Record<string,string>={walls:"#293c36",furniture:"#625744",green:"#738a74",notes:"#263d37",guides:"#9bafa9",roof:"#697b75",rcp:"#ab8657",assets:"#625744",sections:"#31463d",detail:"#31463d"};
 for(const [role,color]of Object.entries(colors))commands.push({type:"create-layer",id:`flow-${role}`,name:`FLOW / ${role}`},{type:"set-layer-style",layerId:`flow-${role}`,style:{color,lineWeight:role==="walls"?.35:.18,lineType:"continuous"}});
 commands.push(...gallerySymbolCommands("flow-assets") as Flat[]);
 let active:string[]=[],role="notes",ox=0,oy=0,n=0,floor=0;
 const add=(c:Flat)=>{commands.push(c);if("id"in c&&typeof c.id==="string")active.push(c.id);};
 const style=(fill?:string,w=.18,stroke=colors[role])=>({stroke,fill:fill??null,strokeWidth:w,opacity:1,fillGradient:null});
 const poly=(p:P[],closed=false,fill?:string,id=`flow-line-${++n}`,w=.18)=>{add({type:"create-drawing",id,drawing:"polyline",layerId:`flow-${role}`,params:{workPlane:"XY",points:p.map(([x,y])=>[x+ox,y+oy,0]),closed,vectorStyle:style(fill,w)}});return id;};
 const rect=(x:number,y:number,w:number,h:number,fill?:string,id?:string)=>poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],true,fill,id);
 const line=(a:P,b:P,w=.18)=>poly([a,b],false,undefined,undefined,w);
 const circle=(x:number,y:number,r:number,fill?:string)=>{add({type:"create-drawing",id:`flow-circle-${++n}`,drawing:"circle",layerId:`flow-${role}`,params:{workPlane:"XY",center:[x+ox,y+oy,0],radius:r,vectorStyle:style(fill)}});};
 const text=(value:string,x:number,y:number,h=140)=>{add({type:"create-drafting",id:`flow-text-${++n}`,layerId:`flow-${role}`,params:{kind:"text",workPlane:"XY",text:value,point:[x+ox,y+oy,0],height:h>50?h*1.2:h}});};
 const spline=(p:P[],closed=false,fill?:string,id=`flow-curve-${++n}`,strength=.9)=>{const s=fitSpline(p.map(([x,y])=>[x+ox,y+oy,0]),closed,strength);add({type:"create-drawing",id,drawing:"spline",layerId:`flow-${role}`,params:{...s,workPlane:"XY",vectorStyle:style(fill)}});return id;};
 const block=(symbol:string,x:number,y:number,angle=0,record=true)=>{const id=`flow-block-${++n}`;add({type:"insert-block",id,blockId:`gallery-${symbol}`,layerId:`flow-${role}`,position:[x+ox,y+oy,0],angle});if(floor&&record)placements.push({id,symbol,x,y,floor,angle,seats:GALLERY_SYMBOLS.find(s=>s.id===symbol)?.seats??0});return id;};
 const arrow=(a:P,b:P)=>{line(a,b);const r=Math.atan2(b[1]-a[1],b[0]-a[0]);line(b,[b[0]-160*Math.cos(r-.4),b[1]-160*Math.sin(r-.4)]);line(b,[b[0]-160*Math.cos(r+.4),b[1]-160*Math.sin(r+.4)]);};
 const dim=(id:string,a:P,b:P,offset:number,orientation:"horizontal"|"vertical"|"aligned"="horizontal")=>{add({type:"create-dimension",id,layerId:"flow-notes",dimension:"linear",params:{workPlane:"XY",points:[[a[0]+ox,a[1]+oy],[b[0]+ox,b[1]+oy]],offset,orientation,symbolScale:ox>=210000&&ox<230000?15:50,style:{precision:0,lengthUnit:"mm"}}});};
 const frame=(id:string,name:string,ids:string[],origin:P,size:P,scale:number)=>{frames.push({id,name,ids:[...new Set(ids)],origin,size,scale});return id;};
 const page=(id:string,name:string,fs:string[],size:P=[594,420])=>sheets.push({id,name,frames:fs,size});
 const columnPoints:P[]=[[7500,5000],[17400,6000],[9000,11300],[18000,11900],[20700,12400],[9000,16500]];
 const floorPlans:string[][]=[],rcps:string[][]=[],structure:string[][]=[];
 const stairs=FLOW_STAIRS;
 const wall=(x:number,y:number,w:number,h:number)=>rect(x,y,w,h,"#bac4ba");
 const door=(x:number,y:number,w:number,angle=0,clockwise=false)=>{const a=angle*Math.PI/180,b=a+(clockwise?-1:1)*Math.PI/2;line([x,y],[x+w*Math.cos(b),y+w*Math.sin(b)]);add({type:"create-drawing",id:`flow-door-${++n}`,layerId:`flow-${role}`,drawing:"arc",params:{workPlane:"XY",center:[x+ox,y+oy,0],radius:w,startAngle:Math.min(a,b),endAngle:Math.max(a,b)}});};
 for(let level=1;level<=2;level++){
  floor=level;ox=(level-1)*34000;oy=0;active=[];role="walls";
  const outer=flowBoundary(level),inner=flowInnerBoundary(level);
  poly(outer.map(p=>[p[0],p[1]]),true,"#bcc6bc",`flow-${level}-wall-band`);poly(inner.map(p=>[p[0],p[1]]),true,"#f5f2e9",`flow-${level}-inside`);
  const s=flowOutline(level);add({type:"create-drawing",id:`flow-${level}-outline`,drawing:"spline",layerId:"flow-walls",params:{...s,controlPoints:s.controlPoints.map(p=>[p[0]+ox,p[1],0]),workPlane:"XY",vectorStyle:style(undefined,.4)}});
  if(level===2){role="green";poly([[18600,4400],[21100,5100],[22600,6400],[23000,7000],[21000,5900],[18500,5200]],true,"#dce2d4","flow-terrace");role="walls";spline([[18500,5200],[21000,5900],[23000,7000]],false);role="notes";text("OPEN TERRACE",19700,4200,135);role="walls";}
  for(const hole of atriumOpenings(level))poly(hole,true,"#e1e9e1",`flow-${level}-void-${++n}`);
  add({type:"create-drawing",id:`flow-${level}-atrium`,drawing:"ellipse",layerId:"flow-green",params:{...FLOW_ATRIUM,center:[FLOW_ATRIUM.center[0]+ox,8000,0],workPlane:"XY",vectorStyle:style(undefined,.2)}});
  if(level===2){role="walls";for(const sign of [-1,1])line(bridge.a.map((v,i)=>v+bridgeNormal[i]*750*sign) as P,bridge.b.map((v,i)=>v+bridgeNormal[i]*750*sign) as P,.3);role="notes";text("브리지 1500 / GL +4200",10700,8000,105);}
  role="green";for(const [x,y,r]of [[11000,7800,550],[12500,8800,650],[13000,7400,450],[11100,9000,350]]){circle(x,y,r,"#a8bea6");circle(x,y,r*.75);}
  if(level===2){role="walls";poly([[bridge.a[0]+bridgeNormal[0]*750,bridge.a[1]+bridgeNormal[1]*750],[bridge.b[0]+bridgeNormal[0]*750,bridge.b[1]+bridgeNormal[1]*750],[bridge.b[0]-bridgeNormal[0]*750,bridge.b[1]-bridgeNormal[1]*750],[bridge.a[0]-bridgeNormal[0]*750,bridge.a[1]-bridgeNormal[1]*750]],true,"#f5f2e9");}
  if(level===2){role="walls";for(const hole of flowFloorOpenings(2).slice(2))poly(hole,true,"#ffffff");}
  role="walls";for(const [x,y]of columnPoints)circle(x,y,230,"#758a7d");
  // Service cores retain the same XY position on both levels.
  for(const [x,y,w,h] of [[8550,13100,150,2900],[10450,13100,150,2900],[10750,13100,150,2900],[12900,13100,150,2900],[8550,15850,4500,150],[8550,13100,450,150],[10000,13100,600,150],[10750,13100,400,150],[12150,13100,900,150]])wall(x,y,w,h);
  wall(13100,13900,150,2100);wall(16950,13900,150,2100);wall(13100,15850,4000,150);
  wall(17400,13200,150,2400);wall(19450,13200,150,2400);wall(17400,15450,2200,150);wall(17400,13200,400,150);wall(19000,13200,600,150);
  for(const st of stairs){const s=stairLayout({rise:4200,risers:28,going:st.going,width:st.width,landing:st.landing});wall(st.x-150,st.y-150,150,s.length+300);wall(st.x+s.width,st.y-150,150,s.length+300);}
  role="notes";door(9000,13250,1000);door(11150,13250,1000);line([17800,13270],[19000,13270]);text("WC-01",8850,15300,115);text("WC-02",11150,15300,115);text("LIFT",17900,14500,130);
  if(level===1){const p=outer.reduce((best,p)=>Math.hypot(p[0]-20200,p[1]-3600)<Math.hypot(best[0]-20200,best[1]-3600)?p:best),i=outer.indexOf(p),q=outer[(i+1)%outer.length],len=Math.hypot(q[0]-p[0],q[1]-p[1]),u:P=[(q[0]-p[0])/len,(q[1]-p[1])/len],v:P=[-u[1],u[0]];poly([[-1200,-400],[1200,-400],[1200,450],[-1200,450]].map(([x,y])=>[p[0]+u[0]*x+v[0]*y,p[1]+u[1]*x+v[1]*y]),true,"#f5f2e9","flow-entry-opening");const a=Math.atan2(u[1],u[0])*180/Math.PI;door(p[0]-u[0]*1100,p[1]-u[1]*1100,1100,a);door(p[0]+u[0]*1100,p[1]+u[1]*1100,1100,a+180,true);text("ENTRY 2200",p[0]-300,p[1]-700,100);}
  for(const st of stairs){const g=stairLayout({rise:4200,risers:28,going:st.going,width:st.width,landing:st.landing});rect(st.x,st.y,g.width,g.length);for(let i=0;i<g.perFlight;i++){line([st.x,st.y+i*st.going],[st.x+st.width,st.y+i*st.going]);line([st.x+st.width+200,st.y+i*st.going],[st.x+g.width,st.y+i*st.going]);}line([st.x+st.width,st.y],[st.x+st.width,st.y+g.run]);line([st.x+st.width+200,st.y],[st.x+st.width+200,st.y+g.run]);arrow([st.x+st.width/2,st.y+(level===1?200:g.run-200)],[st.x+st.width/2,st.y+(level===1?g.run-200:200)]);text(`${st.id.toUpperCase()} / ${level===1?"UP":"DN"} 28R`,st.x+50,st.y+g.run+400,105);}
  block("wc",9400,15200);block("wc",11750,15200);block("basin",10050,14400);block("basin",12450,14400);
  structure.push([...active]);
  role="furniture";
  if(level===1){
   for(const [x,y,a] of [[5900,4300,15],[9700,3300,-10],[14500,3900,20],[23300,9900,0]])block("sculpture",x,y,a);
   for(const [x,y,a] of [[4400,7600,80],[5000,9600,65],[17600,5200,25]])block("showcase",x,y,a);
   for(const [x,y,a] of [[6800,6600,65],[9200,4200,-10],[22500,10400,85]])block("panel",x,y,a);
   block("mediabench",5900,8200,70);block("mediabench",22700,6600,75);
   // A visitor reception island replaces all food service equipment.
   spline([[15100,11900],[16900,11750],[19300,12100],[19400,12800],[17000,12500],[15200,12600]],true,"#d5b895","flow-bar",.65);
   rect(13400,14100,3300,500,"#c1cbbf");rect(13400,15100,3300,600,"#c1cbbf");
   text("INFORMATION / TICKETS",15300,11250,135);text("ART STORE / STAFF",13400,14850,120);
  }else{
   // Curved acoustic screen, exhibition panels and viewing benches form a media gallery.
   spline([[4200,5600],[3700,7700],[4200,10000]],false,undefined,"flow-media-screen",.75);
   for(const [x,y,a] of [[6100,6800,80],[6500,9500,70]])block("mediabench",x,y,a);
   for(const [x,y,a] of [[8500,3900,-10],[12200,3600,-10],[16300,4800,25]])block("interactive",x,y,a);
   for(const [x,y,a] of [[21800,10000,80],[17700,10900,20]])block("showcase",x,y,a);
   block("sculpture",23200,7500);block("panel",20700,5600,50);
   block("workshop6",15100,14000);text("WORKSHOP / 6",13400,15300,115);
   text("MEDIA GALLERY",4000,11500,135);text("TACTILE / INTERACTIVE",10300,2500,130);
  }
  role="green";for(const [x,y,a]of [[4800,10800,0],[22400,11600,0],[16400,3000,0]])block("plant",x,y,a,false);
  role="guides";spline(level===1?[[20200,3600],[18800,5600],[17700,8200],[17800,10300],[18600,11600]]:[[19000,11800],[17100,10800],[14600,9500],[11500,7700],[8300,6100]],false,undefined,`flow-route-${level}`,.75);
  for(const [x,y]of [[6000,2000],[12000,2000],[18000,4000],[24000,10000]]){line([x,y-300],[x,y+300]);circle(x,y,120);}
  role="notes";text(level===1?"01 / DESIGN GALLERY":"02 / MEDIA + LEARNING",1500,18700,300);text("FLOW COURT  /  R1  /  2026.10.22",1500,18100,140);
  for(const [v,x,y]of [["OBJECT GALLERY",2400,5900],["SCULPTURE / DESIGN",8700,2500],[level===1?"LIGHT COURT / OPEN TO SKY":"VOID / BRIDGE",10600,10800],["ARRIVAL",19700,3200],["A",500,8000],["A",25900,8000],["B",12000,500],["B",12000,18500]] as [string,number,number][])text(v,x,y,120);
  line([12000,300],[12000,18200]);line([700,8000],[25700,8000]);
  const extents=flowExtents(level);dim(`flow-${level}-overall-width`,[extents.min[0],500],[extents.max[0],500],-700);dim(`flow-${level}-overall-depth`,[0,extents.min[1]],[0,extents.max[1]],700,"vertical");
  if(level===2){const mid:P=[12250,8100];dim("flow-bridge-width",mid.map((v,i)=>v-bridgeNormal[i]*750) as P,mid.map((v,i)=>v+bridgeNormal[i]*750) as P,450,"aligned");}
  // Side register lies outside the plan; paper-sized text at 1:75.
  const notes=["DESIGN DEVELOPMENT / 상급","FFL "+(level===1?"+0.000":"+4.200"),"28R × 150 / G280 main stair","Courtyard + double-height void","Bridge clear width 1500","Primary circulation target 1800","Facade inner edge: offset300","Steel columns Ø460 / concept","Exhibits: reusable CAD blocks","Setting-out coordinates: S001"];
  notes.forEach((v,i)=>text(v,27800,16700-i*650,145));
  floorPlans.push([...active]);
  // RCP uses the actual seating positions, a flowing light ribbon and the same core.
  const rcp=[...structure[level-1]];active=rcp;role="rcp";
  for(const p of placements.filter(p=>p.floor===level&&["sculpture","showcase","interactive","workshop6"].includes(p.symbol)))block("pendant",p.x,p.y,0,false);
  for(const dy of [-250,250])spline([[17000,4500+dy],[17700,6500+dy],[17300,9000+dy],[15900,11200+dy],[13000,11900+dy],[9800,11600+dy]],false,undefined,undefined,.8);
  for(const x of [8700,11000,14300,18000,20300])block("downlight",x,12900,0,false);
  role="notes";text(`${level}F / REFLECTED CEILING`,1000,18500,220);text("Light ribbon +3.200 / +7.200; exposed perimeter follows roof section",1000,-700,130);rcps.push(rcp);
 }
 floor=0;
 for(let i=0;i<2;i++)page(i===0?"A101":"A102",`${i+1}F plan and circulation`,[frame(`flow-plan-${i+1}`,`${i+1}F plan`,floorPlans[i],[i*34000-1300,-1300],[550,305],75)]);
 page("A201","Ceiling and light ribbons",[0,1].map(i=>frame(`flow-rcp-${i+1}`,`${i+1}F reflected ceiling`,rcps[i],[i*34000-1000,-1300],[270,270],100)));
 // A001: a site/roof plan with the same footprint and a legible landscape apron.
 ox=80000;oy=0;active=[];role="green";
 spline(FLOW_ANCHORS.map(([x,y])=>[12800+(x-12800)*1.14,9000+(y-9000)*1.14] as P),true,"#e4eade");
 const siteGarden=sampleSpline(flowOutline(1),5).map(p=>[p[0],p[1]] as P);role="roof";poly(siteGarden,true,"#e0e1dc");
 spline(FLOW_ANCHORS,true,undefined,"flow-roof-outline");add({type:"create-drawing",id:"flow-roof-oculus",drawing:"ellipse",layerId:"flow-green",params:{...FLOW_ATRIUM,center:[92000,8000,0],workPlane:"XY",vectorStyle:style("#b6c7b4")}});
 for(let i=0;i<9;i++)spline([[2700+i*2250,4500],[4000+i*2050,8000],[5700+i*1770,12500],[7800+i*1350,15900]],false,undefined,undefined,.7);
 add({type:"create-drawing",id:"flow-roof-open-oculus",drawing:"ellipse",layerId:"flow-green",params:{...FLOW_ATRIUM,center:[92000,8000,0],workPlane:"XY",vectorStyle:style("#b6c7b4")}});
 role="green";for(const [x,y,r]of [[-700,11000,550],[2000,16600,700],[23200,17100,750],[26300,11000,500],[25400,2700,650]]){circle(x,y,r,"#b0c3a9");circle(x,y,r*.75);}
 role="guides";spline([[26500,-1500],[22700,1300],[20200,3600]],false);arrow([2500,21000],[2500,23500]);text("N",2380,23900,220);
 role="notes";text("A001 / LANDSCAPE + ROOF",-1500,21800,310);text("Two petals + light court / continuous roof ribs / open oculus",-1500,21000,170);text("ENTRY PLAZA",21800,1300,130);text("ROOF CONTROL +8.800",16000,14500,150);text("OCULUS / OPEN SKY",10500,11100,140);
 const siteIds=[...active];page("A001","Site and roof geometry",[frame("flow-site","Site / roof",siteIds,[77500,-2200],[550,340],100)]);
 // Sections are generated against the same footprint intersections at A-A Y8000 and B-B X12000.
 ox=120000;oy=0;active=[];role="sections";
 const cutIntersections=(level:number,axis:0|1,value:number)=>{const ring=flowBoundary(level),result:number[]=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if((a[axis]<=value&&b[axis]>value)||(b[axis]<=value&&a[axis]>value)){const t=(value-a[axis])/(b[axis]-a[axis]);result.push(a[1-axis]+t*(b[1-axis]-a[1-axis]));}}return result.sort((a,b)=>a-b);};
 for(const [index,axis,value]of [[0,1,8000],[1,0,12000]] as const){const shift=index*14000,extent1=cutIntersections(1,axis,value),extent2=cutIntersections(2,axis,value),width=axis===1?26000:18000;
  rect(extent1[0],shift-250,extent1.at(-1)!-extent1[0],250,"#b4bfb4");
  const holes=flowFloorOpenings(2).flatMap(r=>{const result:number[]=[];for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];if((a[axis]<=value&&b[axis]>value)||(b[axis]<=value&&a[axis]>value)){const t=(value-a[axis])/(b[axis]-a[axis]);result.push(a[1-axis]+t*(b[1-axis]-a[1-axis]));}}return result.sort((a,b)=>a-b);}).sort((a,b)=>a-b);
  let cursor=extent2[0];for(let i=0;i<holes.length;i+=2){if(holes[i]>cursor)rect(cursor,shift+3950,holes[i]-cursor,250,"#b4bfb4");cursor=holes[i+1];}if(cursor<extent2.at(-1)!)rect(cursor,shift+3950,extent2.at(-1)!-cursor,250,"#b4bfb4");
  for(const [i,x]of [extent1[0],extent1.at(-1)!].entries())line([x,shift],[x+(i===0?250:-250),shift+(axis===1?roofHeight(x,value):roofHeight(value,x))],.35);
  let roofProfile:P[]=[];const flushRoof=()=>{if(roofProfile.length>1){poly(roofProfile,false,undefined,undefined,.35);poly(roofProfile.map(([x,y])=>[x,y+300]),false,undefined,undefined,.35);}roofProfile=[];};for(let i=0;i<=320;i++){const u=extent1[0]+(extent1.at(-1)!-extent1[0])*i/320,world:P=axis===1?[u,value]:[value,u];if(inside(world,atriumOpenings(1)[0]))flushRoof();else roofProfile.push([u,shift+roofHeight(...world)]);}flushRoof();
  if(index===0){const st=stairs[0],j=Math.floor((value-st.y)/st.going),g=stairLayout({rise:4200,risers:28,going:st.going,width:st.width,landing:st.landing}),z1=(j+1)*150,z2=2100+(Math.floor((g.run-(value-st.y))/st.going)+1)*150;for(const [x,z]of [[st.x,z1],[st.x+st.width+200,z2]]){rect(x,shift+z-150,st.width,150,"#d5b895");line([x,shift+z],[x,shift+z+1100]);line([x+st.width,shift+z],[x+st.width,shift+z+1100]);}for(const x of holes.slice(0,4).slice(1,3))line([x,shift+4200],[x,shift+5300]);}
  if(index===1)for(const base of [0,4200])for(const u of [13100,15850])rect(u,shift+base,150,3000,"#bac4ba");
  role="notes";text(`${index===0?"A-A / Y8000":"B-B / X12000"} / ${index===0?"LIGHT COURT + BRIDGE":"COURT + SERVICE CORE"}`,0,shift+10000,220);for(const z of [0,4200,8800]){line([-1200,shift+z],[-300,shift+z]);text(`+${(z/1000).toFixed(3)}`,-2600,shift+z-80,150);}text("Section cuts follow plan intersections; roof profile is an authored design datum",0,shift-1100,125);role="sections";
  // Human scale and representative furniture profiles follow the cut height.
  for(const x of index===0?[4000,18000,23000]:[4000,11500,15500]){line([x,shift],[x,shift+1600]);circle(x,shift+1700,90);line([x-150,shift+1000],[x+150,shift+1000]);}
 }
 role="notes";["SHARED DATUM", "1F FFL +0.000", "2F FFL +4.200", "Roof datum near +8.800", "Roof assembly depth300", "Floor slab250 / finish40", "Courtyard: open sky", "A-A passes bridge and void", "B-B passes court and core", "Roof is an authored section", "Envelope cut extents from", "the shared 2D plan footprint"].forEach((s,i)=>text(s,28000,22800-i*650,160));
 const sectionIds=[...active];page("A301","Coordinated sections A-A and B-B",[frame("flow-sections","Sections",sectionIds,[116700,-1500],[550,350],75)]);
 // Two elevations share footprint width, levels and roof control profiles.
 ox=165000;oy=0;active=[];role="sections";
 for(let e=0;e<2;e++){const y=e*14000,w=e===0?26000:18000;const profile:P[]=Array.from({length:161},(_,i)=>{const u=w*i/160;return [u,y+(e===0?roofHeight(u,2000):roofHeight(2000,u))];});poly(profile,false,undefined,undefined,.35);poly(profile.map(([x,z])=>[x,z+300]),false,undefined,undefined,.35);line([0,y],[w,y],.4);line([0,y+4200],[w,y+4200]);line([0,y],[0,y+profile[0][1]-y]);line([w,y],[w,profile.at(-1)![1]]);
  for(let i=0;i<=Math.floor(w/900);i++){const x=i*900;line([x,y],[x,y+3900]);line([x,y+4450],[x,y+6700]);}role="notes";text(e===0?"SOUTH / ARRIVAL FACADE":"WEST / GARDEN FACADE",0,y+10000,240);text("Panel positions: normal stations in plan; projected elevation pitch varies",0,y-1100,125);role="sections";
 }
 role="notes";["FACADE KEY", "F01 / anodized metal roof", "F02 / insulated glazing", "F03 / mineral base", "F04 / oak soffit", "Continuous roof datum", "with variable fascia depth", "Plan stations on S001", "Final panel projection and", "surface development are", "reserved for the 3D stage"].forEach((s,i)=>text(s,28000,22800-i*650,160));
 const elevationIds=[...active];page("A401","South and west facade studies",[frame("flow-elevations","Elevations",elevationIds,[162500,-1500],[550,350],75)]);
 // Enlarged details: construction-facing geometry, explicit interfaces and dimensions.
 ox=210000;oy=0;active=[];role="detail";
 const detailIds:string[][]=[];
 active=[];rect(0,0,3300,1600,"#f2eee4");spline([[0,250],[850,350],[2000,500],[3300,350]],false);spline([[0,550],[850,650],[2000,800],[3300,650]],false);
 for(let x=100;x<=3200;x+=500){rect(x,100,60,800,"#83978a");rect(x+70,360,80,180);line([x+70,450],[x+220,450]);}role="notes";text("01 / CURVED FACADE / PLAN",0,2200,85);text("Glass32 / frame60 / bracket80",0,1900,80);text("Facade cavity300 / plan cut",0,1740,80);text("Stations / tolerance2 mm",0,-300,75);dim("flow-detail-facade",[0,0],[300,0],-300);detailIds.push([...active]);
 ox=216000;role="detail";active=[];rect(0,0,1500,250,"#b4bfb4");rect(0,250,1500,40,"#d5b895");for(const x of [0,1450]){rect(x,290,50,1100,"#83978a");line([x+25,1390],[x+25,1500]);}line([-250,0],[1750,0]);role="notes";text("02 / BRIDGE / CROSS SECTION",-200,2200,85);text("FFL+4200 / slab250 / finish40",-200,1900,80);text("Guard height1100",-200,1740,80);dim("flow-detail-bridge",[0,0],[1500,0],-400);detailIds.push([...active]);
 ox=222000;role="detail";active=[];rect(0,0,900,900,"#d5b895");rect(0,860,900,40,"#f1ece0");rect(60,100,18,760);rect(822,100,18,760);line([60,100],[840,100]);rect(80,0,740,100,"#a0aaa0");role="notes";text("03 / RECEPTION / SECTION",-200,2200,85);text("Top40 / carcass18",-200,1900,80);text("Service void120 / plinth100",-200,1740,80);dim("flow-detail-bar",[0,0],[900,0],-400);detailIds.push([...active]);
 page("D501","Facade, bridge and reception details",detailIds.map((ids,i)=>frame(`flow-detail-${i}`,`Detail ${i+1}`,ids,[210000+i*6000-500,-900],[175,190],25)));
 // Cover is native typography with three diagrams, drawn from the same two level outlines.
 ox=250000;oy=0;active=[];role="notes";
 text("FLOW COURT",8,286,15);text("디자인·미디어 전시관 / ADVANCED 2D STUDY",9,267,5);text("01  CONTINUITY / 02  LIGHT COURT / 03  LAYERED FLOORS",9,250,3.5);
 const areas=flowAreas();const rows=["DDP의 연속적인 건축·지형·동선에서 출발한 독립 설계", "두 층의 공통 중정과 1500mm 브리지 / 서로 다른 외곽과 테라스",`1F ${areas[0].netPlateM2.toFixed(1)} m² / 2F ${areas[1].netPlateM2.toFixed(1)} m² / excluding court, stair and lift openings`,"1F object gallery + information / 2F media gallery + workshop", "FFL 0 / 4200 / roof datum 8800 / 28R x150", "Exact editable splines + bounded polyline wall offsets", "Native CAD blocks / station layout / coordinated section cuts", "R1 / 2026-10-22 / design development, not an approval issue"];
 rows.forEach((v,i)=>text(v,9,232-i*10,3.3));
 for(let d=0;d<3;d++){const cx=92+d*185,cy=85;role="walls";const pts=FLOW_ANCHORS.map(([x,y])=>[cx+(x-13000)/170,cy+(y-9000)/170] as P);spline(pts,true,d===1?"#d8e1d4":"#e8e3d8");const e={...FLOW_ATRIUM,center:[ox+cx+(12000-13000)/170,cy+(8000-9000)/170,0],axisU:FLOW_ATRIUM.axisU.map(v=>v/170),axisV:FLOW_ATRIUM.axisV.map(v=>v/170)};add({type:"create-drawing",id:`flow-cover-court-${d}`,drawing:"ellipse",layerId:"flow-green",params:{...e,workPlane:"XY",vectorStyle:style("#ffffff")}});role="notes";text(["01 / TWO SOFT PETALS","02 / OPEN LIGHT COURT","03 / UPPER BRIDGE"][d],cx-70,18,3.8);if(d===2)line([cx-30,cy-14],[cx+20,cy+16],.8);}
 const coverIds=[...active];page("G001","Design concept and brief",[frame("flow-brief","Project concept",coverIds,[250000,0],[560,310],1)]);
 // Setting-out register: shared native spline anchors + material/area keys, no raster drawing.
 ox=270000;oy=0;active=[];role="notes";text("S001 / CURVE SETTING-OUT",8,218,6);text("Coordinate origin: building local XY / mm / source anchors",8,205,3.2);FLOW_ANCHORS.forEach(([x,y],i)=>text(`P${String(i).padStart(2,"0")}     X ${x.toFixed(0).padStart(6)}     Y ${y.toFixed(0).padStart(6)}`,10,188-i*11,3.5));
 ["FACADE: 96 stations / interval 0.14-0.98","Offsets: 300mm inside / source sampling tolerance2mm","Curve ticks: editable snapshots; regenerate after path edits","Upper outline: local X0.90 / Y0.93 +150/+150","Floor / void / bridge geometry shares the same datum","FINISH: mineral plaster / anodized metal / oak","GLAZING: generic 32mm assembly; product TBC","LIGHT: ribbons +3200 / +7200; positions on A201","Sections A-A:Y8000 / B-B:X12000","Exhibit power / blackout / acoustic design: next study"].forEach((v,i)=>text(v,183,188-i*12,2.8));
 const scheduleIds=[...active];page("S001","Curve coordinates, areas and finish keys",[frame("flow-setting","Setting-out register",scheduleIds,[270000,0],[390,230],1)],[420,297]);
 const seatCounts=[1,2].map(f=>placements.filter(p=>p.floor===f).reduce((n,p)=>n+p.seats,0));
 return {commands,frames,sheets,placements,seatCounts,areas,columnPoints,stairs,floorPlans,rcps};
}
