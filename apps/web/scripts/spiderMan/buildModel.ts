// Spider-Man poseable figure — geometry + kinematic rig through real CAD commands and the OCCT kernel.
// Run: npx tsx scripts/spiderMan/buildModel.ts  (from apps/web)
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {serializeDocument} from '@agent-webcad/cad-document';
import {cadDocument} from '../../src/state/cadDocument';
import {dispatchCadCommand} from '../../src/state/dispatchCadCommand';
import {resetTestDocument} from '../../tests/helpers/documentHarness';
import {fitSpline} from '../../src/precision/fitSpline';
import * as D from './design';
import type {Sec,Plane,V3} from './design';

export const OUT=resolve('../../output/projects/spider-man');
const t0=performance.now(),log:string[]=[];
const note=(s:string)=>{const line=`[${((performance.now()-t0)/1000).toFixed(1)}s] ${s}`;log.push(line);console.log(line);};
const run=async(c:any)=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,`${c.type} ${c.id??c.joint?.id??''}: ${(r as any).reason}`);return r;};

export const LAYERS={
  ref:'00-REF-proportion', secAxial:'10-SEC-head-torso', secArm:'11-SEC-arms-hands', secLeg:'12-SEC-legs-feet', zone:'13-SEC-suit-zones',
  red:'20-SUIT-red', blue:'21-SUIT-blue', black:'22-SUIT-web-black', lens:'23-SUIT-lens', rig:'30-RIG-joint-nodes', stand:'40-DISPLAY-base', cons:'90-construction',
};
type Side='L'|'R';
const mx=(p:V3,side:Side):V3=>side==='L'?p:[-p[0],p[1],p[2]];
const maxis=(a:V3,side:Side):V3=>side==='L'?a:[a[0],-a[1],-a[2]];

// ---------- section → closed C2 spline
const N=24;
function sectionPoints(s:Sec,plane:Plane,grow=0):V3[]{
  const n=s.n??2,pts:V3[]=[];
  for(let i=0;i<N;i++){
    const t=i/N*2*Math.PI,c=Math.cos(t),sn=Math.sin(t);
    let u=Math.sign(c)*Math.pow(Math.abs(c),2/n)*(c<0?s.a[0]:s.a[1]),v=Math.sign(sn)*Math.pow(Math.abs(sn),2/n)*(sn<0?s.b[0]:s.b[1]);
    let f=1;const deg=t*180/Math.PI;
    for(const [ang,amp,w] of s.bumps??[]){let d=Math.abs(deg-ang)%360;if(d>180)d=360-d;f+=amp*Math.exp(-((d/w)**2));}
    u*=f;v*=f;if(s.flatV!==undefined)v=Math.max(v,-s.flatV);
    const r=Math.hypot(u,v)||1;u+=grow*u/r;v+=grow*v/r;
    const U=s.c[0]+u,V=s.c[1]+v;
    pts.push(plane==='XY'?[U,V,s.at]:plane==='YZ'?[s.at,U,V]:[U,s.at,V]);
  }
  return pts;
}
const secLayer=(plane:Plane,id:string)=>/^(L|R)-(thigh|shin|foot|toe)/.test(id)?LAYERS.secLeg:plane==='YZ'||/thumb/.test(id)?LAYERS.secArm:LAYERS.secAxial;
let uid=0;
/** Loft through anatomical sections; every copy draws its own 2D sections (drawn first, kept on SEC layers). */
async function loft(id:string,plane:Plane,secs:Sec[],side:Side='L',grow=0,outId?:string){
  const ids:string[]=[],first=!cadDocument.objects[`${id}.s0`];
  const tag=first?id:`${id}~${++uid}`;
  for(const [i,s] of secs.entries()){
    const pts=sectionPoints(s,plane,grow).map(p=>mx(p,side));
    const sid=`${tag}.s${i}`;ids.push(sid);
    await run({type:'create-drawing',id:sid,name:`${id} section ${i}`,drawing:'spline',layerId:first?secLayer(plane,id):LAYERS.cons,params:{...fitSpline(pts,true,1,'C2'),workPlane:plane}});
  }
  const out=outId??`${tag}#loft`;await run({type:'create-loft',id:out,layerId:LAYERS.cons,profileObjectIds:ids});return out;
}
async function sphere(id:string,center:V3,r:number,layer=LAYERS.cons){await run({type:'create-primitive',id,primitive:'sphere',params:{radius:r},position:center,layerId:layer});return id;}
async function union(target:string,tool:string,id=`u${++uid}`){await run({type:'boolean-operation',operation:'union',target,tool,id});return id;}
async function bool(op:'cut'|'intersect',target:string,tool:string,id=`b${++uid}`){await run({type:'boolean-operation',operation:op,target,tool,id});return id;}
/** Prism from a closed polyline: XY extrudes +Z, YZ +X, XZ −Y (verified). */
async function prism(id:string,plane:Plane,uv:[number,number][],at:number,dist:number,layer=LAYERS.cons){
  const pts=uv.map(([u,v])=>plane==='XY'?[u,v,at]:plane==='YZ'?[at,u,v]:[u,at,v]);
  await run({type:'create-drawing',id:`${id}.p`,name:`${id} profile`,drawing:'polyline',layerId:layer===LAYERS.cons?LAYERS.cons:LAYERS.zone,params:{kind:'polyline',workPlane:plane,closed:true,points:pts}});
  await run({type:'create-extrude',id,layerId:LAYERS.cons,profileObjectIds:[`${id}.p`],distance:dist});return id;
}

