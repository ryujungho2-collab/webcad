import type {CadCommand} from "@agent-webcad/cad-commands";
import {dispatchCadCommand} from "../../src/state/dispatchCadCommand";

/** Mechanical acceptance fixture; all geometry and relationships use production commands. */
export async function createVariablePlate(){
  const apply=async(command:CadCommand)=>{const result=await dispatchCadCommand(command);if(!result.ok)throw new Error(result.reason);};
  await apply({type:"create-sketch",id:"plate-sketch",workPlane:"XY"});
  await apply({type:"add-sketch-geometry",sketchId:"plate-sketch",geometry:{id:"outline",kind:"rectangle",origin:[0,0],width:100,height:60,cornerIds:["a","b","c","d"],edgeIds:["ab","bc","cd","da"]}});
  for(const constraint of [
    {id:"origin",kind:"fixed-point" as const,point:{geometryId:"outline",pointId:"a"},value:[0,0] as [number,number]},
    {id:"width",kind:"distance" as const,first:{geometryId:"outline",pointId:"a"},second:{geometryId:"outline",pointId:"b"},value:100},
    {id:"height",kind:"distance" as const,first:{geometryId:"outline",pointId:"b"},second:{geometryId:"outline",pointId:"c"},value:60},
  ])await apply({type:"add-sketch-constraint",sketchId:"plate-sketch",constraint});
  for(let i=0;i<4;i++){
    const x=10+80*i/3;
    await apply({type:"add-sketch-geometry",sketchId:"plate-sketch",geometry:{id:`hole-${i}`,kind:"circle",center:[x,30],radius:4,centerId:`center-${i}`,curveId:`curve-${i}`}});
    await apply({type:"add-sketch-constraint",sketchId:"plate-sketch",constraint:{id:`center-${i}`,kind:"fixed-point",point:{geometryId:`hole-${i}`,pointId:`center-${i}`},value:[x,30]}});
    await apply({type:"add-sketch-constraint",sketchId:"plate-sketch",constraint:{id:`diameter-${i}`,kind:"diameter",geometryId:`hole-${i}`,value:8}});
  }
  await apply({type:"create-extrude",id:"plate-solid",profileObjectIds:["outline","hole-0","hole-1","hole-2","hole-3"],distance:8});
  await apply({type:"batch",label:"Define plate variables",commands:[
    {type:"set-variable",name:"plateWidth",quantity:"length",expression:"100mm"},
    {type:"set-variable",name:"edgeMargin",quantity:"length",expression:"10mm"},
    {type:"set-variable",name:"holePitch",quantity:"length",expression:"(plateWidth - 2*edgeMargin)/3"},
    {type:"set-variable",name:"holeDiameter",quantity:"length",expression:"8mm"},
    {type:"set-variable",name:"thickness",quantity:"length",expression:"8mm"},
  ]});
  await apply({type:"set-parameter-binding",target:{kind:"sketch-constraint",sketchId:"plate-sketch",constraintId:"width"},expression:"plateWidth"});
  for(let i=0;i<4;i++){
    await apply({type:"set-parameter-binding",target:{kind:"sketch-constraint",sketchId:"plate-sketch",constraintId:`center-${i}`,component:"x"},expression:`edgeMargin + holePitch*${i}`});
    await apply({type:"set-parameter-binding",target:{kind:"sketch-constraint",sketchId:"plate-sketch",constraintId:`diameter-${i}`},expression:"holeDiameter"});
  }
  await apply({type:"set-parameter-binding",target:{kind:"feature",objectId:"plate-solid",parameter:"distance"},expression:"thickness"});
}
