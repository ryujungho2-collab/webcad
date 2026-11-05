import type {CadCommand} from "@agent-webcad/cad-commands";
import type {CadBlock,CadDocument} from "@agent-webcad/cad-document";
import type {LibraryItem} from "./libraryCatalog";
type Step=Exclude<CadCommand,{type:"batch"}>;
export function libraryPlan(doc:CadDocument,item:LibraryItem,options:{position:[number,number,number];scale:number;angle:number;layerId:string;selectedIds:string[];blocks?:Record<string,CadBlock>;local?:boolean;token:string}){
 const {position,scale,angle,layerId,selectedIds,token}=options;
 if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(angle)||!position.every(Number.isFinite))throw Error("Enter a positive scale and finite position/angle.");
 const commands:Step[]=[],instanceId=`library-${token}`,dependencies:string[]=[];let totalMembers=0;
 if(item.style){if(!selectedIds.length)throw Error("Select drawings to apply this line style.");for(const objectId of selectedIds)commands.push({type:"set-vector-style",objectId,style:item.style});}
 else if(item.hatch){if(!selectedIds.length)throw Error("Select closed boundaries for hatching.");commands.push({type:"create-drafting",id:instanceId,layerId,params:{kind:"hatch",sourceObjectIds:selectedIds,workPlane:"XY",...item.hatch}});}
 else if(item.block){
  const source={...options.blocks,[item.block.id]:item.block},mapped=new Map<string,string>(),visiting=new Set<string>();
  const copy=(id:string):string=>{
   if(options.local){if(!doc.blocks?.[id])throw Error("Component no longer exists.");return id;}
   if(visiting.has(id))throw Error("Cyclic component dependency.");if(mapped.has(id))return mapped.get(id)!;
   const block=source[id];if(!block)throw Error(`Missing component dependency: ${id}`);if(block.members.length>500||mapped.size>=100)throw Error("Component dependency limit exceeded.");
   totalMembers+=block.members.length;if(totalMembers>500)throw Error("Component member limit exceeded (500).");visiting.add(id);dependencies.push(block.name);const target=`library-def-${token}-${mapped.size}`;mapped.set(id,target);const memberIds:string[]=[];
   for(const [i,m] of block.members.entries()){
    const params=structuredClone(m.params),memberId=`${target}-m${i}`,override=m.objectId?block.overrides?.[m.objectId]:undefined;
    if(override?.visible===false)continue;if(override?.vectorStyle)params.vectorStyle=override.vectorStyle;
    if(params.kind==="block")params.blockId=copy(String(params.blockId));
    if(params.assetId||params.sourceObjectId||params.sourceObjectIds||params.kind==="hatch"||params.kind==="face"||params.sketchId)throw Error("This member needs external geometry or image assets. Import its source through the existing document/DXF workflow first.");
    delete params.sourceObjectId;
    if(params.kind==="block"){commands.push({type:"insert-block",id:memberId,blockId:String(params.blockId),position:[0,0,0],layerId});if(params.vectorStyle)commands.push({type:"set-vector-style",objectId:memberId,style:params.vectorStyle as import("@agent-webcad/cad-document").CadVectorStyle});}
    else if(m.type==="drawing")commands.push({type:"create-drawing",id:memberId,drawing:String(params.kind) as "line",params,layerId});else commands.push({type:"create-drafting",id:memberId,params,layerId});
    if(m.transform.translation.some(v=>v!==0))commands.push({type:"move-object",objectId:memberId,translation:m.transform.translation});if(m.transform.rotation.some(v=>v!==0))commands.push({type:"rotate-object",objectId:memberId,rotation:m.transform.rotation});if(m.transform.scale.some(v=>v!==1))commands.push({type:"scale-object",objectId:memberId,scale:m.transform.scale});memberIds.push(memberId);
   }
   if(!memberIds.length)throw Error("Component has no visible members.");
   commands.push({type:"define-block",id:target,name:`${block.name.slice(0,95)} · ${item.source.slice(0,100)}`,objectIds:memberIds,base:[0,0,0]});for(const objectId of memberIds)commands.push({type:"delete-object",objectId});visiting.delete(id);return target;
  };
  const blockId=copy(item.block.id);commands.push({type:"insert-block",id:instanceId,blockId,layerId,position,angle,scale:[scale,scale,scale]});
 }
 else throw Error("Unsupported library item.");
 return {command:{type:"batch",label:`Library: ${item.name}`,commands} as CadCommand,instanceId,dependencies};
}
