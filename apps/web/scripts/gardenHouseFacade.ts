import {gardenHouseDesign,HOUSE} from './gardenHouseDesign';
import type {CadToolCall} from '../src/copilot/cadToolContract';
type P=[number,number];
export function gardenHouseFacade(){
 const base=gardenHouseDesign(),batches:{label:string;calls:CadToolCall[]}[]=[],solids:{id:string;name:string;level:string;kind:string}[]=[],leaves:{id:string;hostId:string;length:number;thickness:number;height:number;openings:any[]}[]=[];let sequence=0;
 const c=(name:CadToolCall['name'],args:any):CadToolCall=>({id:`facade_${++sequence}`,name,arguments:args});
 const stone={name:'Honed warm limestone exterior',color:'#b5afa0',roughness:.92,metalness:0,opacity:1},wood={name:'Oiled cedar rainscreen',color:'#90623f',roughness:.84,metalness:0,opacity:1},dark={name:'Bronze exterior flashings',color:'#303c39',roughness:.54,metalness:.55,opacity:1},plinth={name:'Basalt plinth',color:'#747870',roughness:.94,metalness:0,opacity:1};
 const style=(ids:string[],finish:any)=>c('scene.objects',{objects:ids.map(id=>({objectId:id,name:solids.find(s=>s.id===id)!.name})),layerId:'house_facade',visible:true,finish});
 const note=(id:string,name:string,level:string,kind='facade')=>solids.push({id,name,level,kind});
 batches.push({label:'Exterior envelope layer',calls:[c('scene.layer',{id:'house_facade',name:'외벽 · 외장 / 물끊기 / 문',color:'#90623f'})]});
 function offset(poly:P[],distance:number):P[]{return poly.map((v,i)=>{const previous=poly[(i+poly.length-1)%poly.length],next=poly[(i+1)%poly.length],a=[v[0]-previous[0],v[1]-previous[1]],b=[next[0]-v[0],next[1]-v[1]],la=Math.hypot(...a),lb=Math.hypot(...b),na=[a[1]/la,-a[0]/la],nb=[b[1]/lb,-b[0]/lb],k=distance/(1+na[0]*nb[0]+na[1]*nb[1]);return [v[0]+(na[0]+nb[0])*k,v[1]+(na[1]+nb[1])*k];});}
 const miter=(poly:P[],i:number)=>{const a=poly[(i+poly.length-1)%poly.length],b=poly[i],c=poly[(i+1)%poly.length],u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-b[0],c[1]-b[1]];return Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1])*90/Math.PI;};
 const hosts=base.batches.flatMap(b=>b.calls).filter(c=>c.name==='wall.create'&&/^f[12]_w/.test(String(c.arguments.id)));
 for(const stage of ['skin','base','band'] as const){
  const calls:CadToolCall[]=[],stageIds:string[]=[];
  for(const host of hosts){const a=host.arguments as any,level=a.id.startsWith('f1')?'F1':'F2';if(stage!=='skin'&&level==='F2')continue;
   const t=stage==='skin'?(level==='F1'?70:45):stage==='base'?100:45,poly=level==='F1'?HOUSE.outline:HOUSE.upper,edge=Number(a.id.slice(-1)),out=offset(poly,100+40+t/2),start=out[edge],end=out[(edge+1)%poly.length],len=Math.hypot(end[0]-start[0],end[1]-start[1]),ux=(end[0]-start[0])/len,uy=(end[1]-start[1])/len,shift=(a.start[0]-start[0])*ux+(a.start[1]-start[1])*uy;
   const baseLevel=stage==='skin'?a.baseLevel:stage==='base'?-180:3000,height=stage==='skin'?a.height:stage==='base'?480:300;
   const openings=stage==='skin'?a.openings.map((o:any)=>({...o,id:`ext_${stage}_${o.id}`,along:o.along+shift})):stage==='base'?a.openings.filter((o:any)=>o.kind==='door').map((o:any)=>({...o,id:`ext_${stage}_${o.id}`,kind:'door',along:o.along+shift,sill:0,height:480})):[];
   const id=`ext_${stage}_${a.id}`,name=`${level} / ${stage==='skin'?(level==='F1'?'석재 외벽':'목재 외벽'):stage==='base'?'기단 마감':'층간 물끊기'} ${edge+1}`;note(id,name,level);stageIds.push(id);leaves.push({id,hostId:a.id,length:len,thickness:t,height,openings});calls.push(c('wall.create',{id,start,end,height,thickness:t,baseLevel,openings,startMiter:miter(poly,edge),endMiter:miter(poly,(edge+1)%poly.length)}));
  }
  // At most 12 leaf walls + their one material command fit the shared Review budget.
  if(stage==='skin'){
   const lower=stageIds.filter(id=>id.includes('f1')),upper=stageIds.filter(id=>id.includes('f2'));calls.push(style(lower,stone),style(upper,wood));
  }else calls.push(style(stageIds,stage==='base'?plinth:dark));batches.push({label:`Exterior ${stage} · openings retained`,calls});
 }
 function extrudedRectangle(id:string,name:string,level:string,a:any,along:number,width:number,depthFrom:number,depthTo:number,z:number,height:number,finish:any,kind='frame'){
  const length=Math.hypot(a.end[0]-a.start[0],a.end[1]-a.start[1]),ux=(a.end[0]-a.start[0])/length,uy=(a.end[1]-a.start[1])/length,nx=uy,ny=-ux;
  const points=[[-width/2,depthFrom],[width/2,depthFrom],[width/2,depthTo],[-width/2,depthTo]].map(([u,v])=>[a.start[0]+ux*(along+u)+nx*v,a.start[1]+uy*(along+u)+ny*v,z]);note(id,name,level,kind);
  batches.push({label:name,calls:[c('curve.polyline',{id:`${id}_p`,plane:'XY',closed:true,points}),c('solid.extrude',{id,profileObjectIds:[`${id}_p`],distance:height}),style([id],finish),c('scene.objects',{objects:[{objectId:`${id}_p`}],layerId:'layer-default',visible:false})]});
 }
 for(const host of hosts){const a=host.arguments as any,level=a.id.startsWith('f1')?'F1':'F2';for(const o of a.openings){if(o.kind==='window'){
  extrudedRectangle(`ext_sill_${o.id}`,`${level} / ${o.id} 경사 전 물끊기`,level,a,o.along,o.width+160,65,280,a.baseLevel+o.sill-50,50,dark);
  extrudedRectangle(`ext_head_${o.id}`,`${level} / ${o.id} 창 상부 후드`,level,a,o.along,o.width+180,80,310,a.baseLevel+o.sill+o.height+20,55,dark);
 }if(o.id==='bridgeEntry')extrudedRectangle('ext_entry_door','F1 / 현관 원목 문짝 · 닫힘',level,a,o.along,1200,-30,30,0,2350,wood,'door');}}
 // Narrow cedar battens on the two most visible upper elevations, with real gaps at windows.
 for(const host of hosts.filter(h=>['f2_w0','f2_w5'].includes(String(h.arguments.id)))){const a=host.arguments as any,len=Math.hypot(a.end[0]-a.start[0],a.end[1]-a.start[1]);for(let along=240;along<len-200;along+=420){let ranges:[[number,number]]|[number,number][]=[[3380,6200]];for(const o of a.openings){if(Math.abs(along-o.along)>o.width/2+35)continue;const low=3300+o.sill,high=low+o.height;ranges=ranges.flatMap(([b,t])=>[[b,Math.min(t,low)],[Math.max(b,high),t]].filter(([b,t])=>t-b>80) as [number,number][]);}for(const [j,[bottom,top]]of ranges.entries())extrudedRectangle(`ext_batten_${a.id}_${along}_${j}`,`F2 / 삼나무 세로 줄눈 ${a.id} ${along}`, 'F2',a,along,30,185,207,bottom,top-bottom,wood,'frame');}}
 const compact:typeof batches=[];for(let i=0;i<batches.length;){if(batches[i].calls[0].name!=="curve.polyline"){compact.push(batches[i++]);continue;}const group=[];while(i<batches.length&&batches[i].calls[0].name==="curve.polyline"&&group.length<4)group.push(batches[i++]);const styles=group.map(b=>b.calls[2]),hidden=group.map(b=>b.calls[3].arguments.objects as any[]).flat();compact.push({label:group.map(b=>b.label).join(" / "),calls:[...group.flatMap(b=>b.calls.slice(0,2)),...styles,c("scene.objects",{objects:hidden,layerId:"layer-default",visible:false})]});}
 return {batches:compact,solids,leaves};
}
