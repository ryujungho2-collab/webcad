import type {CadCommand} from "@agent-webcad/cad-commands";
import {CAFE_SYMBOLS,type CafeSymbol} from "./cafeSymbols";
type P=[number,number];
const rect=(x:number,y:number,w:number,h:number,fill?:string)=>({kind:"polyline" as const,points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]] as P[],closed:true,fill});
/** Original generic exhibition equipment. Dimensions are design envelopes, not product specifications. */
export const GALLERY_SYMBOLS:CafeSymbol[]=[
 ...CAFE_SYMBOLS.filter(s=>["wc","basin","pendant","downlight","plant"].includes(s.id)),
 {id:"sculpture",name:"EX01 Sculpture plinth / diameter1200",category:"equipment",size:[1200,1200],seats:0,shapes:[{kind:"circle",center:[0,0],radius:600,fill:"#d7c4a2"},{kind:"polyline",points:[[-280,-140],[180,-320],[340,200],[-120,330]],closed:true,fill:"#9bafa9"}]},
 {id:"showcase",name:"EX02 Display case / 1800x700",category:"equipment",size:[1800,700],seats:0,shapes:[rect(-900,-350,1800,700,"#d6e3dd"),rect(-830,-280,1660,560),rect(-650,-150,400,300,"#d7c4a2"),rect(220,-150,400,300,"#d7c4a2")]},
 {id:"panel",name:"EX03 Movable exhibition panel / 2400x120",category:"equipment",size:[2400,500],seats:0,shapes:[rect(-1200,-60,2400,120,"#a0b1a4"),rect(-1000,-250,120,500),rect(880,-250,120,500)]},
 {id:"mediabench",name:"EX04 Viewing bench / 1800x550",category:"furniture",size:[1800,550],seats:3,shapes:[rect(-900,-275,1800,550,"#c9b38f"),rect(-840,-215,1680,430),rect(-300,-215,15,430),rect(285,-215,15,430)]},
 {id:"interactive",name:"EX05 Interactive media table / 1400x900",category:"equipment",size:[1400,900],seats:0,shapes:[rect(-700,-450,1400,900,"#b4cbc8"),rect(-630,-380,1260,760),rect(-120,-120,240,240)]},
 {id:"workshop6",name:"EX06 Education table / six places",category:"furniture",size:[2400,2120],seats:6,shapes:[rect(-1200,-500,2400,1000,"#d5b895"),...[-800,0,800].flatMap(x=>[-800,800].map(y=>rect(x-220,y-220,440,440,"#e7ddce")))]},
];
export function gallerySymbolCommands(layerId:string):CadCommand[]{const commands:CadCommand[]=[];for(const s of GALLERY_SYMBOLS){const ids:string[]=[];s.shapes.forEach((shape,i)=>{const id=`asset-gallery-${s.id}-${i}`;ids.push(id);commands.push({type:"create-drawing",id,layerId,drawing:shape.kind,params:{workPlane:"XY",...(shape.kind==="circle"?{center:[...shape.center,0],radius:shape.radius}:{points:shape.points.map(p=>[...p,0]),closed:shape.closed}),vectorStyle:{stroke:"#625744",fill:shape.fill??null,strokeWidth:.18,opacity:1,fillGradient:null}}});});commands.push({type:"define-block",id:`gallery-${s.id}`,name:s.name,objectIds:ids,base:[0,0,0]});for(const objectId of ids)commands.push({type:"set-object-visible",objectId,visible:false});}return commands;}
