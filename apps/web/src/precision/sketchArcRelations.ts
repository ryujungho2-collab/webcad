import type { SketchGeometry, SketchPoint } from "@agent-webcad/cad-document";

type Arc = Extract<SketchGeometry,{kind:"arc"}>;
type Curve = Extract<SketchGeometry,{kind:"arc"|"circle"}>;
const TAU=Math.PI*2;
const wrap=(angle:number)=>((angle%TAU)+TAU)%TAU;

/** Signed travel beyond the selected directed arc; zero includes both endpoints. */
export function arcIntervalError(arc:Arc,point:SketchPoint):number {
  const sweep=arc.endAngle-arc.startAngle,span=Math.abs(sweep);
  if(!Number.isFinite(span)||span<=1e-9||span>=TAU-1e-9)return Number.NaN;
  const angle=Math.atan2(point[1]-arc.center[1],point[0]-arc.center[0]);
  const travel=wrap(Math.sign(sweep)*(angle-arc.startAngle));
  if(travel<=span||travel>=TAU-1e-10)return 0;
  const pastEnd=travel-span,beforeStart=TAU-travel;
  return (pastEnd<=beforeStart?pastEnd:-beforeStart)*arc.radius;
}

export function projectPointToArc(arc:Arc,desired:SketchPoint):SketchPoint {
  const dx=desired[0]-arc.center[0],dy=desired[1]-arc.center[1],angle=Math.atan2(dy,dx);
  const point:SketchPoint=[arc.center[0]+arc.radius*Math.cos(angle),arc.center[1]+arc.radius*Math.sin(angle)];
  if(Math.abs(arcIntervalError(arc,point))<=1e-9)return point;
  const endpoint=(a:number):SketchPoint=>[arc.center[0]+arc.radius*Math.cos(a),arc.center[1]+arc.radius*Math.sin(a)];
  const start=endpoint(arc.startAngle),end=endpoint(arc.endAngle);
  return Math.hypot(desired[0]-start[0],desired[1]-start[1])<=Math.hypot(desired[0]-end[0],desired[1]-end[1])?start:end;
}

export function lineArcContact(line:[SketchPoint,SketchPoint],arc:Arc,side:1|-1):{point:SketchPoint;segmentError:number;arcError:number;distanceError:number}|null {
  const [a,b]=line,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<=1e-9)return null;
  const ux=dx/length,uy=dy/length,nx=-uy,ny=ux;
  const signed=(arc.center[0]-a[0])*nx+(arc.center[1]-a[1])*ny;
  const point:SketchPoint=[arc.center[0]-side*arc.radius*nx,arc.center[1]-side*arc.radius*ny];
  const along=(point[0]-a[0])*ux+(point[1]-a[1])*uy;
  return {point,segmentError:along<0?along:along>length?along-length:0,arcError:arcIntervalError(arc,point),distanceError:signed-side*arc.radius};
}

export function curveCurveContact(first:Curve,second:Curve,contact:"external"|"internal"):{point:SketchPoint;firstError:number;secondError:number;distanceError:number}|null {
  const dx=second.center[0]-first.center[0],dy=second.center[1]-first.center[1],distance=Math.hypot(dx,dy);
  if(distance<=1e-9)return null;
  const ux=dx/distance,uy=dy/distance;
  const direction=contact==="external"||first.radius>second.radius?1:-1;
  const point:SketchPoint=[first.center[0]+ux*first.radius*direction,first.center[1]+uy*first.radius*direction];
  const target=contact==="external"?first.radius+second.radius:Math.abs(first.radius-second.radius);
  return {point,firstError:first.kind==="arc"?arcIntervalError(first,point):0,secondError:second.kind==="arc"?arcIntervalError(second,point):0,distanceError:distance-target};
}
