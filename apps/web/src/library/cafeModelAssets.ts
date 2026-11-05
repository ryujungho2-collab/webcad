import type {SolidFinish} from "@agent-webcad/cad-document";

export type ModelPiece={name:string;kind:"box"|"cylinder"|"sphere";params:Record<string,number>;position:[number,number,number];rotation?:[number,number,number];finish:SolidFinish};
const finish=(name:string,color:string,roughness=.65,metalness=0,opacity=1):SolidFinish=>({name,color,roughness,metalness,opacity});
export const CAFE_FINISHES={
 oak:finish("Oak / WL-02","#b48a5b"),white:finish("Warm white / WL-01","#ece7dc"),
 floor:finish("Porcelain / FL-01","#d6cbb9",.8),wet:finish("Wet tile / FL-03","#a7b5a7",.5),
 concrete:finish("Concrete slab","#a7a49b",.9),metal:finish("Brushed stainless steel","#a8afb1",.28,.8),
 dark:finish("Graphite powder coat","#3e4544",.6,.2),fabric:finish("Sand upholstery","#c4b395",.95),
 glass:finish("Clear glazing","#a6cbd1",.08,0,.23),leaf:finish("Foliage","#58735a",.9),
 light:finish("Opal diffuser","#fff1ce",.3),ceramic:finish("Sanitary ceramic","#f4f2e9",.25),
};

/** Original dimensioned BRep recipes. Heights are explicit modeling assumptions; XY matches the 2D symbol. */
export function cafeModelAsset(symbol:string):ModelPiece[]{
 const p:ModelPiece[]=[],m=CAFE_FINISHES;
 const box=(name:string,x:number,y:number,z:number,w:number,d:number,h:number,finish=m.oak)=>p.push({name,kind:"box",params:{width:w,depth:d,height:h},position:[x,y,z],finish});
 const cyl=(name:string,x:number,y:number,z:number,r:number,h:number,finish=m.dark)=>p.push({name,kind:"cylinder",params:{radius:r,height:h},position:[x,y,z],finish});
 const chair=(x:number,y:number,a=0,lounge=false)=>{
  const start=p.length,w=lounge?600:440,d=lounge?600:440,z=lounge?400:450;
  box("Seat",-w/2,-d/2,z,w,d,60,m.fabric);
  box("Back",-w/2,d/2-45,z+60,w,45,lounge?280:340,m.oak);
  for(const dx of [-w/2+45,w/2-75])for(const dy of [-d/2+45,d/2-75])box("Leg",dx,dy,0,30,30,z,m.dark);
  const c=Math.cos(a*Math.PI/180),s=Math.sin(a*Math.PI/180);
  for(const part of p.slice(start)){const [u,v]=part.position;part.position[0]=x+u*c-v*s;part.position[1]=y+u*s+v*c;part.rotation=[0,0,a];}
 };
 const table=(w:number,d:number,h=740)=>{box("Tabletop",-w/2,-d/2,h-35,w,d,35);for(const x of [-w/2+65,w/2-110])for(const y of [-d/2+65,d/2-110])box("Table leg",x,y,0,45,45,h-35,m.dark);};
 switch(symbol){
  case "chair":chair(0,0);break;
  case "table2":table(600,700);chair(-550,0,90);chair(550,0,-90);break;
  case "table4":table(1200,700);for(const x of [-350,350]){chair(x,-650,180);chair(x,650);}break;
  case "communal8":table(3000,1000);for(const x of [-1125,-375,375,1125]){chair(x,-800,180);chair(x,800);}break;
  case "lounge4":cyl("Coffee tabletop",0,0,400,350,35,m.oak);cyl("Table pedestal",0,0,0,65,400);for(const x of [-750,750])for(const y of [-550,550])chair(x,y,y<0?180:0,true);break;
  case "stool":cyl("Stool seat",0,0,710,200,40,m.oak);cyl("Stool stem",0,0,35,35,675);cyl("Stool foot",0,0,0,180,35);break;
  case "espresso":box("Machine body",-450,-325,900,900,650,500,m.metal);box("Control fascia",-420,-340,1120,840,30,180,m.dark);box("Drip tray",-420,-360,915,840,130,35,m.dark);break;
  case "grinder":box("Grinder base",-125,-175,900,250,350,300,m.dark);cyl("Hopper",0,0,1200,95,250,m.glass);break;
  case "fridge":case "dishwasher":box("Appliance cabinet",-300,-325,0,600,650,850,m.metal);box("Door panel",-285,-340,100,570,20,700,m.metal);box("Handle",170,-380,610,25,40,160,m.dark);break;
  case "display":box("Display base",-900,-375,900,1800,750,100);box("Display glazing",-900,-375,1000,1800,750,650,m.glass);for(const z of [1050,1300,1550])box("Display shelf",-840,-315,z,1680,630,15,m.metal);break;
  case "sink":case "basin":{
   const w=symbol==="sink"?1200:600,d=symbol==="sink"?650:500;
   // A rim and a recessed bowl, rather than a solid countertop hiding the basin.
   box("Front rim",-w/2,-d/2,850,w,40,35,m.ceramic);box("Back rim",-w/2,d/2-40,850,w,40,35,m.ceramic);
   box("Left rim",-w/2,-d/2+40,850,40,d-80,35,m.ceramic);box("Right rim",w/2-40,-d/2+40,850,40,d-80,35,m.ceramic);
   box("Bowl bottom",-w/2+40,-d/2+40,700,w-80,d-80,25,m.ceramic);cyl("Tap",0,d/2-65,885,18,210,m.metal);break;
  }
  case "wc":box("Cistern",-210,170,0,420,180,800,m.ceramic);cyl("WC bowl",0,-100,0,200,410,m.ceramic);cyl("Seat",0,-100,410,200,35,m.white);break;
  case "pendant":cyl("Pendant shade",0,0,2600,120,200,m.dark);cyl("Diffuser",0,0,2590,110,12,m.light);cyl("Suspension",0,0,2800,4,400,m.dark);break;
  case "downlight":cyl("Downlight trim",0,0,3180,60,20,m.white);cyl("Lens",0,0,3175,48,6,m.light);break;
  case "linear":box("Linear housing",-600,-40,3100,1200,80,65,m.dark);box("Linear diffuser",-580,-30,3095,1160,60,6,m.light);break;
  case "outlet":box("Floor box",-80,-80,0,160,160,8,m.metal);break;
  case "drain":box("Drain cover",-100,-100,0,200,200,8,m.metal);break;
  case "plant":cyl("Planter",0,0,0,320,550,m.white);cyl("Trunk",0,0,550,35,600,m.oak);for(const [x,y,z,r]of [[0,0,1250,260],[-150,40,1000,170],[140,-50,1150,180]])p.push({name:"Foliage",kind:"sphere",params:{radius:r},position:[x,y,z],finish:m.leaf});break;
  default:throw Error(`No 3D recipe for symbol ${symbol}.`);
 }
 return p;
}
