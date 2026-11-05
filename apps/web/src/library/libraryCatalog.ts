import type {CadBlock,CadVectorStyle} from "@agent-webcad/cad-document";
export type LibraryItem={id:string;name:string;category:string;source:string;license:string;block?:CadBlock;style?:CadVectorStyle;hatch?:{spacing:number;angle:number}};
const identity=()=>({translation:[0,0,0] as [number,number,number],rotation:[0,0,0] as [number,number,number],scale:[1,1,1] as [number,number,number]});
const line=(a:number[],b:number[])=>({type:"drawing" as const,params:{kind:"line",workPlane:"XY",points:[[...a,0],[...b,0]]},transform:identity(),layerId:"layer-default"});
const rect=(x:number,y:number,w:number,h:number)=>({type:"drawing" as const,params:{kind:"rectangle",workPlane:"XY",points:[[x,y,0],[x+w,y,0],[x+w,y+h,0],[x,y+h,0]],closed:true},transform:identity(),layerId:"layer-default"});
const block=(id:string,name:string,category:string,members:CadBlock["members"]):LibraryItem=>({id,name,category,source:"Agent WebCAD original",license:"Original project sample",block:{id,name,workPlane:"XY",members}});
const style=(id:string,name:string,width:number):LibraryItem=>({id,name,category:"Line styles",source:"Agent WebCAD original",license:"Original project sample",style:{stroke:"#202020",fill:null,fillGradient:null,opacity:1,strokeWidth:width}});
export const libraryCatalog:LibraryItem[]=[
 block("door-900","Door 900 · 문","Doors",[rect(0,0,900,40),line([0,0],[0,900]),{...line([0,0],[0,0]),params:{kind:"arc",workPlane:"XY",center:[0,0,0],radius:900,startAngle:0,endAngle:Math.PI/2}}]),
 block("window-1200","Window 1200 · 창","Windows",[rect(0,0,1200,150),line([0,50],[1200,50]),line([0,100],[1200,100])]),
 block("table-1200","Table 1200×600 · 가구","Furniture",[rect(0,0,1200,600),rect(50,50,1100,500)]),
 block("a3-frame","A3 frame · 도곽","Frames",[rect(0,0,420,297),rect(10,10,400,277),rect(280,10,130,30),line([280,25],[410,25])]),
 style("fine-line","Fine line · 가는 선",.18),style("cut-line","Cut line · 절단선",.5),
 {id:"hatch-45",name:"Hatch 45° · 해치",category:"Hatches",source:"Agent WebCAD original",license:"Original project sample",hatch:{spacing:5,angle:45}},
];
