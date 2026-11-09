export type FlexAxis={mode:"fixed"|"hug"|"fill";value?:number;min?:number;max?:number;weight?:number};
export type CanvasFlexLayout={direction:"row"|"column";wrap:boolean;gap:number;padding:number;width:FlexAxis;height:FlexAxis;align:"start"|"center"|"end";justify:"start"|"center"|"end"|"space-between"};
export type CanvasFlexItem={position:"flow"|"absolute";width?:FlexAxis;height?:FlexAxis;offset?:[number,number]};
const finite=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n);
export function validFlexAxis(v:unknown):v is FlexAxis{if(!v||typeof v!=="object")return false;const s=v as FlexAxis;return ["fixed","hug","fill"].includes(s.mode)&&(s.value===undefined||finite(s.value)&&s.value>0&&s.value<=1e7)&&(s.min===undefined||finite(s.min)&&s.min>0&&s.min<=1e7)&&(s.max===undefined||finite(s.max)&&s.max>0&&s.max<=1e7)&&(s.min??0)<=(s.max??1e7)&&(s.weight===undefined||finite(s.weight)&&s.weight>0&&s.weight<=1000);}
export function validCanvasFlex(v:unknown):v is CanvasFlexLayout{if(!v||typeof v!=="object")return false;const s=v as CanvasFlexLayout;return ["row","column"].includes(s.direction)&&typeof s.wrap==="boolean"&&[s.gap,s.padding].every(n=>finite(n)&&n>=0&&n<=1e7)&&validFlexAxis(s.width)&&validFlexAxis(s.height)&&["start","center","end"].includes(s.align)&&["start","center","end","space-between"].includes(s.justify);}
export function validCanvasFlexItem(v:unknown):v is CanvasFlexItem{if(!v||typeof v!=="object")return false;const s=v as CanvasFlexItem;return ["flow","absolute"].includes(s.position)&&(s.width===undefined||validFlexAxis(s.width))&&(s.height===undefined||validFlexAxis(s.height))&&(s.offset===undefined||Array.isArray(s.offset)&&s.offset.length===2&&s.offset.every(n=>finite(n)&&Math.abs(n)<=1e7));}
export const defaultCanvasFlex=():CanvasFlexLayout=>({direction:"row",wrap:false,gap:20,padding:10,width:{mode:"fixed"},height:{mode:"fixed"},align:"start",justify:"start"});
export type FlexNode={key:string;natural:[number,number];layout:CanvasFlexLayout;items:FlexInput[]};
export type FlexInput={key:string;natural:[number,number];style:CanvasFlexItem;child?:FlexNode};
export type FlexBox={key:string;origin:[number,number];size:[number,number];absolute:boolean;children:FlexBox[]};
export type FlexReport={root:FlexBox;overflow:{key:string;axis:"x"|"y";excess:number}[]};
const clamp=(n:number,s:FlexAxis)=>Math.max(s.min??.001,Math.min(s.max??1e7,n));
const fixed=(s:FlexAxis,n:number)=>clamp(s.mode==="fixed"?s.value??n:s.mode==="fill"?s.min??.001:n,s);
const specs=(i:FlexInput):[FlexAxis,FlexAxis]=>[i.style.width??i.child?.layout.width??{mode:"fixed"},i.style.height??i.child?.layout.height??{mode:"fixed"}];
/** Deterministic constrained box layout. Dimensions describe layout boxes, never CAD geometry. */
export function solveCanvasFlex(node:FlexNode):FlexReport{
 const overflow:FlexReport["overflow"]=[],seen=new Set<string>();let budget=0;
 function natural(n:FlexNode,depth=0):[number,number]{
  if(depth>32||++budget>20000)throw Error("Flex layout exceeds its bounded evaluation budget.");
  if(seen.has(n.key))throw Error("Flex dependency cycle.");seen.add(n.key);
  const l=n.layout,a=l.direction==="row"?0:1,b=1-a,own=[l.width,l.height],flow=n.items.filter(i=>i.style.position!=="absolute");
  if(l.wrap&&own[a].mode==="hug")throw Error(`${n.key}: Wrap requires a resolved Fixed/Fill main axis; Hug cannot determine its line width.`);
  for(const i of flow){const s=specs(i);for(const axis of [0,1])if(own[axis].mode==="hug"&&s[axis].mode==="fill")throw Error(`${n.key}: Hug/Fill dependency on ${axis===0?"width":"height"}. Set a fixed boundary.`);}
  const sizes=flow.map(i=>{const s=specs(i),raw=i.child?natural({...i.child,layout:{...i.child.layout,width:s[0],height:s[1]}},depth+1):i.natural;return [fixed(s[0],raw[0]),fixed(s[1],raw[1])];});
  let main=0,cross=0,lineMain=0,lineCross=0;const bound=own[a].mode==="fixed"?fixed(own[a],n.natural[a])-2*l.padding:Infinity;
  for(const size of sizes){if(l.wrap&&lineMain&&lineMain+l.gap+size[a]>bound+1e-7){main=Math.max(main,lineMain);cross+=lineCross+l.gap;lineMain=0;lineCross=0;}lineMain+=(lineMain?l.gap:0)+size[a];lineCross=Math.max(lineCross,size[b]);}
  main=Math.max(main,lineMain);cross+=lineCross;
  const content=[0,0];content[a]=main+2*l.padding;content[b]=cross+2*l.padding;
  const result:[number,number]=[fixed(own[0],own[0].mode==="hug"?content[0]:n.natural[0]),fixed(own[1],own[1].mode==="hug"?content[1]:n.natural[1])];seen.delete(n.key);return result;
 }
 function solve(n:FlexNode,allocation?:[number|undefined,number|undefined]):FlexBox{
  const l=n.layout,a=l.direction==="row"?0:1,b=1-a,own=[l.width,l.height],intrinsic=natural(n),size:[number,number]=[...intrinsic];
  for(const axis of [0,1])if(allocation?.[axis]!==undefined)size[axis]=clamp(allocation[axis]!,own[axis]);else if(own[axis].mode==="fill")throw Error(`${n.key}: Fill needs an available parent size.`);
  const inner=[Math.max(0,size[0]-2*l.padding),Math.max(0,size[1]-2*l.padding)];
  const boxes=n.items.map(i=>{const s=specs(i),raw=i.child?natural({...i.child,layout:{...i.child.layout,width:s[0],height:s[1]}}):i.natural;return {i,s,size:[fixed(s[0],raw[0]),fixed(s[1],raw[1])] as [number,number]};});
  const lines:typeof boxes[]=[];let line:typeof boxes=[],used=0;
  for(const box of boxes.filter(box=>box.i.style.position!=="absolute")){if(l.wrap&&line.length&&used+l.gap+box.size[a]>inner[a]+1e-7){lines.push(line);line=[];used=0;}used+=(line.length?l.gap:0)+box.size[a];line.push(box);}if(line.length)lines.push(line);
  const result:FlexBox={key:n.key,origin:[0,0],size,absolute:false,children:[]};let crossCursor=l.padding,mainExtent=0;
  for(const row of lines){
   const fills=row.filter(box=>box.s[a].mode==="fill");let free=inner[a]-(row.length-1)*l.gap-row.reduce((sum,box)=>sum+box.size[a],0),active=[...fills];
   for(let step=0;step<row.length+1&&free>1e-8&&active.length;step++){const weight=active.reduce((sum,box)=>sum+(box.s[a].weight??1),0);let spent=0;for(const box of active){const growth=Math.min(free*(box.s[a].weight??1)/weight,(box.s[a].max??1e7)-box.size[a]);box.size[a]+=growth;spent+=growth;}free-=spent;active=active.filter(box=>box.size[a]<(box.s[a].max??1e7)-1e-8);if(spent<1e-9)break;}
   let rowCross=Math.max(0,...row.map(box=>box.size[b]));if(lines.length===1&&own[b].mode!=="hug")rowCross=Math.max(rowCross,inner[b]);
   const solved=row.map(box=>{
    if(box.s[b].mode==="fill")box.size[b]=clamp(rowCross,box.s[b]);
    if(!box.i.child)return {box,child:undefined};
    const child=solve({...box.i.child,layout:{...box.i.child.layout,width:box.s[0],height:box.s[1]}},[box.s[0].mode==="hug"?undefined:box.size[0],box.s[1].mode==="hug"?undefined:box.size[1]]);
    box.size=[...child.size];return {box,child};
   });
   rowCross=Math.max(rowCross,...row.map(box=>box.size[b]));
   const rowMain=row.reduce((sum,box)=>sum+box.size[a],0)+Math.max(0,row.length-1)*l.gap,remaining=Math.max(0,inner[a]-rowMain),spacing=l.gap+(l.justify==="space-between"&&row.length>1?remaining/(row.length-1):0);
   let cursor=l.padding+(l.justify==="center"?remaining/2:l.justify==="end"?remaining:0);
   for(const {box,child} of solved){const origin:[number,number]=[0,0];origin[a]=cursor;origin[b]=crossCursor+(l.align==="center"?(rowCross-box.size[b])/2:l.align==="end"?rowCross-box.size[b]:0);result.children.push({key:box.i.key,origin,size:box.size,absolute:false,children:child?.children??[]});cursor+=box.size[a]+spacing;}
   mainExtent=Math.max(mainExtent,rowMain);crossCursor+=rowCross+l.gap;
  }
  if(own[a].mode==="hug")size[a]=clamp(mainExtent+2*l.padding,own[a]);
  if(own[b].mode==="hug")size[b]=clamp((lines.length?crossCursor-l.gap:l.padding)+l.padding,own[b]);
  for(const box of boxes.filter(box=>box.i.style.position==="absolute")){const offset=box.i.style.offset??[0,0];let children:FlexBox[]=[];if(box.i.child){const child=solve({...box.i.child,layout:{...box.i.child.layout,width:box.s[0],height:box.s[1]}},box.size);children=child.children;box.size=child.size;}result.children.push({key:box.i.key,origin:[...offset],size:box.size,absolute:true,children});}
  for(const child of result.children)for(const axis of [0,1]){const excess=Math.max(-child.origin[axis],child.origin[axis]+child.size[axis]-(size[axis]-(child.absolute?0:l.padding)));if(excess>1e-6)overflow.push({key:child.key,axis:axis===0?"x":"y",excess});}
  if(size.some(v=>!Number.isFinite(v)||v<=0||v>1e7))throw Error("Flex layout produced invalid bounds.");
  return result;
 }
 return {root:solve(node),overflow};
}
