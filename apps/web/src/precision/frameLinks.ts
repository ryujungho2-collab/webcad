import {orthographicSharedOrigin,sheetAlignmentUnits} from "./sheetAlignment";
import {validateFrameLinks,type CadDocument,type CadArtboard,type CadFrameLink} from "@agent-webcad/cad-document";
import {assertFrameMembers,frameSourceMapping} from "./drawingFrame";
export type FrameLinkLayout={rootId:string;frameIds:string[];placements:Record<string,[number,number]>;movedIds:string[]};
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-7;
export function frameLinkView(d:CadDocument,b:CadArtboard){
 const ids=new Set<string>();for(const id of b.frame!.memberIds){const p=Object.values(d.features).find(f=>f.output===id)?.params,v=p?.modelProjection??p?.modelSection??(p?.modelDrawingReference as {viewId?:string})?.viewId??(p?.modelNote as {sourceViewId?:string})?.sourceViewId;if(typeof v==="string")ids.add(v);}
 const id=[...ids][0];return id?{id,view:d.modelPresentation?.projections[id]??d.modelPresentation?.sections?.[id],section:!!d.modelPresentation?.sections?.[id]}:undefined;
}
const region=(b:CadArtboard)=>({origin:b.frame!.sourceOrigin,size:b.size.map(n=>n*b.frame!.denominator) as [number,number]});
const inside=(b:CadArtboard,p:[number,number])=>{const r=region(b);return p.every((v,i)=>v>=r.origin[i]-1e-7&&v<=r.origin[i]+r.size[i]+1e-7);};
export function assertFrameLinkSource(d:CadDocument,l:CadFrameLink){
 if(d.artboards?.[l.fromId]?.frame?.stitch||d.artboards?.[l.toId]?.frame?.stitch)throw Error("Use original frames for orthographic/section references; continuous frames use their stitch alignment.");
 const a=d.artboards![l.fromId],b=d.artboards![l.toId];
 for(const board of [a,b]){assertFrameMembers(d,board.frame!.memberIds,board.workPlane);frameSourceMapping(d,board.frame!.memberIds);}
 const av=frameLinkView(d,a),bv=frameLinkView(d,b),r=l.reference;
 if(r.kind==="orthographic"){
  if(!near(a.frame!.denominator,b.frame!.denominator))throw Error("Orthographic frames require the same scale. Change frame scale explicitly first.");
  const basis={front:"XZ",top:"XY",right:"YZ"};
  if(av&&(av.section||av.view?.basis!==basis[r.fromView])||bv&&(bv.section||bv.view?.basis!==basis[r.toView]))throw Error("Frame role conflicts with its source model projection.");
  if(av||bv){if(!av?.view||!bv?.view||sheetAlignmentUnits(d,[av.id,bv.id],"orthographic").length!==1)throw Error("Orthographic model frames must project the same parts.");}
 }else if(r.kind==="section"){
  if(!r.cut.every(p=>inside(a,p)))throw Error("Section reference line must be inside the source frame crop.");
  if(av||bv){if(!av?.view||!bv?.view||!bv.section||!bv.view.partIds.every(id=>av.view!.partIds.includes(id)))throw Error("Section model frames require a compatible projection and section source.");
   const axes={XY:[0,1],XZ:[0,2],YZ:[1,2]},normal={XY:2,XZ:1,YZ:0},axis=axes[av.view.basis].indexOf(normal[bv.view.basis]),height=(bv.view as import("@agent-webcad/cad-document").ModelSection).height;
   if(axis<0||!r.cut.every(p=>near(p[axis],height)))throw Error("Reference cut line must match the model section height on the projection plane.");
  }
 }else if(r.kind==="detail"){
  if(b.frame!.denominator>=a.frame!.denominator)throw Error("Detail frame must enlarge the source: use a smaller scale denominator.");
  if(av||bv){if(!av||!bv||av.id!==bv.id)throw Error("Detail frames must reference the same model view.");}
  else if(!b.frame!.memberIds.length||b.frame!.memberIds.some(id=>!a.frame!.memberIds.includes(id)))throw Error("Detail members must come from the source frame. Include shared annotations explicitly.");
  const box=region(b);if(!inside(a,box.origin)||!inside(a,[box.origin[0]+box.size[0],box.origin[1]+box.size[1]]))throw Error("Detail crop lies outside the source frame. Adjust the crops before connecting.");
 }else{
  if(!d.objects[r.sourceObjectId])throw Error("Part reference source is missing. Rebind the part connection.");
  if(av||bv){const parts=Object.values(d.modelPresentation?.parts??{}).filter(p=>p.objectId===r.sourceObjectId).map(p=>p.id);if(!av?.view||!bv?.view||!parts.some(id=>av.view!.partIds.includes(id)&&bv.view!.partIds.includes(id)))throw Error("Assembly and part views must both include the selected source part.");}
  else if(!a.frame!.memberIds.includes(r.sourceObjectId)||!b.frame!.memberIds.includes(r.sourceObjectId))throw Error("Independent part frames must both reference the selected source object.");
 }
}
export function linkedFrameOrigin(d:CadDocument,l:CadFrameLink,fromOrigin=d.artboards![l.fromId].origin):[number,number]{
 const a=d.artboards![l.fromId],b=d.artboards![l.toId],vertical=["above","below"].includes(l.placement),axis=vertical?0:1;
 const result:[number,number]=[...fromOrigin];
 result[axis]=l.reference.kind==="orthographic"?orthographicSharedOrigin(fromOrigin[axis],a.frame!.sourceOrigin[axis],b.frame!.sourceOrigin[axis],a.frame!.denominator):fromOrigin[axis]+(a.size[axis]-b.size[axis])/2;
 if(l.placement==="right")result[0]=fromOrigin[0]+a.size[0]+l.gap;
 if(l.placement==="left")result[0]=fromOrigin[0]-b.size[0]-l.gap;
 if(l.placement==="above")result[1]=fromOrigin[1]+a.size[1]+l.gap;
 if(l.placement==="below")result[1]=fromOrigin[1]-b.size[1]-l.gap;
 if(!result.every(Number.isFinite))throw Error("Frame layout exceeds finite coordinates.");return result;
}
export function planFrameLinkLayout(d:CadDocument,frameId:string,translation:[number,number]=[0,0]):FrameLinkLayout{
 validateFrameLinks(d);const links=Object.values(d.frameLinks??{}),parent=new Map(links.map(l=>[l.toId,l]));
 if(!links.some(l=>l.fromId===frameId||l.toId===frameId))throw Error("Choose a connected frame first.");
 let rootId=frameId;while(parent.has(rootId))rootId=parent.get(rootId)!.fromId;
 const placements:Record<string,[number,number]>={},frameIds:string[]=[];
 const visit=(id:string,p:[number,number])=>{placements[id]=p;frameIds.push(id);for(const l of links.filter(l=>l.fromId===id)){assertFrameLinkSource(d,l);visit(l.toId,linkedFrameOrigin(d,l,p));}};
 const root=d.artboards![rootId];visit(rootId,[root.origin[0]+translation[0],root.origin[1]+translation[1]]);
 const movedIds=frameIds.filter(id=>placements[id].some((v,i)=>!near(v,d.artboards![id].origin[i])));
 for(const id of movedIds){if(d.artboards![id].locked||parent.get(id)?.fixed)throw Error(`Fixed or locked frame ${d.artboards![id].name} conflicts with this layout. Release the fixed setting or unlock it.`);}
 for(let i=0;i<frameIds.length;i++)for(let j=i+1;j<frameIds.length;j++){const ai=frameIds[i],bi=frameIds[j],a=d.artboards![ai],b=d.artboards![bi],p=placements[ai],q=placements[bi];if(p[0]<q[0]+b.size[0]-1e-7&&p[0]+a.size[0]>q[0]+1e-7&&p[1]<q[1]+b.size[1]-1e-7&&p[1]+a.size[1]>q[1]+1e-7)throw Error(`Connected frames ${a.name} and ${b.name} overlap. Change their placement or gap.`);}
 return {rootId,frameIds,placements,movedIds};
}
export function frameLinkStatus(d:CadDocument,l:CadFrameLink){try{assertFrameLinkSource(d,l);const p=linkedFrameOrigin(d,l),b=d.artboards![l.toId];return p.every((v,i)=>near(v,b.origin[i]))?"Aligned":"Needs layout Review";}catch(e){return `Unresolved: ${e instanceof Error?e.message:String(e)}`;}}
export type FrameLinkAnnotation={lines:{points:[number,number][];closed:boolean;dash?:number[]}[];texts:{position:[number,number];text:string;size:number;align:"center"}[]};
/** Reference markers are paper-mm annotations, shared by frame rendering/export. */
export function frameLinkAnnotations(d:CadDocument,board:CadArtboard):FrameLinkAnnotation{
 const out:FrameLinkAnnotation={lines:[],texts:[]},map=(p:[number,number]):[number,number]=>p.map((v,i)=>board.origin[i]+(v-board.frame!.sourceOrigin[i])/board.frame!.denominator) as [number,number],label=(p:[number,number],text:string)=>{const width=Math.min(p[0]-board.origin[0],board.origin[0]+board.size[0]-p[0])-1,height=Math.min(p[1]-board.origin[1],board.origin[1]+board.size[1]-p[1])-.5,size=Math.min(2.5,width/(Array.from(text).length*1.2),height);
  if(size<1)throw Error("Reference label cannot fit the frame crop. Enlarge the frame or shorten its number.");
  if(!out.texts.some(t=>t.text===text&&t.position.every((v,i)=>near(v,p[i]))))out.texts.push({position:p,text,size,align:"center"});};
 for(const l of Object.values(d.frameLinks??{}).filter(l=>l.fromId===board.id||l.toId===board.id)){
  assertFrameLinkSource(d,l);const r=l.reference;if(r.kind==="orthographic"){label([board.origin[0]+board.size[0]/2,board.origin[1]+board.size[1]-5],`${l.fromId===board.id?r.fromView:r.toView} / 1:${board.frame!.denominator}`);continue;}
  if(l.toId===board.id){label([board.origin[0]+board.size[0]/2,board.origin[1]+board.size[1]-4],`${r.kind==="section"?"Section":r.kind==="detail"?"Detail":"Part"} ${r.number}`);label([board.origin[0]+board.size[0]/2,board.origin[1]+board.size[1]-8],`1:${board.frame!.denominator}`);continue;}
  if(r.kind==="section"){
   const p=map(r.cut[0]),q=map(r.cut[1]),dx=q[0]-p[0],dy=q[1]-p[1],n=Math.hypot(dx,dy),sign=r.direction==="left"?1:-1,u:[number,number]=[-dy/n*sign,dx/n*sign];out.lines.push({points:[p,q],closed:false,dash:[4,2]});
   for(const v of [p,q]){const tip:[number,number]=[v[0]+u[0]*4,v[1]+u[1]*4];out.lines.push({points:[v,tip,[tip[0]-u[0]*1.5+u[1],tip[1]-u[1]*1.5-u[0]],tip,[tip[0]-u[0]*1.5-u[1],tip[1]-u[1]*1.5+u[0]]],closed:false});}
   label([(p[0]+q[0])/2+u[0]*7,(p[1]+q[1])/2+u[1]*7],r.number);
  }else if(r.kind==="detail"){
   const box=region(d.artboards![l.toId]),a=map(box.origin),b=map([box.origin[0]+box.size[0],box.origin[1]+box.size[1]]);out.lines.push({points:[a,[b[0],a[1]],b,[a[0],b[1]]],closed:true,dash:[2,1]});label([(a[0]+b[0])/2,Math.min(board.origin[1]+board.size[1]-5,b[1]+4)],`Detail ${r.number}`);
  }else label([board.origin[0]+board.size[0]/2,board.origin[1]+5],`Part ${r.number}`);
 }
 return out;
}
