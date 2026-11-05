import type {CadToolCall} from "../src/copilot/cadToolContract";
import {stairLayout} from "../src/precision/stairLayout";
type P=[number,number];
type Finish={name:string;color:string;roughness:number;metalness:number;opacity:number};
export type HouseBatch={label:string;calls:CadToolCall[]};
export const HOUSE={name:"틈마당집 / Lightwell House",site:[[0,0],[22000,0],[22000,28000],[0,28000]] as P[],outline:[[5000,10000],[13500,10000],[13500,12800],[17400,14500],[17400,21400],[5000,21400]] as P[],upper:[[5000,10000],[10500,10000],[10500,16600],[17400,16600],[17400,21400],[5000,21400]] as P[],stair:[[11400,17750],[13800,17750],[13800,21200],[11400,21200]] as P[],levels:{B1:-3000,F1:0,F2:3300},references:[{name:"Villa Vals / SeARCH + CMA",url:"https://www.search.nl/works/villa-vals/",take:"지하 공간이 하늘과 외부 마당을 직접 마주하도록 구성"},{name:"House in Leiria / Aires Mateus",url:"https://www.archdaily.com/118906/house-in-leiria-aires-mateus",take:"선큰마당을 지하 실의 채광과 사생활을 조직하는 빈 공간으로 사용"},{name:"Garden House / Hayhurst & Co",url:"https://hayhurstand.co.uk/projects/garden-house/",take:"서로 다른 경사와 높이를 가진 지붕으로 공간 성격을 드러냄"}],assumptions:["가상 22×28m 대지; 북측 도로; 4인 가족; 단위 mm","지하 작업·취미층, 지상 공동생활층, 2층 침실층","설계 발전 과제; 지반·배수·방수·구조·법규 검토 전"],rooms:[
 {level:"B1",name:"작업실 · 빛마당",x:7300,y:15000},{level:"B1",name:"취미 라운지",x:7800,y:11900},{level:"B1",name:"보관실",x:7200,y:20300},{level:"B1",name:"설비 / 창고",x:15300,y:19900},{level:"B1",name:"욕실",x:10450,y:18400},{level:"B1",name:"취미실",x:15100,y:15300},
 {level:"F1",name:"거실 · 남쪽 마당",x:7800,y:11900},{level:"F1",name:"식당",x:7800,y:14900},{level:"F1",name:"주방",x:15300,y:15500},{level:"F1",name:"게스트 / 다목적실",x:7300,y:19300},{level:"F1",name:"화장실 / 세탁실",x:10300,y:20000},{level:"F1",name:"현관",x:7000,y:16500},{level:"F1",name:"팬트리",x:15500,y:19900},
 {level:"F2",name:"안방",x:7600,y:12300},{level:"F2",name:"드레스룸 / 욕실",x:7500,y:15300},{level:"F2",name:"침실 02",x:7200,y:19500},{level:"F2",name:"침실 03",x:15600,y:19600},{level:"F2",name:"가족 갤러리",x:10000,y:17300},{level:"F2",name:"공용 욕실",x:10200,y:19800},{level:"F2",name:"루프 테라스",x:12800,y:14300}
 ]};
