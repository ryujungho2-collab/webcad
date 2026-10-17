import type {ArchitectureWall,CadDocument} from "@agent-webcad/cad-document";
import type {ExtrudeProfile} from "@agent-webcad/cad-kernel";
import {extractSketchLoops} from "./sketchProfiles";
import {getWorldDrawingGeometry} from "./worldGeometry";
import type {Vec3} from "./workPlane";
export type WallFrame={start:Vec3;u:Vec3;v:Vec3;length:number;thickness:number};
const norm=(p:Vec3)=>Math.hypot(...p),sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3;
const point=(f:WallFrame,x:number,y:number,z:number):Vec3=>[f.start[0]+f.u[0]*x+f.v[0]*y,f.start[1]+f.u[1]*x+f.v[1]*y,z];
function rectangle(points:Vec3[],id:string):ExtrudeProfile{return {id,normal:[0,0,1],segments:points.map((start,i)=>({kind:"line",start,end:points[(i+1)%points.length],topologyReference:`${id}:${i}`}))};}
export function wallFootprint(document:CadDocument,definition:ArchitectureWall):{params:Record<string,unknown>;frame?:WallFrame}{
  let profiles:ExtrudeProfile[],frame:WallFrame|undefined;
  if(definition.mode==="centerline"){
    if(definition.sourceObjectIds.length!==1)throw Error("Each centerline wall requires one straight line; create multiple walls as a batch.");
    const id=definition.sourceObjectIds[0],object=document.objects[id],feature=Object.values(document.features).find(f=>f.output===id),world=object&&feature?.type==="drawing"?getWorldDrawingGeometry(object,feature):null;
    if(!world||world.kind!=="line"||world.workPlane!=="XY"||!world.planeAligned||!world.uniformScale||feature?.params.construction)throw Error("Centerline walls require one finite XY straight line. Use a prepared footprint for corners/curves.");
    const [a,b]=world.points!,d=sub(b,a),length=Math.hypot(d[0],d[1]);if(length<1e-6||Math.abs(d[2])>1e-6)throw Error("Wall centerline must be horizontal and nonzero.");
    const u:Vec3=[d[0]/length,d[1]/length,0];frame={start:[a[0],a[1],definition.baseLevel],u,v:[-u[1],u[0],0],length,thickness:definition.thickness};
    profiles=[rectangle([[0,-frame.thickness/2],[length,-frame.thickness/2],[length,frame.thickness/2],[0,frame.thickness/2]].map(([x,y])=>point(frame!,x,y,definition.baseLevel)),`wall:${id}`)];
  }else{
    const result=extractSketchLoops(document,definition.sourceObjectIds,{forRegeneration:true});if(!result.ok)throw Error(result.reason);
    if(result.loops.some(l=>l.workPlane!=="XY"))throw Error("Architectural wall footprints must lie in XY. Base level is world Z in mm.");
    const shift=(p:ExtrudeProfile):ExtrudeProfile=>({...structuredClone(p),segments:p.segments.map(s=>s.kind==="circle"?{...s,center:[s.center[0],s.center[1],definition.baseLevel]}:s.kind==="arc"?{...s,start:[s.start[0],s.start[1],definition.baseLevel],mid:[s.mid[0],s.mid[1],definition.baseLevel],end:[s.end[0],s.end[1],definition.baseLevel]}:{...s,start:[s.start[0],s.start[1],definition.baseLevel],end:[s.end[0],s.end[1],definition.baseLevel]}),holes:p.holes?.map(shift)});
    profiles=result.loops.map(shift);
    const outer=profiles[0];
    if(profiles.length===1&&!outer.holes?.length&&outer.segments.length===4&&outer.segments.every(s=>s.kind==="line")){
      const points=outer.segments.map(s=>(s as Extract<typeof s,{kind:"line"}>).start),directions=points.map((p,i)=>sub(points[(i+1)%4],p)),lengths=directions.map(norm),i=lengths.indexOf(Math.max(...lengths)),j=(i+1)%4,u=directions[i].map(v=>v/lengths[i]) as Vec3,v:Vec3=[-u[1],u[0],0];
      if(lengths.every(n=>n>1e-6)&&directions.every((d,k)=>Math.abs(d[0]*directions[(k+1)%4][0]+d[1]*directions[(k+1)%4][1])<1e-7*lengths[k]*lengths[(k+1)%4])&&norm(directions[0].map((v,k)=>v+directions[2][k]) as Vec3)<1e-6){
        const center=points.reduce((s,p)=>s.map((v,k)=>v+p[k]/4) as Vec3,[0,0,0] as Vec3),inward=(center[0]-points[i][0])*v[0]+(center[1]-points[i][1])*v[1]>0?1:-1;
        frame={start:points[i].map((n,k)=>n+v[k]*inward*lengths[j]/2) as Vec3,u,v,length:lengths[i],thickness:lengths[j]};
      }
    }
  }
  if(definition.openings.length&&!frame)throw Error("Openings currently need a straight centerline wall or one rectangular strip footprint. Split complex walls into explicit hosts.");
  const params:Record<string,unknown>={kind:"extrude",distance:definition.height,...(profiles.length===1?{profile:profiles[0]}:{profiles})};
  for(const opening of definition.openings){
    const f=frame!,left=opening.along-opening.width/2,right=opening.along+opening.width/2;
    if(left<=1e-6||right>=f.length-1e-6||opening.sill+opening.height>Math.abs(definition.height)+1e-6)throw Error(`Opening ${opening.id} is outside the wall or removes an end pier. Check along/width/sill/height.`);
    if(definition.openings.some(other=>other.id!==opening.id&&Math.min(right,other.along+other.width/2)-Math.max(left,other.along-other.width/2)>-1e-6&&Math.min(opening.sill+opening.height,other.sill+other.height)-Math.max(opening.sill,other.sill)>-1e-6))throw Error(`Opening ${opening.id} overlaps or touches another opening. Keep a positive pier/lintel between openings.`);
  }
  let output=params;
  for(const opening of definition.openings){
    const f=frame!,sign=Math.sign(definition.height),margin=Math.max(.01,f.thickness*.001),z=definition.baseLevel+sign*opening.sill;
    const profile=rectangle([[opening.along-opening.width/2,-f.thickness/2-margin],[opening.along+opening.width/2,-f.thickness/2-margin],[opening.along+opening.width/2,f.thickness/2+margin],[opening.along-opening.width/2,f.thickness/2+margin]].map(([x,y])=>point(f,x,y,z)),`opening:${opening.id}`);
    const operand=(params:Record<string,unknown>)=>({params,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}});
    output={operation:"cut",operands:[operand(output),operand({kind:"extrude",profile,distance:sign*opening.height})]};
  }
  return {params:{...output,architecturalWall:structuredClone(definition)},frame};
}