// ---------- suit zones (world rest frame)
function torsoRedProfile():[number,number][]{
  const right:[number,number][]=[];for(let z=1390;z>=1000;z-=13)right.push([D.torsoRedHalfWidth(z),z]);if(right.at(-1)![1]!==1000)right.push([D.torsoRedHalfWidth(1000),1000]);
  return [[-400,1700],[400,1700],[400,1392],...right,...right.slice().reverse().map(([x,z])=>[-x,z] as [number,number]),[-400,1392]];
}
const torsoZone=(id:string)=>prism(id,'XZ',torsoRedProfile(),300,600);
const armZone=(id:string,side:Side)=>prism(id,'XY',side==='L'?[[120,-200],[1100,-200],[1100,220],[120,220]]:[[-1100,-200],[-120,-200],[-120,220],[-1100,220]],D.ARM_RED_ABOVE,300);
function bootProfile():[number,number][]{const {front,back}=D.BOOT_TOP,k=(back-front)/130,z=(y:number)=>front+k*(y+60);return [[-200,-20],[200,-20],[200,z(200)],[-200,z(-200)]];}
const bootZone=(id:string,side:Side)=>prism(id,'YZ',bootProfile(),side==='L'?0:-300,300);

/** Split a solid built twice into a red part (∩ zone) and blue part (− zone). */
async function split(name:string,make:()=>Promise<string>,zone:(id:string)=>Promise<string>,redId:string,blueId:string){
  const a=await make(),za=await zone(`${redId}.zone`);await bool('intersect',a,za,redId);
  const b=await make(),zb=await zone(`${blueId}.zone`);await bool('cut',b,zb,blueId);
  note(`split ${name}`);
}

export type PartInfo={id:string;name:string;color:keyof typeof D.SUIT;layer:string};
export type JointInfo={id:string;type:'revolute'|'prismatic'|'fixed';parent:string;child:string;origin:V3;axis:V3;min?:number;max?:number;coupling?:{driverId:string;ratio:number;offset:number};group:string;label:string};
export const parts:PartInfo[]=[],joints:JointInfo[]=[],nodes:{id:string;at:V3}[]=[];
const part=(id:string,name:string,color:keyof typeof D.SUIT)=>{parts.push({id,name,color,layer:color==='red'?LAYERS.red:color==='blue'?LAYERS.blue:color==='black'?LAYERS.black:color==='lens'?LAYERS.lens:LAYERS.stand});};
async function node(id:string,at:V3){await sphere(id,at,4,LAYERS.rig);nodes.push({id,at});return id;}
const translationOf=(id:string):V3=>(nodes.find(n=>n.id===id)?.at)??[0,0,0];
function joint(j:Omit<JointInfo,'origin'>&{at:V3}){const t=translationOf(j.parent);const {at,...rest}=j;joints.push({...rest,origin:[at[0]-t[0],at[1]-t[1],at[2]-t[2]]});}
const rev=(id:string,parent:string,child:string,at:V3,axis:V3,rom:string,group:string,label:string,coupling?:JointInfo['coupling'])=>{const [min,max]=D.ROM[rom];joint({id,type:'revolute',parent,child,at,axis,min,max,group,label,coupling});};
const fixed=(id:string,parent:string,child:string,group:string)=>joint({id,type:'fixed',parent,child,at:[0,0,0],axis:[0,0,1],group,label:'colour panel'});

