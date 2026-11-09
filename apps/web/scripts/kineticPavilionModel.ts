import {Matrix4,Euler,Quaternion,Vector3,MathUtils} from "three";
import type {CadDocument,JointInput,CadObjectTransform} from "@agent-webcad/cad-document";
import {assemblyMatrix,evaluateAssembly} from "../src/state/assemblyCommands";

/** Millimetres, Z up. Every member is an independent exact box, including glass. */
export function createKineticPavilion(){
 const d:CadDocument={id:"good-boy-kinetic-pavilion",revision:0,objects:{},features:{},layers:{},rootObjects:[],rootLayers:[],assembly:{version:1,grounded:["slab"],joints:{}}};
 const palette={concrete:"#c5bfae",steel:"#344a49",timber:"#b7743e",glass:"#8bcacb",roof:"#e7dfcb",landscape:"#718b65"};
 for(const [id,color]of Object.entries(palette)){d.layers[id]={id,name:id,visible:true,locked:false,objectIds:[],style:{color,lineType:"continuous",lineWeight:.25}};d.rootLayers.push(id);}
 const box=(id:string,size:[number,number,number],at:[number,number,number],layerId:keyof typeof palette)=>{
  d.objects[id]={id,name:id,geometryId:"g-"+id,visible:true,layerId,transform:{translation:at,rotation:[0,0,0],scale:[1,1,1]}};
  d.features["f-"+id]={id:"f-"+id,type:"primitive",inputs:[],output:id,params:{kind:"box",width:size[0],depth:size[1],height:size[2]}};d.rootObjects.push(id);d.layers[layerId].objectIds.push(id);return id;
 };
 const pose=(m:Matrix4):CadObjectTransform=>{const p=new Vector3(),q=new Quaternion(),s=new Vector3();m.decompose(p,q,s);const e=new Euler().setFromQuaternion(q,"XYZ");return {translation:p.toArray().map(n=>Object.is(n,-0)?0:n) as [number,number,number],rotation:[e.x,e.y,e.z].map(MathUtils.radToDeg).map(n=>Object.is(n,-0)?0:n) as [number,number,number],scale:[1,1,1]};};
 const bind=(j:JointInput)=>{d.assembly!.joints[j.id]={...j,angle:j.angle??0,rest:pose(assemblyMatrix(d.objects[j.parentId].transform!).invert().multiply(assemblyMatrix(d.objects[j.childId].transform!)))};};
 const fixed=(childId:string,parentId="slab")=>bind({id:"bind-"+childId,type:"fixed",parentId,childId,origin:[0,0,0],axis:[0,0,1],angle:0});
 box("slab",[6000,4200,180],[0,0,-180],"concrete");
 for(const x of [0,5880])for(const y of [0,4080])fixed(box(`column-${x}-${y}`,[120,120,3000],[x,y,0],"steel"));
 for(const y of [0,4080])fixed(box("beam-y-"+y,[6000,120,120],[0,y,3000],"steel"));
 for(const x of [0,5880])fixed(box("beam-x-"+x,[120,3960,120],[x,120,3000],"steel"));
 fixed(box("rear-transom",[5640,80,100],[180,4070,2700],"steel"));
 for(let i=0;i<12;i++){
  const x=180+i*465,id=box("louver-"+(i+1),[420,32,2300],[x,4010,300],"timber"),jointId="louver-drive-"+(i+1);
  bind({id:jointId,type:"revolute",parentId:"slab",childId:id,origin:[x+210,4026,480],axis:[0,0,1],angle:0,min:0,max:75,...i?{coupling:{driverId:"louver-drive-"+i,ratio:1,offset:0}}:{}});
  fixed(box(id+"-cap",[420,40,16],[x,4006,2600],"steel"),id);
 }
 for(const [side,x,ratio]of [["left",1900,-1100/75],["right",3020,1]] as const){
  const glass=box("door-"+side,[1000,18,2170],[x+40,121,140],"glass");
  bind({id:"slide-"+side,type:"prismatic",parentId:"slab",childId:glass,origin:[x,120,280],axis:[1,0,0],offset:0,min:side==="left"?-1100:0,max:side==="left"?0:1100,coupling:{driverId:side==="left"?"louver-drive-1":"slide-left",ratio:side==="left"?ratio:-1,offset:0}});
  fixed(box("door-"+side+"-jamb-l",[40,40,2250],[x,110,100],"steel"),glass);
  fixed(box("door-"+side+"-jamb-r",[40,40,2250],[x+1040,110,100],"steel"),glass);
  for(const z of [100,2310])fixed(box("door-"+side+"-rail-"+z,[1000,40,40],[x+40,110,z],"steel"),glass);
 }
 fixed(box("door-guide",[5700,60,60],[150,90,2420],"steel"));
 fixed(box("door-threshold",[5700,80,30],[150,90,50],"steel"));
 for(let bay=0;bay<4;bay++){
  const x=30+bay*1480,inner=box("canopy-inner-"+bay,[1450,1000,60],[x,2100,3200],"roof"),outer=box("canopy-outer-"+bay,[1450,1000,60],[x,3110,3200],"roof");
  fixed(box("canopy-static-"+bay,[1450,2000,60],[x,50,3200],"roof"));
  bind({id:"roof-lift-"+bay,type:"revolute",parentId:"slab",childId:inner,origin:[x,2100,3380],axis:[1,0,0],angle:0,min:0,max:55,coupling:{driverId:"slide-left",ratio:-55/1100,offset:0}});
  bind({id:"roof-fold-"+bay,type:"revolute",parentId:inner,childId:outer,origin:[0,1010,0],axis:[1,0,0],angle:0,min:-110,max:0,coupling:{driverId:"roof-lift-"+bay,ratio:-2,offset:0}});
 }
 for(const [n,x]of [[1,300],[2,4400]] as const){fixed(box("bench-seat-"+n,[1300,450,80],[x,650,430],"timber"));for(const dx of [80,1100])fixed(box(`bench-foot-${n}-${dx}`,[120,350,430],[x+dx,700,0],"steel"));}
 for(const x of [250,5200]){fixed(box("planter-"+x,[550,900,450],[x,2600,0],"concrete"));fixed(box("plant-"+x,[450,800,320],[x+50,2650,450],"landscape"));}
 evaluateAssembly(d,undefined,true);return d;
}

