import type {CadCommand} from "@agent-webcad/cad-commands";
import {CAFE_SYMBOLS,cafeSymbolCommands} from "../src/library/cafeSymbols";
import {stairLayout} from "../src/precision/stairLayout";
type P=[number,number];
type Flat=Exclude<CadCommand,{type:"batch"}>;
export type CafePlacement={id:string;symbol:string;floor:number;x:number;y:number;angle:number;seats:number};
export function largeCafeDesign(){
 const commands:Flat[]=[],placements:CafePlacement[]=[],floorMembers:{walls:string[];furniture:string[];rcp:string[];power:string[];water:string[];finishes:string[];notes:string[]}[]=[],frames:{id:string;name:string;ids:string[];origin:P;size:P;scale:number}[]=[],sheets:{id:string;name:string;frames:string[];size:P}[]=[];
 const colors:Record<string,string>={walls:"#514f48",furniture:"#625a4e",notes:"#45443e",rcp:"#9a6d36",power:"#466279",water:"#4c7c81",finishes:"#b2a286",assets:"#625a4e"};
 for(const role of Object.keys(colors)){commands.push({type:"create-layer",id:`cafe-${role}`,name:`CAFE / ${role}`},{type:"set-layer-style",layerId:`cafe-${role}`,style:{color:colors[role],lineType:"continuous",lineWeight:role==="walls"?.35:.18}});}
 commands.push(...cafeSymbolCommands("cafe-assets") as Flat[]);
 let n=0;let active:string[]=[],role="notes",ox=0,level=0;
 const add=(c:Flat)=>{commands.push(c);if("id" in c&&typeof c.id==="string")active.push(c.id);};
 const style=(fill?:string,weight=.18)=>({stroke:colors[role],fill:fill??null,fillGradient:null,opacity:1,strokeWidth:weight});
 const poly=(points:P[],closed=false,fill?:string,id=`cafe-line-${++n}`,weight=.18)=>{add({type:"create-drawing",id,layerId:`cafe-${role}`,drawing:"polyline",params:{workPlane:"XY",points:points.map(p=>[p[0]+ox,p[1],0]),closed,vectorStyle:style(fill,weight)}});return id;};
 const rect=(x:number,y:number,w:number,h:number,fill?:string,id?:string)=>poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],true,fill,id);
 const line=(a:P,b:P,id?:string)=>poly([a,b],false,undefined,id);
 const circle=(x:number,y:number,r:number)=>{add({type:"create-drawing",id:`cafe-circle-${++n}`,layerId:`cafe-${role}`,drawing:"circle",params:{workPlane:"XY",center:[x+ox,y,0],radius:r,vectorStyle:style()}});};
 const text=(value:string,x:number,y:number,h=125,id=`cafe-text-${++n}`)=>{add({type:"create-drafting",id,layerId:`cafe-${role}`,params:{kind:"text",workPlane:"XY",text:value,point:[x+ox,y,0],height:h}});return id;};
 const block=(symbol:string,x:number,y:number,floor=level,angle=0,id=`cafe-instance-${++n}`)=>{add({type:"insert-block",id,blockId:`cafe-${symbol}`,layerId:`cafe-${role}`,position:[x+ox,y,0],angle});if(floor)placements.push({id,symbol,floor,x,y,angle,seats:CAFE_SYMBOLS.find(s=>s.id===symbol)!.seats});return id;};
 const arrow=(a:P,b:P)=>{line(a,b);const r=Math.atan2(b[1]-a[1],b[0]-a[0]),s=180;line(b,[b[0]-s*Math.cos(r-.45),b[1]-s*Math.sin(r-.45)]);line(b,[b[0]-s*Math.cos(r+.45),b[1]-s*Math.sin(r+.45)]);};
 const door=(x:number,y:number,w:number,inward=false)=>{line([x,y],[x,y+(inward?w:-w)]);add({type:"create-drawing",id:`cafe-door-${++n}`,layerId:`cafe-${role}`,drawing:"arc",params:{workPlane:"XY",center:[x+ox,y,0],radius:w,startAngle:inward?0:-Math.PI/2,endAngle:inward?Math.PI/2:0}});};
 const wall=(x:number,y:number,w:number,h:number)=>rect(x,y,w,h,"#d1cdc2");
 const stair=(x:number,y:number,width:number,going:number,landing:number)=>{
  const s=stairLayout({rise:3900,risers:26,going,width,landing});
  rect(x,y,s.width,s.length);for(let i=0;i<s.perFlight;i++){line([x,y+i*going],[x+width,y+i*going]);line([x+width+200,y+i*going],[x+s.width,y+i*going]);}
  line([x+width,y],[x+width,y+s.run]);line([x+width+200,y],[x+width+200,y+s.run]);
  if(level===2){arrow([x+width/2,y+s.run-200],[x+width/2,y+300]);arrow([x+width*1.5+200,y+300],[x+width*1.5+200,y+s.run-200]);}
  else{arrow([x+width/2,y+300],[x+width/2,y+s.run-200]);arrow([x+width*1.5+200,y+s.run-200],[x+width*1.5+200,y+300]);}
  text(`${level===2?"DN":"UP"} / 26R`,x+100,y+s.run+200,110);return s;
 };
 for(let floor=1;floor<=2;floor++){
  level=floor;
  ox=(floor-1)*22000;const members={walls:[],furniture:[],rcp:[],power:[],water:[],finishes:[],notes:[]} as typeof floorMembers[number];floorMembers.push(members);
  role="walls";active=members.walls;
  if(floor===1){wall(0,0,200,8600);wall(0,9800,200,5200);}else wall(0,0,200,15000);
  wall(14800,0,200,15000);wall(200,14800,14600,200);
  if(floor===1){wall(200,0,12700,200);wall(14700,0,100,200);}else wall(200,0,14600,200);
  // Glazed south/west elevations, fixed column positions and rear service entrance.
  role="notes";line([200,100],[floor===1?12800:14800,100]);line([100,250],[100,8400]);if(floor===1){door(12900,200,900);door(14700,200,900);text("SERVICE",300,8950,110);}
  role="walls";for(const x of [3600,11100])for(const y of [3500,11500])wall(x-300,y-300,600,600);
  wall(11200,9000,150,5800);wall(14650,9000,150,5800);
  wall(200,9500,150,5300);wall(3150,9500,150,5300);
  wall(3500,11300,150,3500);wall(7850,11300,150,3500);wall(5650,11300,150,3500);
  wall(3500,11300,450,150);wall(4950,11300,700,150);wall(5650,11300,450,150);wall(7000,11300,1000,150);
  wall(8400,12400,150,2400);wall(10600,12400,150,2400);wall(8400,12400,400,150);wall(10000,12400,750,150);
  role="notes";door(3950,11300,1000,true);door(6000,11300,1000,true);rect(8550,12550,2050,2250);line([8800,12475],[10000,12475]);text("LIFT",9100,13600,145);
  stair(11400,9300,1400,280,1400);stair(400,9700,1200,250,1200);
  block("wc",4500,14100);block("wc",6500,14100);block("basin",4000,13000, floor,90);block("basin",6300,13000,floor,90);
  text("WC-01",4150,14600,110);text("WC-02",6250,14600,110);text("MAIN STAIR",11700,14400,130);text("REAR STAIR",500,14600,110);
  role="furniture";active=members.furniture;
  if(floor===1){
   for(const x of [1600,3900,6200])for(const y of [2000,5000])block("table2",x,y,floor);
   for(const x of [9000,12500])for(const y of [2000,5000])block("table4",x,y,floor);
   rect(600,7800,7800,450,"#d8c5a9");for(let i=0;i<12;i++)block("stool",950+i*650,7300,floor);
   rect(4000,8600,6400,700,"#c9bdac","cafe-bar-front");rect(3500,10500,7200,650,"#d8c5a9");
   block("display",5100,8950,floor);block("espresso",7200,8950,floor);block("grinder",7900,8950,floor);block("fridge",8700,8950,floor);
   block("sink",4300,10825,floor);block("dishwasher",5400,10825,floor);block("fridge",6500,10825,floor);
   text("01 주문",4000,8300);text("02 제조",6700,8300);text("03 픽업",9000,8300);text("세척 / 준비",7000,10800,110);text("직원 작업 통로 1200",6500,9800,110);
  }else{
   for(const x of [3200,5500,7800,10080])for(const y of [2000,5000])block("table2",x,y,floor);
   for(const x of [3200,6500,9700])block("table4",x,7200,floor);
   for(const y of [1800,4400,6880])block("table4",13000,y,floor);
   block("communal8",5700,10100,floor);block("lounge4",9600,10500,floor);
   rect(200,1700,400,6500,"#d8c5a9");for(let i=0;i<8;i++)block("stool",1050,2100+i*750,floor);
   rect(8300,11700,2400,600,"#d8c5a9");block("basin",8750,12000);block("drain",10200,12000);
   text("반납 / 물",8600,11500,110);
  }
  for(const [x,y]of [[14350,8200],[900,8700],[10900,800]] as P[])block("plant",x,y,floor);
  role="notes";active=members.notes;
  text(floor===1?"1F · ORDER / SOCIAL · 40 SEATS":"2F · LOUNGE / FOCUS · 60 SEATS",600,15500,170);
  text(floor===1?"2인석 · 자유로운 대화":"창가 집중석 · 작은 모임",900,800,125);
  if(floor===1){arrow([13800,700],[13800,7000]);arrow([13800,7000],[10800,7000]);arrow([10800,7000],[10800,8400]);line([9700,8350],[9700,11200]);text("1/D601",9500,11450,100);}else arrow([12900,9000],[11200,6200]);
  text("주 동선 목표 1500",10200,6100,110);text("A",12500,-800,160);line([12500,-400],[12500,14800]);
  // Real native dimensions; labels and arrowheads use paper-sized scaling in the frame.
  const dim=(id:string,a:P,b:P,offset:number,orientation:"horizontal"|"vertical")=>{add({type:"create-dimension",id,layerId:"cafe-notes",dimension:"linear",params:{workPlane:"XY",points:[a.map((v,i)=>v+(i===0?ox:0)),b.map((v,i)=>v+(i===0?ox:0))],offset,orientation,symbolScale:40,style:{precision:0,lengthUnit:"mm"}}});};
  dim(`cafe-${floor}-width`,[0,0],[15000,0],-850,"horizontal");dim(`cafe-${floor}-depth`,[0,0],[0,15000],850,"vertical");
  for(const [i,row]of ["COMMON GROUND / 2F CAFE","225 m² envelope per floor",floor===1?"40 seats / service floor":"60 seats / lounge floor","FFL "+(floor===1?"+0.000":"+3.900"),"COLUMNS / CORE: FIXED","Main route target 1500 mm","All dimensions in mm","Project assumptions; R0","A-A: stair / 1-D601: bar"].entries())text(row,17200,14200-i*550,145);
  role="rcp";active=members.rcp;
  rect(400,400,14200,8000,undefined);text("CL +3200 / acoustic rafts",500,15500,150);
  for(const placement of placements.filter(p=>p.floor===floor&&["table2","table4","communal8"].includes(p.symbol)))block("pendant",placement.x,placement.y);
  for(const x of [1000,4000,7000,10000,13500])for(const y of [1100,6300,8800])block("downlight",x,y);
  for(const x of [4200,6000,7800,9600])block("linear",x,9850);
  for(const y of [2200,5200,8200]){line([700,y],[10200,y]);}text("L01 pendant / L02 downlight / L03 linear",17000,13000,145);
  text("Lighting positions; switching groups on E101",17000,12200,130);text("Raft CL +3200; exposed perimeter +3600",17000,11400,130);text("Sprinkler / HVAC coordination pending",17000,10600,130);
  role="power";active=members.power;for(const p of placements.filter(p=>p.floor===floor&&p.symbol==="table2"&&p.y===2000))block("outlet",p.x,500);
  for(const x of [4700,7200,8700,9900]){block("outlet",x,10750);text(`E-${floor}-${x}`,x-150,11200,85);}text("P: power / D: data; positions only",700,-700,110);
  role="water";active=members.water;
  for(const [x,y] of (floor===1?[[4300,10800],[5400,10800],[7200,8950],[6500,14100]]:[[8750,12000],[6500,14100]]) as P[]){block("drain",x,y);line([x,y],[10700,y]);line([10700,y],[10700,14500]);}
  text("W / D routes to existing wet riser",500,-650,110);
  role="finishes";active=members.finishes;
  rect(200,200,14600,8300,"#eee8dc");rect(3500,8500,7200,2600,"#dcd8ce");rect(3500,11300,4500,3500,"#c7cec7");
  for(let x=600;x<14800;x+=900)line([x,200],[x,8400]);for(let y=200;y<8500;y+=900)line([200,y],[14800,y]);
  text("FL-01 porcelain / FL-02 service / FL-03 wet",500,15500,140);
 }
 level=0;
 const frame=(id:string,name:string,ids:string[],origin:P,size:P,scale:number)=>{frames.push({id,name,ids:[...new Set(ids)],origin,size,scale});return id;};
 const page=(id:string,name:string,fs:string[],size:P=[420,297])=>sheets.push({id,name,frames:fs,size});
 const full=(floor:number,kind:"layout"|"rcp")=>{const m=floorMembers[floor-1],base=(floor-1)*22000;return frame(`${kind}-${floor}`,`${floor}F ${kind==="layout"?"Furniture plan":"Reflected ceiling"}`,kind==="layout"?[...m.walls,...m.furniture,...m.notes]:[...m.walls,...m.rcp],[base-1300,-1300],[530,340],50);};
 page("A101","1F furniture and circulation",[full(1,"layout")],[594,420]);page("A102","2F furniture and circulation",[full(2,"layout")],[594,420]);
 page("A201","1F reflected ceiling",[full(1,"rcp")],[594,420]);page("A202","2F reflected ceiling",[full(2,"rcp")],[594,420]);
 for(const [id,name,kind] of [["A301","Floor finishes","finishes"],["E101","Power and data coordination","power"],["P101","Equipment and plumbing coordination","water"]] as const){
  page(id,name,[1,2].map(floor=>{const m=floorMembers[floor-1];return frame(`${kind}-${floor}`,`${floor}F ${kind}`,kind==="finishes"?[...m.finishes,...m.walls]:[...m.walls,...m.furniture,...m[kind]],[(floor-1)*22000-1300,-1300],[188,205],100);}));
 }
 // Four interior elevations, independently drafted from the same dimensions and levels.
 const elevationIds:string[]=[];ox=50000;role="walls";active=elevationIds;
 for(let i=0;i<4;i++){const x=(i%2)*18500,y=Math.floor(i/2)*9000;rect(x,y,15000,3900);line([x,y+3200],[x+15000,y+3200]);
  if(i%2===0){for(let j=0;j<5;j++)rect(x+300+j*2700,y+150,2500,2650);}else{rect(x+3500,y,7200,900,"#d8c5a9");rect(x+3500,y+1700,7200,1400,"#eee8dc");for(let j=0;j<8;j++)line([x+3500+j*900,y],[x+3500+j*900,y+900]);}
  text(["1F SOUTH / entrance glazing","1F NORTH / coffee bar","2F WEST / window counter","2F NORTH / lounge finishes"][i],x,y+4600,250);text("FFL "+(i<2?"+0.000":"+3.900"),x,y-550,180);
 }page("A401","Interior elevations",[frame("elevations","Four interior elevations",elevationIds,[49500,-1000],[370,195],100)]);
 // Long section and enlarged staircase section with exactly the same riser source.
 const sectionIds:string[]=[];ox=100000;role="walls";active=sectionIds;
 rect(0,-250,15000,250,"#d1cdc2");rect(0,3650,9300,250,"#d1cdc2");rect(14060,3650,940,250,"#d1cdc2");rect(0,7550,15000,250,"#d1cdc2");
 for(const y of [0,3900]){wall(0,y,200,3650);wall(14800,y,200,3650);if(y===0){line([200,3200],[9300,3200]);line([14060,3200],[14800,3200]);}else line([200,y+3200],[14800,y+3200]);text("CL +"+(y+3200),900,y+3300,160);}
 const stairs=stairLayout({rise:3900,risers:26,going:280,width:1400,landing:1400});
 const first:P[]=[[9300,0]],returning:P[]=[[12660,1950]];
 for(let i=1;i<=13;i++){first.push([9300+(i-1)*280,i*150]);if(i<13)first.push([9300+i*280,i*150]);returning.push([12660-(i-1)*280,1950+i*150]);if(i<13)returning.push([12660-i*280,1950+i*150]);}poly(first);poly(returning);line([12660,1950],[14060,1950]);
 text("A-A · longitudinal section / stair flights projected",400,8500,220);text("26 risers x 150 = 3900",1000,1200,160);
 text("FFL +0.000",300,-600,180);text("FFL +3.900",300,4000,180);text("ROOF +7.800",300,8000,180);
 // True developed stair section, two flights, each 13 risers and 12 goings.
 const sx=18000;let step:P[]=[[sx,0]];
 for(let i=1;i<=13;i++){step.push([sx+(i-1)*280,i*150]);if(i<13)step.push([sx+i*280,i*150]);}poly(step);line([sx+3360,1950],[sx+4760,1950]);
 const second:P[]=[[sx+4760,1950]];for(let i=1;i<=13;i++){second.push([sx+4760+(i-1)*280,1950+i*150]);if(i<13)second.push([sx+4760+i*280,1950+i*150]);}poly(second);line([sx+8120,3900],[sx+9520,3900]);
 text("B-B · developed main stair / 26R x150 / G280",sx,4700,170);text("Flight 1: 13R / 12G",sx,2500,160);text("Landing 1400",sx+3400,1600,140);text("Flight 2: 13R / 12G",sx+4900,4200,160);
 text("LEVEL / STAIR COORDINATION",400,14500,280);text("FFL 0 / 3900 / roof7800. Floor slab250. Ceiling3200.",400,13600,180);
 text("Main stair: 26R x150 / G280 / clear width1400 / landing1400.",400,12900,180);text("Floor opening aligns with plan run9300-14060. Rear stair G250.",400,12200,180);
 text("Stair drawings are geometry studies; structure / fire / headroom review pending.",400,11500,170);
 page("A501","Building and stair sections",[frame("sections","Sections A-A / B-B",sectionIds,[99500,-1000],[568,340],50)],[594,420]);
 // Bar plan, elevation and assembly section, in millimetres and separate native objects.
 const detailIds:string[]=[];ox=150000;role="furniture";active=detailIds;
 rect(0,0,6400,700,"#d8c5a9","detail-bar-plan");for(let i=0;i<8;i++)line([i*800,0],[i*800,700]);text("BAR PLAN / 6400 x700",0,1050,70);
 rect(0,1800,6400,900,"#d8c5a9");line([0,2660],[6400,2660]);for(let i=0;i<8;i++)rect(i*800+20,1900,760,730);text("BAR FRONT / H900",0,2800,70);
 rect(0,3800,700,40,"#d8c5a9");rect(40,3040,18,760);rect(642,3040,18,760);line([40,3040],[660,3040]);line([0,2940],[700,2940]);text("SECTION 1 / H900 / top40 / carcass18 / plinth100",950,3600,70);
 text("1:20 / generic equipment envelopes; confirm supplier sizes",0,-400,65);
 page("D601","Coffee bar plan and joinery",[frame("bar-detail","Bar detail",detailIds,[149500,-700],[370,230],20)]);
 // Title/brief and schedules use native paper-scale text, not a raster poster.
 const cover:string[]=[];ox=200000;role="notes";active=cover;
 text("COMMON GROUND",6,185,9);text("2층 대형 카페 인테리어",6,168,6);
 const brief=["R0 / 2026-10-20 / 2D design development","15,000 x15,000 mm per level / two floors","450 m² combined envelope / 100 designed seats","1F: order, pickup, manufacturing, social seats","2F: window seats, communal table, quiet lounge","Fixed: columns, two stairs, lift and wet core","Materials: warm oak / porcelain / acoustic rafts","Issue: 12 drawings, editable CAD, SVG and DXF","Assumed site; equipment sizes are generic","Coordination drawings; no permit approval claim"];
 brief.forEach((s,i)=>text(s,8,145-i*9,3.5));
 text("CUSTOMER ROUTE",225,145,4);["Entry → order → pickup → seat","Clear main route target 1500","Staff: receive → store → prepare","→ make → serve → wash","Review stair/door intersections","R1: revise bar and seating","then reissue affected drawings"].forEach((s,i)=>text(s,225,132-i*10,3.2));
 page("G000","Project brief and drawing register",[frame("brief","Project brief",cover,[200000,0],[390,205],1)]);
 const schedule:string[]=[];ox=220000;active=schedule;text("FURNITURE / EQUIPMENT / FINISH",5,190,5);
 const seatCounts=[1,2].map(floor=>placements.filter(p=>p.floor===floor).reduce((sum,p)=>sum+p.seats,0));
 CAFE_SYMBOLS.slice(0,14).forEach((s,i)=>{const qty=placements.filter(p=>p.symbol===s.id).length;text(`${s.name} | ${s.size.join(" x")} | qty ${qty}`,6,175-i*10,2.8);});
 ["FINISH KEY","FL-01 900x900 porcelain / public","FL-02 service tile / back bar","FL-03 wet-area tile / toilets","WL-01 warm white / WL-02 oak","CL-01 acoustic raft +3200","CL-02 exposed ceiling +3600","COUNTS",`1F ${seatCounts[0]} seats / 2F ${seatCounts[1]} seats`,"Dimensions = mm / levels = mm","Material quantities: design estimate","Coordinate MEP before construction"].forEach((s,i)=>text(s,225,175-i*11,3));
 page("S001","Schedules and finish key",[frame("schedule","Schedules",schedule,[220000,0],[390,205],1)]);
 const gallery:string[]=[];ox=260000;active=gallery;role="assets";
 CAFE_SYMBOLS.forEach((s,i)=>{const x=(i%4)*5000+2200,y=Math.floor(i/4)*3500+1600;block(s.id,x,y);text(s.name,x-1900,y-1300,180);text(`${s.size.join(" x")} mm / ${s.seats} seat`,x-1900,y-1550,140);});
 frame("asset-gallery","Reusable original CAD blocks",gallery,[260000,0],[450,370],50);
 return {commands,frames,sheets,placements,seatCounts,floorMembers,stairs,assetFrame:"asset-gallery"};
}