// ---------- segments
async function buildAxial(){
  // pelvis (blue), abdomen & chest (red centre panel / blue flanks), neck & head (red)
  await run({type:'create-primitive',id:'stand',primitive:'cylinder',params:{radius:420,height:30},position:[0,0,-30],layerId:LAYERS.stand});part('stand','Display base · Ø840','stand');
  await loft('pelvis','XY',D.PELVIS_SECS,'L',0,'pelvis');part('pelvis','Pelvis · trunks','blue');
  await split('abdomen',()=>loft('abdomen','XY',D.ABDOMEN_SECS),torsoZone,'abdomen','abdomen-blue');part('abdomen','Abdomen · red panel','red');part('abdomen-blue','Abdomen · blue flanks','blue');
  await split('chest',()=>loft('chest','XY',D.CHEST_SECS),torsoZone,'chest','chest-blue');part('chest','Chest · red panel','red');part('chest-blue','Chest · blue flanks','blue');
  const nk=await loft('neck','XY',D.NECK_SECS);await run({type:'boolean-operation',operation:'union',target:nk,tool:await sphere('neck.ball',[0,22,1470],46),id:'neck'});part('neck','Neck','red');
  const hd=await loft('head','XY',D.HEAD_SECS);await run({type:'boolean-operation',operation:'union',target:hd,tool:await sphere('head.cap',[0,10,1712],70),id:'head'});part('head','Head · mask','red');
  note('axial segments');
}
async function buildArm(s:Side){
  const L=D.LM,P=(p:V3)=>mx(p,s);
  const upper=async()=>{const l=await loft(`${s}-upperarm`,'YZ',D.UPPER_ARM_SECS,s);const u=await union(l,await sphere(`${s}-ua.ball${++uid}`,P(L.shoulder),52));return union(u,await sphere(`${s}-ua.elb${++uid}`,P(L.elbow),36.5));};
  await split(`${s} upper arm`,upper,id=>armZone(id,s),`${s}-upperarm`,`${s}-upperarm-blue`);
  const fore=async()=>{const l=await loft(`${s}-forearm`,'YZ',D.FOREARM_SECS,s);return union(l,await sphere(`${s}-fa.ball${++uid}`,P(L.wrist),21));};
  await split(`${s} forearm`,fore,id=>armZone(id,s),`${s}-forearm`,`${s}-forearm-blue`);
  const palm=await loft(`${s}-palm`,'YZ',D.PALM_SECS,s);await run({type:'boolean-operation',operation:'union',target:palm,tool:await sphere(`${s}-palm.heel`,P([752,6,1432]),18),id:`${s}-hand`});
  const side=s==='L'?'Left':'Right';
  part(`${s}-upperarm`,`${side} upper arm · red`,'red');part(`${s}-upperarm-blue`,`${side} upper arm · blue`,'blue');
  part(`${s}-forearm`,`${side} forearm · red`,'red');part(`${s}-forearm-blue`,`${side} forearm · blue`,'blue');part(`${s}-hand`,`${side} hand · glove`,'red');
  // fingers: three phalanges each, knuckle balls unioned so flexion keeps a closed silhouette
  for(const f of D.FINGERS){
    let x=f.mcp[0],r=f.r;
    for(const [k,len] of f.len.entries()){
      const r1=r*(k===2?.86:.9),x1=x+len,id=`${s}-${f.id}${k+1}`;
      const secs:Sec[]=[{at:x+1,c:[f.mcp[1],f.mcp[2]],a:[r*1.05,r*1.05],b:[r*.9,r*.92]},{at:x+len*.5,c:[f.mcp[1],f.mcp[2]+.3],a:[r*.98,r*.98],b:[r*.8,r*.86]},{at:x1-(k===2?r1*.4:0),c:[f.mcp[1],f.mcp[2]],a:[r1*1.04,r1*1.04],b:[r1*.88,r1*.9]}];
      let solid=await loft(id,'YZ',secs,s);
      solid=await union(solid,await sphere(`${id}.k`,P([x,f.mcp[1],f.mcp[2]]),r*.97));
      const end=k===2?await sphere(`${id}.tip`,P([x1-r1*.45,f.mcp[1],f.mcp[2]-.5]),r1*.92):await sphere(`${id}.k2`,P([x1,f.mcp[1],f.mcp[2]]),r1*.9);
      await run({type:'boolean-operation',operation:'union',target:solid,tool:end,id});
      part(id,`${side} ${f.id} phalanx ${k+1}`,'red');x=x1;r=r1;
    }
  }
  // thumb: built along −Y (abducted rest), XZ sections
  {let y=D.THUMB.cmc[1],r=D.THUMB.r;const [cx,,cz]=D.THUMB.cmc;
    for(const [k,len] of D.THUMB.len.entries()){
      const r1=r*(k===2?.85:.88),y1=y-len,id=`${s}-thb${k+1}`;
      const secs:Sec[]=[{at:y-1,c:[cx,cz],a:[r*1.05,r*1.05],b:[r*.9,r*.92]},{at:y-len*.5,c:[cx,cz],a:[r*.98,r*.98],b:[r*.82,r*.86]},{at:y1+(k===2?r1*.4:0),c:[cx,cz],a:[r1*1.04,r1*1.04],b:[r1*.88,r1*.9]}];
      let solid=await loft(id,'XZ',secs,s);
      solid=await union(solid,await sphere(`${id}.k`,P([cx,y,cz]),r*.98));
      const end=k===2?await sphere(`${id}.tip`,P([cx,y1+r1*.45,cz-.5]),r1*.92):await sphere(`${id}.k2`,P([cx,y1,cz]),r1*.9);
      await run({type:'boolean-operation',operation:'union',target:solid,tool:end,id});
      part(id,`${side} thumb phalanx ${k+1}`,'red');y=y1;r=r1;
    }}
  note(`${s} arm + hand`);
}
async function buildLeg(s:Side){
  const L=D.LM,P=(p:V3)=>mx(p,s),side=s==='L'?'Left':'Right';
  const th=await loft(`${s}-thigh`,'XY',D.THIGH_SECS,s);const t1=await union(th,await sphere(`${s}-thigh.hip`,P(L.hip),74));
  await run({type:'boolean-operation',operation:'union',target:t1,tool:await sphere(`${s}-thigh.knee`,P(L.knee),46),id:`${s}-thigh`});part(`${s}-thigh`,`${side} thigh`,'blue');
  const shin=async()=>{const l=await loft(`${s}-shin`,'XY',D.SHIN_SECS,s);return union(l,await sphere(`${s}-shin.ank${++uid}`,P(L.ankle),30));};
  // shin: boot (red) below the raked line, blue above
  await split(`${s} shin`,shin,id=>bootZone(id,s),`${s}-boot`,`${s}-shin`);
  part(`${s}-shin`,`${side} shin · blue`,'blue');part(`${s}-boot`,`${side} boot shaft · red`,'red');
  await run({type:'boolean-operation',operation:'union',target:await loft(`${s}-foot`,'XZ',D.FOOT_SECS,s),tool:await sphere(`${s}-foot.heel`,P([84,40,34]),32),id:`${s}-foot`});part(`${s}-foot`,`${side} boot foot`,'red');
  const toe=await loft(`${s}-toe`,'XZ',D.TOE_SECS,s);await run({type:'boolean-operation',operation:'union',target:toe,tool:await sphere(`${s}-toe.mtp`,P([88,-140,19]),18),id:`${s}-toes`});part(`${s}-toes`,`${side} boot toe`,'red');
  note(`${s} leg + foot`);
}

