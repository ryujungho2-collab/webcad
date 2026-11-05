import type {CadCommand} from "@agent-webcad/cad-commands";
import type {CadDocument,SolidFinish} from "@agent-webcad/cad-document";
import {getObjectTransform} from "../precision/objectTransform";
import {getWorldDrawingGeometry} from "../precision/worldGeometry";
import type {ModelPiece} from "../library/cafeModelAssets";

export type PlanFloor={id:string;name:string;sourceOrigin:[number,number];level:number};
export type ModelSourceReceipt={assemblyId:string;sourceObjectIds:string[];floorId:string;role:string;objectIds:string[];mode:"live-profile"|"snapshot-recipe"|"explicit-assumption"};

/** Explicit 2D→3D mapping. This converts reviewed profiles/recipes; it never infers a room design. */
export class PlanModelBuilder{
 readonly commands:Exclude<CadCommand,{type:"batch"}>[]=[];
 readonly receipts:ModelSourceReceipt[]=[];
 readonly layers=new Set<string>();
 private ids=new Set<string>();
 constructor(readonly document:CadDocument,readonly prefix:string){}
 private reserve(id:string){if(this.document.objects[id]||this.ids.has(id))throw Error(`Model output already exists: ${id}`);this.ids.add(id);return id;}
 layer(floor:PlanFloor,role:string){const id=`${this.prefix}-${floor.id}-${role}`;if(!this.layers.has(id)){if(this.document.layers[id])throw Error(`Model layer already exists: ${id}`);this.layers.add(id);this.commands.push({type:"create-layer",id,name:`${floor.name} / ${role}`});}return id;}
 private decorate(id:string,name:string,finish:SolidFinish){this.commands.push({type:"rename-object",objectId:id,name},{type:"set-solid-finish",objectId:id,finish},{type:"register-model-part",part:{id:`part-${id}`,name,objectId:id}});}
 extrude(sourceId:string,height:number,floor:PlanFloor,finish:SolidFinish,role="walls"){
  const object=this.document.objects[sourceId],feature=Object.values(this.document.features).find(f=>f.output===sourceId);
  const world=object&&feature&&getWorldDrawingGeometry(object,feature);
  if(!world?.closed||world.workPlane!=="XY"||!world.planeAligned||!world.uniformScale||!(height>0))throw Error(`Choose a closed XY profile and a positive height: ${sourceId}`);
  const id=this.reserve(`${this.prefix}-${floor.id}-${sourceId}`),layerId=this.layer(floor,role);
  this.commands.push({type:"create-extrude",id,profileObjectIds:[sourceId],distance:height,layerId});
  if(floor.level||floor.sourceOrigin.some(Boolean))this.commands.push({type:"move-object",objectId:id,translation:[-floor.sourceOrigin[0],-floor.sourceOrigin[1],floor.level]});
  this.decorate(id,`${floor.name} / ${role} / ${sourceId}`,finish);
  this.receipts.push({assemblyId:id,sourceObjectIds:[sourceId],floorId:floor.id,role,objectIds:[id],mode:"live-profile"});return id;
 }
 pieces(assembly:string,pieces:ModelPiece[],floor:PlanFloor,role:string,origin:[number,number,number]=[0,0,0],angle=0,sourceIds:string[]=[]){
  if(!pieces.length||![...origin,angle,floor.level,...floor.sourceOrigin].every(Number.isFinite))throw Error("Model recipe needs finite placement and at least one part.");
  if(sourceIds.some(id=>!this.document.objects[id]))throw Error("Model recipe references a missing 2D source.");
  const layerId=this.layer(floor,role),c=Math.cos(angle*Math.PI/180),s=Math.sin(angle*Math.PI/180),objectIds:string[]=[];
  pieces.forEach((p,i)=>{
   const id=this.reserve(`${this.prefix}-${floor.id}-${assembly}-${i}`),[x,y,z]=p.position;
   objectIds.push(id);this.commands.push({type:"create-primitive",id,primitive:p.kind,params:p.params,position:[origin[0]+x*c-y*s,origin[1]+x*s+y*c,floor.level+origin[2]+z],layerId});
   const rotation=p.rotation??[0,0,0];if(angle||rotation.some(Boolean))this.commands.push({type:"rotate-object",objectId:id,rotation:[rotation[0],rotation[1],rotation[2]+angle]});
   this.decorate(id,`${floor.name} / ${assembly} / ${p.name}`,p.finish);
  });
  this.receipts.push({assemblyId:assembly,sourceObjectIds:[...sourceIds],floorId:floor.id,role,objectIds,mode:sourceIds.length?"snapshot-recipe":"explicit-assumption"});return objectIds;
 }
 block(sourceId:string,pieces:ModelPiece[],floor:PlanFloor,role:string){
  const object=this.document.objects[sourceId],feature=Object.values(this.document.features).find(f=>f.output===sourceId);
  if(!object||feature?.params.kind!=="block")throw Error("Choose a native 2D block instance.");
  const t=getObjectTransform(object,feature);
  if(!t.scale.every(x=>x===1)||t.rotation[0]||t.rotation[1])throw Error("Use unit-scale XY block instances for recipe conversion.");
  return this.pieces(sourceId,pieces,floor,role,[t.translation[0]-floor.sourceOrigin[0],t.translation[1]-floor.sourceOrigin[1],t.translation[2]],t.rotation[2],[sourceId]);
 }
}
