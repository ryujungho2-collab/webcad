import type {CadCommand} from "@agent-webcad/cad-commands";

type Point=[number,number];
type Shape={kind:"polyline";points:Point[];closed:boolean;fill?:string}|{kind:"circle";center:Point;radius:number;fill?:string};
export type CafeSymbol={id:string;name:string;category:"furniture"|"equipment"|"sanitary"|"lighting"|"service";size:Point;seats:number;shapes:Shape[]};
const rect=(x:number,y:number,w:number,h:number,fill?:string):Shape=>({kind:"polyline",points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],closed:true,fill});
const line=(...points:Point[]):Shape=>({kind:"polyline",points,closed:false});
const circle=(x:number,y:number,r:number,fill?:string):Shape=>({kind:"circle",center:[x,y],radius:r,fill});
const chair=(x:number,y:number,angle=0):Shape[]=>{
 const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),map=([u,v]:Point):Point=>[x+u*c-v*s,y+u*s+v*c];
 return [rect(-220,-220,440,440,"#eee9de"),line([-220,260],[220,260])].map(shape=>shape.kind==="polyline"?{...shape,points:shape.points.map(map)}:shape);
};
/** Dimensioned original CAD symbols. Equipment envelopes are generic design assumptions, not manufacturer specifications. */
export const CAFE_SYMBOLS:CafeSymbol[]=[
 {id:"chair",name:"F01 Dining chair",category:"furniture",size:[440,480],seats:1,shapes:chair(0,0)},
 {id:"table2",name:"F02 Two-seat setting",category:"furniture",size:[1620,700],seats:2,shapes:[rect(-300,-350,600,700,"#d8c5a9"),...chair(-550,0,90),...chair(550,0,-90)]},
 {id:"table4",name:"F03 Four-seat setting",category:"furniture",size:[1200,1820],seats:4,shapes:[rect(-600,-350,1200,700,"#d8c5a9"),...[-350,350].flatMap(x=>[...chair(x,-650,180),...chair(x,650)])]},
 {id:"communal8",name:"F04 Eight-seat communal table",category:"furniture",size:[3000,2120],seats:8,shapes:[rect(-1500,-500,3000,1000,"#d8c5a9"),...[-1125,-375,375,1125].flatMap(x=>[...chair(x,-800,180),...chair(x,800)])]},
 {id:"lounge4",name:"F05 Four-seat lounge",category:"furniture",size:[2100,1720],seats:4,shapes:[circle(0,0,350,"#cec5b9"),...[-750,750].flatMap(x=>[-550,550].flatMap(y=>[rect(x-300,y-300,600,600,"#e1d9ca"),line([x-280,y+320],[x+280,y+320])]))]},
 {id:"stool",name:"F06 Counter stool",category:"furniture",size:[400,400],seats:1,shapes:[circle(0,0,200,"#d8c5a9"),circle(0,0,130)]},
 {id:"espresso",name:"K01 Espresso machine 900",category:"equipment",size:[900,650],seats:0,shapes:[rect(-450,-325,900,650,"#deded8"),rect(-400,-270,800,100),...[-260,0,260].flatMap(x=>[circle(x,20,65),line([x,20],[x,230])])]},
 {id:"grinder",name:"K02 Grinder 250",category:"equipment",size:[250,350],seats:0,shapes:[rect(-125,-175,250,350,"#deded8"),circle(0,0,95),line([-75,-130],[75,-130])]},
 {id:"fridge",name:"K03 Under-counter refrigerator",category:"equipment",size:[600,650],seats:0,shapes:[rect(-300,-325,600,650,"#deded8"),line([-260,-280],[260,-280]),line([190,-240],[190,-100])]},
 {id:"sink",name:"K04 Double sink",category:"equipment",size:[1200,650],seats:0,shapes:[rect(-600,-325,1200,650),rect(-540,-245,480,450),rect(60,-245,480,450),circle(-300,-20,35),circle(300,-20,35)]},
 {id:"display",name:"K05 Pastry display",category:"equipment",size:[1800,750],seats:0,shapes:[rect(-900,-375,1800,750,"#efe7d8"),rect(-840,-315,1680,630),...[-560,0,560].map(x=>rect(x-230,-230,460,460))]},
 {id:"dishwasher",name:"K06 Dishwasher",category:"equipment",size:[600,650],seats:0,shapes:[rect(-300,-325,600,650),rect(-240,-260,480,500),line([-240,-260],[240,240]),line([-240,240],[240,-260])]},
 {id:"wc",name:"S01 WC envelope",category:"sanitary",size:[420,650],seats:0,shapes:[rect(-210,170,420,180),circle(0,-100,200),line([-190,-100],[-190,170],[190,170],[190,-100])]},
 {id:"basin",name:"S02 Wash basin",category:"sanitary",size:[600,500],seats:0,shapes:[rect(-300,-250,600,500),circle(0,0,165),circle(0,0,20)]},
 {id:"pendant",name:"L01 Pendant",category:"lighting",size:[240,240],seats:0,shapes:[circle(0,0,120),line([-85,-85],[85,85]),line([-85,85],[85,-85])]},
 {id:"downlight",name:"L02 Downlight",category:"lighting",size:[120,120],seats:0,shapes:[circle(0,0,60),circle(0,0,25)]},
 {id:"linear",name:"L03 Linear light 1200",category:"lighting",size:[1200,80],seats:0,shapes:[rect(-600,-40,1200,80),line([-550,0],[550,0])]},
 {id:"outlet",name:"E01 Power/data point",category:"service",size:[260,160],seats:0,shapes:[circle(0,0,80),line([-35,-35],[-35,35]),line([35,-35],[35,35]),line([80,0],[180,0])]},
 {id:"drain",name:"P01 Floor drain",category:"service",size:[200,200],seats:0,shapes:[rect(-100,-100,200,200),line([-100,-100],[100,100]),line([-100,100],[100,-100])]},
 {id:"plant",name:"F07 Planter",category:"furniture",size:[640,640],seats:0,shapes:[circle(0,0,320,"#e1e7d9"),...Array.from({length:7},(_,i)=>circle(150*Math.cos(i*Math.PI*2/7),150*Math.sin(i*Math.PI*2/7),110))]},
];

export function cafeSymbolCommands(layerId:string):CadCommand[]{
 const commands:CadCommand[]=[];
 for(const symbol of CAFE_SYMBOLS){const ids:string[]=[];symbol.shapes.forEach((shape,i)=>{
  const id=`asset-${symbol.id}-${i}`;ids.push(id);
  const params=shape.kind==="circle"?{center:[...shape.center,0],radius:shape.radius}:{points:shape.points.map(p=>[...p,0]),closed:shape.closed};
  commands.push({type:"create-drawing",id,layerId,drawing:shape.kind,params:{...params,workPlane:"XY",vectorStyle:{stroke:"#4b4943",fill:shape.fill??null,fillGradient:null,opacity:1,strokeWidth:.18}}});
 });
 commands.push({type:"define-block",id:`cafe-${symbol.id}`,name:symbol.name,objectIds:ids,base:[0,0,0]});
 for(const objectId of ids)commands.push({type:"set-object-visible",objectId,visible:false});
 }
 return commands;
}