// ---------- rig
async function buildRig(){
  const L=D.LM;
  await run({type:'assembly-ground',objectId:'stand',grounded:true});
  // root: 3 prismatic + 3 revolute at the pelvis centre
  for(const n of ['root-tz','root-ty','root-tx','root-rz','root-rx'])await node(`n:${n}`,L.pelvis);
  const pr=(id:string,parent:string,child:string,axis:V3)=>joint({id,type:'prismatic',parent,child,at:L.pelvis,axis,min:-2000,max:2000,group:'root',label:id});
  pr('root-tz','stand','n:root-tz',[0,0,1]);pr('root-ty','n:root-tz','n:root-ty',[0,1,0]);pr('root-tx','n:root-ty','n:root-tx',[1,0,0]);
  joint({id:'root-rz',type:'revolute',parent:'n:root-tx',child:'n:root-rz',at:L.pelvis,axis:[0,0,1],min:-360,max:360,group:'root',label:'turn'});
  joint({id:'root-rx',type:'revolute',parent:'n:root-rz',child:'n:root-rx',at:L.pelvis,axis:[1,0,0],min:-180,max:180,group:'root',label:'pitch (+ = lean forward)'});
  joint({id:'root-ry',type:'revolute',parent:'n:root-rx',child:'pelvis',at:L.pelvis,axis:[0,1,0],min:-180,max:180,group:'root',label:'roll'});
  // spine: lumbar → thorax, each flex / side-bend / rotation
  const ball3=async(prefix:string,parent:string,child:string,at:V3,axes:[V3,V3,V3],roms:[string,string,string],group:string,labels:[string,string,string])=>{
    const a=await node(`n:${prefix}-1`,at),b=await node(`n:${prefix}-2`,at);
    rev(`${prefix}-${roms[0].split('-').pop()}`,parent,a,at,axes[0],roms[0],group,labels[0]);
    rev(`${prefix}-${roms[1].split('-').pop()}`,a,b,at,axes[1],roms[1],group,labels[1]);
    rev(`${prefix}-${roms[2].split('-').pop()}`,b,child,at,axes[2],roms[2],group,labels[2]);
  };
  await ball3('lumbar','pelvis','abdomen',L.lumbar,[[1,0,0],[0,1,0],[0,0,1]],['lumbar-flex','lumbar-side','lumbar-rot'],'spine',['flex (+fwd)','side-bend (+left)','twist (+left)']);
  await ball3('thorax','abdomen','chest',L.thorax,[[1,0,0],[0,1,0],[0,0,1]],['thorax-flex','thorax-side','thorax-rot'],'spine',['flex (+fwd)','side-bend (+left)','twist (+left)']);
  await ball3('neck','chest','neck',L.neckBase,[[1,0,0],[0,1,0],[0,0,1]],['neck-flex','neck-side','neck-rot'],'head',['flex (+down)','side-bend (+left)','turn (+left)']);
  const hn=await node('n:head-1',L.atlas);rev('head-nod','neck',hn,L.atlas,[1,0,0],'head-nod','head','nod (+down)');rev('head-tilt',hn,'head',L.atlas,[0,1,0],'head-tilt','head','tilt (+left)');
  fixed('fix-abdomen-blue','abdomen','abdomen-blue','spine');fixed('fix-chest-blue','chest','chest-blue','spine');
  for(const s of ['L','R'] as Side[]){
    const P=(p:V3)=>mx(p,s),A=(a:V3)=>maxis(a,s),g=`${s} arm`;
    const c1=await node(`n:${s}-clav-1`,P(L.sc)),c2=await node(`n:${s}-clav-2`,P(L.shoulder));
    rev(`${s}-clav-elev`,'chest',c1,P(L.sc),A([0,-1,0]),'clav-elev',g,'shrug (+up)');
    rev(`${s}-clav-prot`,c1,c2,P(L.sc),A([0,0,-1]),'clav-prot',g,'protract (+fwd)');
    const s1=await node(`n:${s}-sh-1`,P(L.shoulder)),s2=await node(`n:${s}-sh-2`,P(L.shoulder));
    rev(`${s}-sh-hflex`,c2,s1,P(L.shoulder),A([0,0,-1]),'sh-hflex',g,'swing (+fwd)');
    rev(`${s}-sh-elev`,s1,s2,P(L.shoulder),A([0,-1,0]),'sh-elev',g,'raise (+up, −90 = at side)');
    rev(`${s}-sh-rot`,s2,`${s}-upperarm`,P(L.shoulder),A([-1,0,0]),'sh-rot',g,'rotate (+external)');
    fixed(`fix-${s}-upperarm-blue`,`${s}-upperarm`,`${s}-upperarm-blue`,g);
    rev(`${s}-elbow`,`${s}-upperarm`,`${s}-forearm`,P(L.elbow),A([0,0,-1]),'elbow',g,'flex');
    fixed(`fix-${s}-forearm-blue`,`${s}-forearm`,`${s}-forearm-blue`,g);
    const w1=await node(`n:${s}-wrist-1`,P(L.wrist)),w2=await node(`n:${s}-wrist-2`,P(L.wrist));
    rev(`${s}-forearm-sup`,`${s}-forearm`,w1,P(L.wrist),A([-1,0,0]),'forearm-sup',g,'supinate (+palm up)');
    rev(`${s}-wrist-flex`,w1,w2,P(L.wrist),A([0,1,0]),'wrist-flex',g,'flex (+palm side)');
    rev(`${s}-wrist-dev`,w2,`${s}-hand`,P(L.wrist),A([0,0,-1]),'wrist-dev',g,'radial deviation');
    const hg=`${s} hand`;
    for(const f of D.FINGERS){
      const sp=await node(`n:${s}-${f.id}-spread`,P(f.mcp));
      rev(`${s}-${f.id}-spread`,`${s}-hand`,sp,P(f.mcp),A([0,0,1]),'spread',hg,`${f.id} spread (+ulnar)`);
      rev(`${s}-${f.id}-mcp`,sp,`${s}-${f.id}1`,P(f.mcp),A([0,1,0]),'mcp',hg,`${f.id} MCP flex`);
      const x2=f.mcp[0]+f.len[0],x3=x2+f.len[1];
      rev(`${s}-${f.id}-pip`,`${s}-${f.id}1`,`${s}-${f.id}2`,P([x2,f.mcp[1],f.mcp[2]]),A([0,1,0]),'pip',hg,`${f.id} PIP flex`);
      rev(`${s}-${f.id}-dip`,`${s}-${f.id}2`,`${s}-${f.id}3`,P([x3,f.mcp[1],f.mcp[2]]),A([0,1,0]),'dip',hg,`${f.id} DIP (coupled ${D.DIP_COUPLING}×PIP)`,{driverId:`${s}-${f.id}-pip`,ratio:D.DIP_COUPLING,offset:0});
    }
    const T=D.THUMB,tn=await node(`n:${s}-thumb-1`,P(T.cmc));
    rev(`${s}-thumb-cmcF`,`${s}-hand`,tn,P(T.cmc),A([1,0,0]),'thumb-cmcF',hg,'thumb CMC flex (+palm)');
    rev(`${s}-thumb-cmcA`,tn,`${s}-thb1`,P(T.cmc),A([0,0,1]),'thumb-cmcA',hg,'thumb CMC adduct (+toward index)');
    const y2=T.cmc[1]-T.len[0],y3=y2-T.len[1];
    rev(`${s}-thumb-mcp`,`${s}-thb1`,`${s}-thb2`,P([T.cmc[0],y2,T.cmc[2]]),A([1,0,0]),'thumb-mcp',hg,'thumb MCP flex');
    rev(`${s}-thumb-ip`,`${s}-thb2`,`${s}-thb3`,P([T.cmc[0],y3,T.cmc[2]]),A([1,0,0]),'thumb-ip',hg,'thumb IP flex');
    // leg
    const lg=`${s} leg`,h1=await node(`n:${s}-hip-1`,P(L.hip)),h2=await node(`n:${s}-hip-2`,P(L.hip));
    rev(`${s}-hip-flex`,'pelvis',h1,P(L.hip),A([-1,0,0]),'hip-flex',lg,'flex (+fwd)');
    rev(`${s}-hip-abd`,h1,h2,P(L.hip),A([0,-1,0]),'hip-abd',lg,'abduct (+out)');
    rev(`${s}-hip-rot`,h2,`${s}-thigh`,P(L.hip),A([0,0,-1]),'hip-rot',lg,'rotate (+internal)');
    rev(`${s}-knee`,`${s}-thigh`,`${s}-shin`,P(L.knee),A([1,0,0]),'knee',lg,'flex');
    fixed(`fix-${s}-boot`,`${s}-shin`,`${s}-boot`,lg);
    const a1=await node(`n:${s}-ankle-1`,P(L.ankle));
    rev(`${s}-ankle-flex`,`${s}-shin`,a1,P(L.ankle),A([-1,0,0]),'ankle-flex',lg,'dorsiflex (+toes up)');
    rev(`${s}-ankle-inv`,a1,`${s}-foot`,P(L.ankle),A([0,1,0]),'ankle-inv',lg,'invert (+sole in)');
    rev(`${s}-toe`,`${s}-foot`,`${s}-toes`,P(L.mtp),A([-1,0,0]),'toe',lg,'toe extension (+up)');
  }
  for(const j of joints){
    const base={id:j.id,parentId:j.parent,childId:j.child,origin:j.origin,axis:j.axis};
    const input:any=j.type==='prismatic'?{...base,type:'prismatic',offset:0,min:j.min,max:j.max}:j.type==='fixed'?{...base,type:'fixed',angle:0}:{...base,type:'revolute',angle:0,min:j.min,max:j.max,...(j.coupling?{coupling:j.coupling}:{})};
    await run({type:'assembly-joint-create',joint:input});
  }
  note(`rig: ${joints.length} joints, ${nodes.length} joint nodes`);
}