const plaster:Finish={name:"Warm mineral plaster",color:"#e8e0d2",roughness:.86,metalness:0,opacity:1},concrete:Finish={name:"Board formed concrete",color:"#a8a69c",roughness:.91,metalness:0,opacity:1},roof:Finish={name:"Patinated bronze roof",color:"#4b5756",roughness:.63,metalness:.4,opacity:1},wood:Finish={name:"Thermal ash",color:"#ad8053",roughness:.77,metalness:0,opacity:1},metal:Finish={name:"Dark bronze frames",color:"#353f3d",roughness:.5,metalness:.55,opacity:1},glass:Finish={name:"Clear green glazing",color:"#b9d8d4",roughness:.18,metalness:.05,opacity:.28},grass:Finish={name:"Garden meadow",color:"#8e9c6b",roughness:1,metalness:0,opacity:1},stone:Finish={name:"Warm limestone",color:"#c7c2b1",roughness:.92,metalness:0,opacity:1};
const finishes={plaster,concrete,roof,wood,metal,glass,grass,stone};
export function gardenHouseDesign(){
 const batches:HouseBatch[]=[],solids:{id:string;name:string;level:string;kind:string}[]=[],walls:string[]=[],openings:{wallId:string;level:string;start:P;end:P;thickness:number;base:number;opening:any}[]=[],furniture:{level:string;id:string;x:number;y:number;w:number;d:number}[]=[],ids=new Set<string>();let seq=0;
 const c=(name:CadToolCall["name"],args:Record<string,unknown>):CadToolCall=>({id:`h${++seq}`,name,arguments:args});
 const add=(label:string,calls:CadToolCall[])=>{if(calls.length>20)throw Error("House batch exceeds common tool budget");batches.push({label,calls});};
 const note=(id:string,name:string,level:string,kind:string)=>{if(ids.has(id))throw Error(`Duplicate house ID ${id}`);ids.add(id);solids.push({id,name,level,kind});};
 const style=(objects:{objectId:string;name?:string}[],layerId:string,finish?:Finish,visible=true)=>c("scene.objects",{objects,layerId,visible,...finish?{finish}:{}});
 add("Project organization",[...["site","B1","F1","F2","roof","glass","furniture","garden"].map((id,i)=>c("scene.layer",{id:`house_${id}`,name:["00 · 대지 / 마당","B1 · 지하 작업·취미층","1F · 마당과 생활층","2F · 침실과 갤러리","RF · 비대칭 지붕","창호 · 유리 / 프레임","가구 · 고정·이동 가구","조경 · 수목 / 외부계단"][i],color:["#9a9d82","#a8a69c","#e8e0d2","#ded4c4","#4b5756","#8bb3b2","#ad8053","#8e9c6b"][i]}))]);
 function slab(id:string,label:string,poly:P[],holes:P[][],level:number,thickness:number,layer:string,finish:Finish){const profiles=[poly,...holes].map((points,i)=>c("curve.polyline",{id:`${id}_p${i}`,plane:"XY",points:points.map(p=>[...p,0]),closed:true}));note(id,label,layer,"slab");add(label,[...profiles,c("slab.create",{id,profileObjectIds:profiles.map(p=>p.arguments.id),kind:"floor",level,thickness}),style([{objectId:id,name:label}],`house_${layer}`,finish)]);}
 slab("b1_floor","B1 / 지하 바닥 -3.000",HOUSE.outline,[],-3000,250,"B1",concrete);
 slab("f1_floor","1F / 생활층 바닥 ±0.000",HOUSE.outline,[HOUSE.stair],0,250,"F1",stone);
 slab("f2_floor","2F / 침실층 바닥 +3.300",HOUSE.upper,[HOUSE.stair],3300,220,"F2",wood);
 slab("terrace","2F / 남동 루프 테라스",[[10500,10000],[13500,10000],[13500,12800],[17400,14500],[17400,16600],[10500,16600]],[],3300,220,"F2",stone);
 slab("sunken","SITE / 선큰마당 -3.000",[[1500,12000],[5000,12000],[5000,22000],[1500,22000]],[],-3000,180,"site",stone);
 slab("bridge","SITE / 선큰을 건너는 현관 다리",[[800,15300],[5100,15300],[5100,17100],[800,17100]],[],0,200,"site",wood);
 // Leave the entire sunken court and basement footprint open in the grade surface.
 const excavation:P[]=[[4875,9875],[13625,9875],[13625,12718],[17525,14418],[17525,21525],[5125,21525],[5125,22250],[1250,22250],[1250,11750],[4875,11750]];
 slab("ground","SITE / 지반 표현체 · 굴착 제외",HOUSE.site,[excavation],-120,3200,"site",{...stone,name:"Earth section",color:"#b5aa8e"});
 slab("ground_skin","SITE / 정원 지표면",HOUSE.site,[excavation],-100,30,"site",grass);
 slab("parking","SITE / 북동측 2대 주차",[[16500,22400],[21800,22400],[21800,27800],[16500,27800]],[],-80,100,"site",stone);
 slab("walk","SITE / 북측 진입 산책로",[[600,15300],[1400,15300],[1400,23600],[16500,23600],[16500,24900],[600,24900]],[],-40,100,"site",stone);
 slab("deck","SITE / 남향 생활 테라스",[[5000,8200],[14000,8200],[14000,10000],[5000,10000]],[],-50,150,"site",wood);
 function wallBatch(level:string,base:number,height:number,poly:P[],parts:{id:string;start:P;end:P;openings?:any[];thickness?:number}[]){
  const defs=poly.map((start,i)=>({id:`${level.toLowerCase()}_w${i}`,start,end:poly[(i+1)%poly.length],openings:[] as any[],thickness:level==="B1"?250:200}));
  if(level==="B1"){defs[5].openings=[{id:"studioDoor",kind:"door",side:"left",along:5100,width:1500,height:2400,sill:0},{id:"studioWindow",kind:"window",side:"left",along:7900,width:2000,height:1800,sill:700}];}
  if(level==="F1"){defs[0].openings=[{id:"gardenSlide",kind:"door",side:"left",along:3400,width:3200,height:2500,sill:0}];defs[2].openings=[{id:"kitchenCorner",kind:"window",side:"left",along:2100,width:2400,height:1600,sill:850}];defs[3].openings=[{id:"kitchenLight",kind:"window",side:"left",along:2000,width:2100,height:1600,sill:850}];defs[4].openings=[{id:"northGuest",kind:"window",side:"left",along:8200,width:2300,height:1700,sill:700}];defs[5].openings=[{id:"bridgeEntry",kind:"door",side:"left",along:5100,width:1300,height:2400,sill:0},{id:"diningLight",kind:"window",side:"left",along:7400,width:2000,height:1900,sill:550}];}
  if(level==="F2"){defs[0].openings=[{id:"masterSouth",kind:"window",side:"left",along:2750,width:2700,height:1900,sill:650}];defs[1].openings=[{id:"terraceDoor",kind:"door",side:"left",along:2600,width:1600,height:2400,sill:0}];defs[3].openings=[{id:"bedroomEast",kind:"window",side:"left",along:2800,width:1800,height:1800,sill:700}];defs[4].openings=[{id:"childNorth",kind:"window",side:"left",along:9200,width:2100,height:1700,sill:750}];defs[5].openings=[{id:"galleryWest",kind:"window",side:"left",along:4200,width:1800,height:1900,sill:550},{id:"masterWest",kind:"window",side:"left",along:9100,width:1800,height:1800,sill:700}];}
  const all=[...defs,...parts];for(let off=0;off<all.length;off+=15){const group=all.slice(off,off+15);for(const w of group){walls.push(w.id);note(w.id,`${level} / ${off+group.indexOf(w)+1} 벽`,level,"wall");for(const o of w.openings??[])openings.push({wallId:w.id,level,start:w.start,end:w.end,thickness:w.thickness??150,base,opening:o});}add(`${level} native walls ${off/15+1}`,[...group.map(w=>c("wall.create",{id:w.id,start:w.start,end:w.end,height,thickness:w.thickness??150,baseLevel:base,openings:w.openings??[]})),style(group.map(w=>({objectId:w.id,name:`${level} / ${w.id} · ${w.openings?.length?"개구부 벽":"벽"}`})),`house_${level}`,level==="B1"?concrete:plaster)]);}
 }
 const door=(id:string,along:number,width=900)=>({id,kind:"door",side:"left",along,width,height:2200,sill:0});
 wallBatch("B1",-3000,2750,HOUSE.outline,[{id:"b1_p1",start:[5125,17200],end:[11300,17200],openings:[door("storeAccess",3600)]},{id:"b1_p2",start:[11000,10125],end:[11000,17200],openings:[door("hobbyAccess",6475,1100)]},{id:"b1_p3",start:[13900,17700],end:[17275,17700],openings:[door("plantAccess",1200)]},{id:"b1_p4",start:[5125,19500],end:[11300,19500],openings:[door("storage",2200)]},{id:"b1_p5",start:[9600,17275],end:[9600,19425],openings:[door("bath",1100,800)]}]);
 wallBatch("F1",0,3050,HOUSE.outline,[{id:"f1_p1",start:[5100,17600],end:[11300,17600],openings:[door("guest",2500),door("utility",5300,800)]},{id:"f1_p2",start:[9400,17675],end:[9400,21300]},{id:"f1_p3",start:[11300,18000],end:[11300,21300]},{id:"f1_p4",start:[13900,18100],end:[17300,18100],openings:[door("pantry",1600)]}]);
 wallBatch("F2",3300,3000,HOUSE.upper,[{id:"f2_p1",start:[5100,14400],end:[10400,14400],openings:[door("master",4400)]},{id:"f2_p2",start:[5100,16600],end:[10400,16600],openings:[door("suite",4400)]},{id:"f2_p3",start:[5100,18200],end:[11300,18200],openings:[door("childOne",3700),door("sharedBath",5100,800)]},{id:"f2_p4",start:[9300,18275],end:[9300,21300]},{id:"f2_p5",start:[11300,18275],end:[11300,21300]},{id:"f2_p6",start:[13900,16675],end:[13900,21300],openings:[door("eastHall",900)]}]);
 type Box={id:string;name:string;pos:[number,number,number];size:[number,number,number]};
 function boxes(label:string,level:string,finish:Finish,list:Box[],kind="detail"){
  for(let off=0;off<list.length;off+=17){const group=list.slice(off,off+17);for(const b of group)note(b.id,b.name,level,kind);add(`${label} ${off/17+1}`,[...group.map(b=>c("solid.primitive",{id:b.id,primitive:"box",params:{width:b.size[0],depth:b.size[1],height:b.size[2]},position:b.pos})),style(group.map(b=>({objectId:b.id,name:b.name})),`house_${level}`,finish)]);}
 }
 for(const [level,z,rise,risers,going]of [["B1",-3000,3000,18,250],["F1",0,3300,20,230]] as const){
  const s=stairLayout({rise,risers,going,width:1000,landing:1050}),list:Box[]=[];for(const step of s.steps){if(step.number===s.perFlight)continue;if(step.number===risers)continue;const y=step.flight===0?18000+step.tread*going:18000+s.run-(step.tread+1)*going;list.push({id:`${level.toLowerCase()}_tread${step.number}`,name:`${level} / 계단 ${step.number} · ${s.riser.toFixed(2)} mm`,pos:[step.flight===0?11500:12700,y,z+step.z-100],size:[1000,going,100]});}
  list.push({id:`${level.toLowerCase()}_landing`,name:`${level} / 중간참`,pos:[11500,18000+s.run,z+rise/2-140],size:[2200,1050,140]},{id:`${level.toLowerCase()}_toplanding`,name:`${level} / 상부참`,pos:[12700,17150,z+rise-140],size:[1000,600,140]});boxes(`${level} two-flight stair`,level,wood,list,"stair");
 }
 boxes("External sunken stair","garden",concrete,Array.from({length:18},(_,i)=>({id:`garden_step${i+1}`,name:`SITE / 선큰 계단 ${i+1}`,pos:[1700,22000-(i+1)*280,-(i+1)*3000/18-100] as [number,number,number],size:[1000,280,100] as [number,number,number]})),"stair");
 // Subgrade retaining edges and a protected bridge. Detailed waterproofing is outside this study.
 boxes("Sunken retaining walls","site",concrete,[{id:"ret_w1",name:"SITE / 선큰 서측 옹벽 1",pos:[1250,11800,-3200],size:[250,5200,3200]},{id:"ret_w2",name:"SITE / 선큰 서측 옹벽 2",pos:[1250,17000,-3200],size:[250,5200,3200]},{id:"ret_s",name:"SITE / 선큰 남측 옹벽",pos:[1500,11750,-3200],size:[3500,250,3200]},{id:"ret_n",name:"SITE / 선큰 북측 옹벽",pos:[1500,22000,-3200],size:[3500,250,3200]}]);
 function rail(id:string,x:number,y:number,w:number,d:number,z:number,level:string){boxes(id,level,metal,[{id:`${id}_top`,name:`${level} / 난간 상부`,pos:[x,y,z+1080],size:[w,d,45]},...[0,1,2,3].map((i)=>({id:`${id}_post${i}`,name:`${level} / 난간 기둥`,pos:[x+(w>d?(w-45)*i/3:0),y+(d>w?(d-45)*i/3:0),z] as [number,number,number],size:[45,45,1080] as [number,number,number]}))]);}
 rail("bridge_s",850,15300,4200,45,0,"site");rail("bridge_n",850,17055,4200,45,0,"site");rail("court_w_s",1400,12000,45,3300,0,"site");rail("court_w_n",1400,17100,45,5100,0,"site");rail("court_n",2900,22100,2100,45,0,"site");rail("terrace_s",10600,10000,2800,45,3300,"F2");rail("terrace_e",17300,14600,45,1900,3300,"F2");rail("stair_void",11400,17400,45,3500,3300,"F2");
 // Windows/doors are true native openings. Glazing and reveal frames are explicit model details.
 const glassBoxes:Box[]=[],frameBoxes:Box[]=[];
 for(const [index,o]of openings.entries()){
  const dx=o.end[0]-o.start[0],dy=o.end[1]-o.start[1],len=Math.hypot(dx,dy);if(Math.abs(dx)>1e-6&&Math.abs(dy)>1e-6){
   const ux=dx/len,uy=dy/len,vx=-uy,vy=ux,z=o.base+o.opening.sill;
   const rectangle=(along:number,width:number,depth:number,base:number):[number,number,number][]=>[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]].map(([u,v])=>[o.start[0]+ux*(along+u)+vx*v,o.start[1]+uy*(along+u)+vy*v,base]);
   extrude(`${o.level} / ${o.opening.id} 유리`,`diag_glass_${index}`,rectangle(o.opening.along,o.opening.width,45,z),o.opening.height,"XY",glass,"glass");
   for(const side of [-1,1])extrude(`${o.level} / 대각 개구부 프레임`,`diag_frame_${index}_${side<0?"a":"b"}`,rectangle(o.opening.along+side*(o.opening.width/2-32.5),65,110,z),o.opening.height,"XY",metal,"glass");
   extrude(`${o.level} / 대각 개구부 헤드`,`diag_head_${index}`,rectangle(o.opening.along,o.opening.width,110,z+o.opening.height-65),65,"XY",metal,"glass");continue;
  }
  const cx=o.start[0]+dx/len*o.opening.along,cy=o.start[1]+dy/len*o.opening.along,width=o.opening.width,height=o.opening.height,z=o.base+o.opening.sill,alongX=Math.abs(dx)>Math.abs(dy),thin=45;
  if(o.opening.kind==="window"||["gardenSlide","terraceDoor","studioDoor"].includes(o.opening.id))glassBoxes.push({id:`glazing_${index}`,name:`${o.level} / ${o.opening.id} 유리`,pos:[cx-(alongX?width/2:thin/2),cy-(alongX?thin/2:width/2),z],size:[alongX?width:thin,alongX?thin:width,height]});
  const addFrame=(suffix:string,px:number,py:number,pz:number,w:number,d:number,h:number)=>frameBoxes.push({id:`frame_${index}_${suffix}`,name:`${o.level} / ${o.opening.id} 프레임`,pos:[px,py,pz],size:[w,d,h]});
  for(const side of [-1,1])addFrame(side<0?"a":"b",cx-(alongX?width/2:55)+ (alongX&&side>0?width-65:0),cy-(alongX?55:width/2)+(!alongX&&side>0?width-65:0),z,alongX?65:110,alongX?110:65,height);
  addFrame("head",cx-(alongX?width/2:55),cy-(alongX?55:width/2),z+height-65,alongX?width:110,alongX?110:width,65);
 }
 boxes("Window and door glazing","glass",glass,glassBoxes,"glazing");boxes("Window reveals","glass",metal,frameBoxes,"frame");
 function extrude(label:string,id:string,points:[number,number,number][],distance:number,plane:"XZ"|"XY",finish:Finish,layer="roof"){
  note(id,label,layer,layer==="glass"?(label.includes("유리")?"glazing":"frame"):"roof");add(label,[c("curve.polyline",{id:`${id}_profile`,plane,points,closed:true}),c("solid.extrude",{id,profileObjectIds:[`${id}_profile`],distance}),style([{objectId:id,name:label}],`house_${layer}`,finish),style([{objectId:`${id}_profile`}],"layer-default",undefined,false)]);
 }
 // Unequal pitches, an off-centre ridge and a lower east wing; no repeated housing modules.
 for(const [suffix,y,depth]of [["north",21800,10000],["south",11800,1900]] as const){
  extrude(`RF / 서측 급경사 ${suffix}`,`roof_w_${suffix}`,[[4800,y,6340],[6900,y,7870],[6900,y,8050],[4800,y,6520]],depth,"XZ",roof);
  extrude(`RF / 동측 완경사 ${suffix}`,`roof_e_${suffix}`,[[6900,y,7870],[10800,y,6440],[10800,y,6620],[6900,y,8050]],depth,"XZ",roof);
 }
 extrude("RF / 낮은 동측 날개", "roof_east",[[10500,21700,6990],[17600,21700,6340],[17600,21700,6520],[10500,21700,7170]],5300,"XZ",roof);
 for(const [id,y]of [["gable_front",10100],["gable_back",21500]] as const)extrude(`F2 / ${id}`,id,[[4900,y,6300],[4900,y,6340+100*1530/2100],[6900,y,7870],[10600,y,7870-3700*1430/3900],[10600,y,6300]],200,"XZ",plaster,"F2");
 // Close the roof/wall junction with explicit tapered native infill, using the roof underside plane.
 for(const [suffix,y,depth]of [["north",21500,10000],["south",11500,1600]] as const)extrude(`F2 / 서측 처마벽 ${suffix}`,`eave_w_${suffix}`,[[4900,y,6300],[4900,y,6340+100*1530/2100],[5100,y,6340+300*1530/2100],[5100,y,6300]],depth,"XZ",plaster,"F2");
 extrude("F2 / 서측 날개 동쪽 처마벽","eave_wing_e",[[10400,16700,6300],[10400,16700,7870-3500*1430/3900],[10600,16700,7870-3700*1430/3900],[10600,16700,6300]],6800,"XZ",plaster,"F2");
 const eastUnder=(x:number)=>6990-(x-10500)*650/7100;
 for(const [id,y]of [["east_gable_s",16700],["east_gable_n",21500]] as const)extrude(`F2 / 낮은 지붕 단부 ${id}`,id,[[10400,y,6300],[10400,y,eastUnder(10400)],[17500,y,eastUnder(17500)],[17500,y,6300]],200,"XZ",plaster,"F2");
 extrude("F2 / 두 지붕 사이 상부 접합벽","roof_junction",[[10400,21300,6300],[10400,21300,eastUnder(10400)],[10600,21300,eastUnder(10600)],[10600,21300,6300]],4600,"XZ",plaster,"F2");
 extrude("F2 / 동측 처마벽","eave_east",[[17300,21300,6300],[17300,21300,eastUnder(17300)],[17500,21300,eastUnder(17500)],[17500,21300,6300]],4600,"XZ",plaster,"F2");

 const tables:Box[]=[{id:"sofa",name:"F1 / 거실 소파",pos:[6100,10800,0],size:[2900,950,750]},{id:"sofa_low",name:"F1 / 거실 테이블",pos:[7100,12300,0],size:[1400,700,350]},{id:"dining",name:"F1 / 6인 식탁",pos:[6600,14100,0],size:[2200,950,740]},{id:"island",name:"F1 / 주방 아일랜드",pos:[14000,14600,0],size:[2000,900,900]},{id:"kitchen",name:"F1 / 조리대",pos:[16400,15900,0],size:[650,1900,900]},{id:"guestbed",name:"F1 / 게스트 침대",pos:[5600,18400,0],size:[1500,2100,450]},{id:"masterbed",name:"F2 / 안방 침대",pos:[6500,11200,3300],size:[1800,2100,480]},{id:"childbed1",name:"F2 / 침실02 침대",pos:[5600,18800,3300],size:[1100,2000,450]},{id:"childbed2",name:"F2 / 침실03 침대",pos:[15600,18600,3300],size:[1100,2000,450]},{id:"desk1",name:"F2 / 침실02 책상",pos:[7500,20500,3300],size:[1400,600,730]},{id:"desk2",name:"F2 / 침실03 책상",pos:[14500,20500,3300],size:[1500,600,730]},{id:"workbench",name:"B1 / 작업실 긴 작업대",pos:[5500,13400,-3000],size:[850,2900,900]},{id:"hobbytable",name:"B1 / 취미 테이블",pos:[12500,14400,-3000],size:[2000,1000,760]},{id:"b1sofa",name:"B1 / 지하 라운지",pos:[6500,10800,-3000],size:[2800,900,720]}];
 const sanitary:Box[]=[
 {id:"b1_wc",name:"B1 / WC",pos:[10000,18800,-3000],size:[400,650,430]},
 {id:"b1_basin",name:"B1 / 세면대",pos:[10600,18800,-3000],size:[500,480,800]},
 {id:"f1_wc",name:"F1 / WC",pos:[9750,20200,0],size:[400,650,430]},
 {id:"f1_basin",name:"F1 / 세면대",pos:[10500,20200,0],size:[550,480,800]},
 {id:"f1_washer",name:"F1 / 세탁기",pos:[9750,20550,0],size:[650,650,850]},
 {id:"f2_wc",name:"F2 / 공용 WC",pos:[9700,20200,3300],size:[400,650,430]},
 {id:"f2_basin",name:"F2 / 공용 세면대",pos:[10400,20200,3300],size:[550,480,800]},
 {id:"f2_shower",name:"F2 / 공용 샤워",pos:[9500,18400,3300],size:[900,1000,80]},
 {id:"master_bath",name:"F2 / 안방 욕조",pos:[5500,14700,3300],size:[1700,800,550]},
 {id:"master_basin",name:"F2 / 안방 세면대",pos:[5500,15800,3300],size:[900,500,800]}];
 for(const b of sanitary)furniture.push({level:b.name.split(" /")[0],id:b.id,x:b.pos[0],y:b.pos[1],w:b.size[0],d:b.size[1]});boxes("Sanitary scale fixtures","furniture",plaster,sanitary,"furniture");
 for(const b of tables)furniture.push({level:b.name.split(" /")[0],id:b.id,x:b.pos[0],y:b.pos[1],w:b.size[0],d:b.size[1]});boxes("Interior scale and furniture","furniture",wood,tables,"furniture");
 const trees=[{x:3000,y:5800,r:1400},{x:18500,y:7600,r:1500},{x:19300,y:19000,r:1300},{x:3000,y:25700,r:1200}];
 add("Four garden trees",[...trees.flatMap((t,i)=>{note(`tree_${i}`,`SITE / 수목 ${i+1}`,"garden","tree");return [c("solid.primitive",{id:`tree_${i}`,primitive:"sphere",params:{radius:t.r},position:[t.x,t.y,2700]})];}),style(trees.map((_,i)=>({objectId:`tree_${i}`,name:`SITE / 수목 ${i+1}`})),"house_garden",grass)]);
 add("Garden tree trunks",[...trees.map((t,i)=>{note(`trunk_${i}`,`SITE / 나무 줄기 ${i+1}`,"garden","tree");return c("solid.primitive",{id:`trunk_${i}`,primitive:"cylinder",params:{radius:100,height:1800},position:[t.x,t.y,0]});}),style(trees.map((_,i)=>({objectId:`trunk_${i}`,name:`SITE / 나무 줄기 ${i+1}`})),"house_garden",wood)]);
 return {batches,solids,walls,openings,furniture,trees,stairLayouts:[stairLayout({rise:3000,risers:18,going:250,width:1000,landing:1050}),stairLayout({rise:3300,risers:20,going:230,width:1000,landing:1050})]};
}

