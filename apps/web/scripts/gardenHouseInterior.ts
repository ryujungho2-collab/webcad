import {gardenHouseDesign,HOUSE} from './gardenHouseDesign';
import type {CadToolCall} from '../src/copilot/cadToolContract';
type P=[number,number];
export function gardenHouseInterior(){
 const base=gardenHouseDesign(),walls=base.batches.flatMap(b=>b.calls).filter(c=>c.name==='wall.create').map(c=>structuredClone(c.arguments) as any),batches:{label:string;selection:string[];calls:CadToolCall[]}[]=[],solids:{id:string;name:string;level:string;kind:string}[]=[],hidden=['sofa','dining','desk1','desk2','hobbytable','sofa_low'];let seq=0;
 const c=(name:CadToolCall['name'],args:any):CadToolCall=>({id:`repair_${++seq}`,name,arguments:args});
 const angle=(a:P,b:P)=>Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1])*90/Math.PI;
 const miter=(poly:P[],i:number)=>{const a=poly[(i+poly.length-1)%poly.length],b=poly[i],d=poly[(i+1)%poly.length];return angle([b[0]-a[0],b[1]-a[1]],[d[0]-b[0],d[1]-b[1]]);};
 const edits:{selection:string[];call:CadToolCall}[]=[];
 for(const wall of walls.filter(w=>/_w\d/.test(w.id))){const poly=wall.id.startsWith('f2')?HOUSE.upper:HOUSE.outline,i=Number(wall.id.slice(-1));wall.startMiter=miter(poly,i);wall.endMiter=miter(poly,(i+1)%poly.length);edits.push({selection:[wall.id],call:c('wall.update',{objectId:wall.id,height:wall.height,thickness:wall.thickness,baseLevel:wall.baseLevel,startMiter:wall.startMiter,endMiter:wall.endMiter,refreshDrawings:false})});}
 const alter=(id:string,patch:any)=>{const wall=walls.find(w=>w.id===id)!;Object.assign(wall,patch);edits.push({selection:[id],call:c('wall.update',{objectId:id,height:wall.height,thickness:wall.thickness,baseLevel:wall.baseLevel,refreshDrawings:false,...patch})});};
 // Repair real gaps, T junctions and missing room boundaries before any symbols.
 alter('f1_p3',{start:[11300,17675]});alter('f1_p4',{startMiter:45});
 alter('b1_p1',{endMiter:45});alter('b1_p3',{startMiter:45});alter('b1_p4',{end:[11225,19500]});
 const hobby=walls.find(w=>w.id==='b1_p2')!,opening=hobby.openings[0];opening.along=6200;opening.width=1000;
 edits.push({selection:[hobby.id],call:c('wall.opening',{objectId:hobby.id,opening,refreshDrawings:false})});alter('b1_p2',{end:[11000,17125]});
 alter('f2_p3',{endMiter:45});alter('f2_p5',{start:[11300,18200],startMiter:45});alter('f2_p6',{start:[13900,16700]});
 for(let i=0;i<edits.length;i+=6){const group=edits.slice(i,i+6);batches.push({label:'Repair wall ends and junctions '+(i/6+1),selection:[...new Set(group.flatMap(e=>e.selection))],calls:group.map(e=>e.call)});}
 const additional=[{id:'f1_p5',start:[13900,21300],end:[13900,18100],height:3050,thickness:150,baseLevel:0,endMiter:45,openings:[]},{id:'b1_p6',start:[13900,21275],end:[13900,17700],height:2750,thickness:150,baseLevel:-3000,endMiter:45,openings:[]},{id:'b1_p7',start:[11300,17200],end:[11300,21275],height:2750,thickness:150,baseLevel:-3000,startMiter:45,openings:[]}];
 const plaster={name:'Warm mineral plaster',color:'#e8e0d2',roughness:.86,metalness:0,opacity:1};
 for(const w of additional){const level=w.id.startsWith('b1')?'B1':'F1',name=`${level} / ${w.id} · 누락 구획 보완`;walls.push(w);solids.push({id:w.id,name,level,kind:'wall'});batches.push({label:name,selection:[],calls:[c('wall.create',w),c('scene.objects',{objects:[{objectId:w.id,name}],layerId:`house_${level}`,visible:true,finish:plaster})]});}
 // Interior opening frames were static details. Retire them rather than leave them at stale positions.
 base.openings.forEach((o,i)=>{if(o.wallId.includes('_p'))hidden.push(`frame_${i}_a`,`frame_${i}_b`,`frame_${i}_head`);});
 const wood={name:'Ash furniture',color:'#ad8053',roughness:.8,metalness:0,opacity:1},linen={...wood,name:'Linen upholstery',color:'#d6cdbb'},metal={...wood,name:'Furniture steel',color:'#454e49',metalness:.4};
 const boxes:{id:string;name:string;level:string;position:number[];size:number[];finish:any}[]=[];
 const box=(name:string,level:string,position:number[],size:number[],finish=wood)=>{const id=`interior_${boxes.length+1}`;boxes.push({id,name:`${level} / ${name}`,level,position,size,finish});solids.push({id,name:`${level} / ${name}`,level,kind:'furniture'});};
 box('소파 하부','F1',[6100,10800,80],[2900,950,220]);box('소파 등받이','F1',[6100,10800,300],[2900,150,520],linen);for(const x of [6100,8800])box('소파 팔걸이','F1',[x,10800,300],[200,950,260],linen);for(let i=0;i<3;i++)box('소파 좌방석','F1',[6310+i*825,10970,300],[805,750,150],linen);
 for(const id of ['dining','sofa_low','desk1','desk2','hobbytable']){const f=base.furniture.find(f=>f.id===id)!,z=f.level==='B1'?-3000:f.level==='F2'?3300:0,height=id==='sofa_low'?350:id==='hobbytable'?760:id.startsWith('desk')?730:740;box('상판 '+id,f.level,[f.x,f.y,z+height-60],[f.w,f.d,60]);for(const x of [f.x+60,f.x+f.w-130])for(const y of [f.y+60,f.y+f.d-130])box('다리 '+id,f.level,[x,y,z],[70,70,height-60],metal);}
 for(let i=0;i<3;i++)for(const north of [false,true]){const x=6750+i*700,y=north?15120:13550;box('식탁 의자 좌판','F1',[x,y,420],[500,480,60],linen);box('식탁 의자 등받이','F1',[x,north?y+420:y,480],[500,60,380],wood);for(const dx of [40,410])for(const dy of [40,390])box('식탁 의자 다리','F1',[x+dx,y+dy,0],[45,45,420],wood);}
 for(const f of base.furniture.filter(f=>f.id.includes('bed'))){const z=f.level==='F1'?450:3780;box('침대 헤드보드 '+f.id,f.level,[f.x,f.y+f.d-80,z-450],[f.w,80,850]);box('침구 '+f.id,f.level,[f.x+50,f.y+50,z],[f.w-100,f.d-400,70],linen);const n=f.w>=1400?2:1;for(let i=0;i<n;i++)box('베개 '+f.id,f.level,[f.x+100+i*(f.w-150)/n,f.y+f.d-380,z],[Math.min(600,(f.w-250)/n),270,100],linen);}
 for(let i=0;i<boxes.length;i+=10){const group=boxes.slice(i,i+10),styles=new Map<string,typeof boxes>();for(const b of group){const key=b.finish.name;styles.set(key,[...styles.get(key)??[],b]);}batches.push({label:'Recognizable furniture assembly '+(i/10+1),selection:[],calls:[...group.map(b=>c('solid.primitive',{id:b.id,primitive:'box',params:{width:b.size[0],depth:b.size[1],height:b.size[2]},position:b.position})),...[...styles.values()].map(g=>c('scene.objects',{objects:g.map(b=>({objectId:b.id,name:b.name})),layerId:'house_furniture',visible:true,finish:g[0].finish}))]});}
 function annotations(view:{id:string;level:string;origin:readonly number[]}){
  const calls:CadToolCall[]=[],ids:string[]=[],symbols:Record<string,string[]>={},labels:Record<string,string>={};let n=0;const add=(name:CadToolCall['name'],args:any)=>{const id=`${view.id}_detail_${++n}`;ids.push(id);calls.push(c(name,{id,...args}));};
  const poly=(points:number[][],closed=false)=>add('curve.polyline',{plane:'XY',points:points.map(p=>[p[0]+view.origin[0],p[1]+view.origin[1],0]),closed});
  const rect=(x:number,y:number,w:number,d:number)=>poly([[x,y],[x+w,y],[x+w,y+d],[x,y+d]],true);
  const circle=(x:number,y:number,r:number)=>add('curve.circle',{plane:'XY',center:[x+view.origin[0],y+view.origin[1],0],radius:r});
  const text=(x:number,y:number,value:string,height=210)=>add('draft.text',{plane:'XY',point:[x+view.origin[0],y+view.origin[1],0],text:value,height});
  const labelPoints:Record<string,P>={'작업실 · 빛마당':[7300,15800],'취미 라운지':[7800,12800],'보관실':[7200,20700],'설비 / 창고':[15300,20700],'욕실':[10100,18500],'취미실':[15100,16500],'거실 · 남쪽 마당':[9500,11800],'식당':[7400,16200],'주방':[15000,17600],'게스트 / 다목적실':[7400,21000],'화장실 / 세탁실':[9700,18800],'현관':[6900,16900],'팬트리':[15100,20800],'안방':[7300,13800],'드레스룸 / 욕실':[7700,16000],'침실 02':[7100,18550],'침실 03':[15100,17800],'가족 갤러리':[7300,17200],'공용 욕실':[10000,19400],'루프 테라스':[12600,13700]};
  for(const r of HOUSE.rooms.filter(r=>r.level===view.level)){const p=labelPoints[r.name]??[r.x,r.y];text(p[0],p[1],r.name);labels[r.name]=ids[ids.length-1];}
  for(const f of base.furniture.filter(f=>f.level===view.level)){const {x,y,w,d,id}=f,begin=ids.length;rect(x,y,w,d);
   if(id.includes('bed')){rect(x+50,y+50,w-100,d-400);const count=w>=1400?2:1;for(let i=0;i<count;i++)rect(x+100+i*(w-150)/count,y+d-380,Math.min(600,(w-250)/count),270);}
   else if(id==='sofa'){rect(x,y,200,d);rect(x+w-200,y,200,d);rect(x+200,y,w-400,150);for(let i=0;i<3;i++)rect(x+210+i*825,y+170,805,750);}
   else if(id==='dining'){for(let i=0;i<3;i++)for(const py of [y-550,y+d+70]){rect(x+150+i*700,py,500,480);poly([[x+170+i*700,py+60],[x+630+i*700,py+60]]);}}
   else if(id.includes('wc')){rect(x,y+450,w,200);circle(x+w/2,y+220,170);}
   else if(id.includes('basin')){circle(x+w/2,y+d/2,Math.min(w,d)*.29);circle(x+w/2,y+d-60,25);}
   else if(id.includes('bath'))rect(x+100,y+100,w-200,d-200);
   else if(id.includes('shower')){poly([[x,y],[x+w,y+d]]);poly([[x+w,y],[x,y+d]]);circle(x+w/2,y+d/2,35);}
   else if(id.includes('washer'))circle(x+w/2,y+d/2,210);
   else if(id==='island'){rect(x+250,y+200,550,400);circle(x+500,y+400,25);}
   else if(id==='kitchen'){for(const dx of [180,470])for(const dy of [900,1200])circle(x+dx,y+dy,65);}
   else if(id.startsWith('desk'))rect(x+w/2-250,y-530,500,480);symbols[id]=ids.slice(begin);
  }
  for(const w of walls.filter(w=>(w.id.startsWith('b1')?'B1':w.id.startsWith('f1')?'F1':'F2')===view.level)){const len=Math.hypot(w.end[0]-w.start[0],w.end[1]-w.start[1]),u=[(w.end[0]-w.start[0])/len,(w.end[1]-w.start[1])/len],v=[-u[1],u[0]];for(const o of w.openings){if(o.kind!=='door')continue;const start=[w.start[0]+u[0]*(o.along-o.width/2),w.start[1]+u[1]*(o.along-o.width/2)],end=[start[0]+u[0]*o.width,start[1]+u[1]*o.width];
   if(o.id==='gardenSlide'||o.id==='terraceDoor'){for(const sign of [-1,1])poly([[start[0]+v[0]*sign*50,start[1]+v[1]*sign*50],[end[0]+v[0]*sign*50,end[1]+v[1]*sign*50]]);continue;}
   const sign=['bath','hobbyAccess','master','suite','eastHall'].includes(o.id)?-1:1,r=Math.min(o.width,1200);poly([start,[start[0]+v[0]*sign*r,start[1]+v[1]*sign*r]]);poly(Array.from({length:25},(_,i)=>{const t=i*Math.PI/48;return [start[0]+r*(u[0]*Math.cos(t)+v[0]*sign*Math.sin(t)),start[1]+r*(u[1]*Math.cos(t)+v[1]*sign*Math.sin(t))];}));
  }}
  const s=base.stairLayouts[view.level==='B1'?0:1],level=view.level==='F2'?'F1':view.level;for(const solid of base.solids.filter(s=>s.level===level&&s.kind==='stair')){const step=Number(solid.id.match(/tread(\d+)/)?.[1]);if(!step)continue;const per=s.perFlight,flight=step<=per?0:1,tread=flight===0?step-1:step-per-1,going=view.level==='B1'?250:230;rect(flight===0?11500:12700,flight===0?18000+tread*going:18000+s.run-(tread+1)*going,1000,going);}
  poly([[12000,18100],[12000,20200],[13200,20200],[13200,17800]]);poly([[13070,18070],[13200,17800],[13330,18070]]);text(11600,17400,view.level==='F2'?'DN · W1000':'UP · W1000',150);text(1700,13600,'선큰마당 -3.000',200);
  add('draft.linearDimension',{plane:'XY',points:[[5000+view.origin[0],10000+view.origin[1]],[17400+view.origin[0],10000+view.origin[1]]],orientation:'horizontal',offset:-1200,paperScale:50});
  return {ids,symbols,labels,batches:Array.from({length:Math.ceil(calls.length/20)},(_,i)=>({label:`${view.id} architectural symbols ${i+1}`,selection:[],calls:calls.slice(i*20,i*20+20)}))};
 }
 return {batches,solids,walls,hidden,annotations,miter};
}