// ---------- 2D proportion reference (front view, XZ plane at y = −400)
async function buildReference(){
  const y=-400,line=async(id:string,a:[number,number],b:[number,number],name:string)=>run({type:'create-drawing',id,name,drawing:'line',layerId:LAYERS.ref,params:{points:[[a[0],y,a[1]],[b[0],y,b[1]]],workPlane:'XZ'}});
  for(let i=0;i<=8;i++){const z=D.H-i*D.HEAD;if(z<-1)break;await line(`ref-head-${i}`,[-600,z],[600,z],`head unit ${i} · z ${z.toFixed(0)}`);}
  await line('ref-ground',[-600,0],[600,0],'ground z 0');await line('ref-axis',[0,-20],[0,D.H+40],'median axis');
  for(const [k,p] of Object.entries(D.LM))if(Array.isArray(p)){const [x,,z]=p as V3;await run({type:'create-drawing',id:`ref-lm-${k}`,name:`landmark ${k}`,drawing:'circle',layerId:LAYERS.ref,params:{center:[x,y,z],radius:8,workPlane:'XZ'}});}
  note('2D proportion reference');
}

export async function buildModel(){
  resetTestDocument();cadDocument.id='spider-man-poseable-figure';
  for(const l of Object.values(LAYERS))await run({type:'create-layer',id:l,name:l});
  await buildReference();
  await buildAxial();
  for(const s of ['L','R'] as Side[]){await buildArm(s);await buildLeg(s);}
  for(const p of parts){
    if(cadDocument.objects[p.id].layerId!==p.layer)await run({type:'move-object-to-layer',objectId:p.id,layerId:p.layer});
    await run({type:'rename-object',objectId:p.id,name:p.name});await run({type:'set-solid-finish',objectId:p.id,finish:D.SUIT[p.color]});
  }
  for(const p of parts)if(p.id!=='stand'){const t=cadDocument.objects[p.id].transform;assert.ok(!t||[...t.translation,...t.rotation].every(v=>Math.abs(v)<1e-9),`${p.id} has a non-identity rest transform`);}
  await buildRig();
  for(const id of Object.keys(cadDocument.objects))if(cadDocument.objects[id].layerId===LAYERS.cons)await run({type:'set-object-visible',objectId:id,visible:false}).catch(()=>{});
  for(const l of [LAYERS.secAxial,LAYERS.secArm,LAYERS.secLeg,LAYERS.zone,LAYERS.rig,LAYERS.cons])await run({type:'set-layer-visible',layerId:l,visible:false});
  await mkdir(OUT,{recursive:true});
  await writeFile(resolve(OUT,'model.webcad.json'),serializeDocument(cadDocument));
  await writeFile(resolve(OUT,'rig.json'),JSON.stringify({parts,joints,nodes,landmarks:D.LM,rom:D.ROM},null,1));
  await writeFile(resolve(OUT,'build.log'),log.join('\n')+'\n');
  note(`saved: ${parts.length} parts, ${Object.keys(cadDocument.objects).length} objects`);
}
if(process.argv[1]?.endsWith('buildModel.ts')){await buildModel();process.exit(0);}
