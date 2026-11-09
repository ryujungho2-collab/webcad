import {fitSpline} from "../src/precision/fitSpline";
import {sampleSpline,splineArea,splineBezierSpans,splinePoint} from "../src/precision/splineGeometry";
import {sampleEllipse} from "../src/precision/ellipseGeometry";
import {offsetDrawingForObject} from "../src/features/drawing-editing/geometry/drawingOperations";
import type {CadEllipse} from "@agent-webcad/cad-document";
export type P=[number,number];
export const FLOW_ANCHORS:P[]=[[9000,1000],[3000,2200],[900,7000],[2300,13500],[7500,17100],[14500,17600],[22500,14900],[25300,10300],[23900,5000],[17500,3000],[13000,1800]].reverse() as P[];
export function flowOutline(floor=1){const pts=FLOW_ANCHORS.map(([x,y])=>floor===1?[x,y,0]:[12800+(x-12800)*.9+150,9000+(y-9000)*.93+150,0]) as [number,number,number][];return fitSpline(pts,true,.9);}
export const FLOW_ATRIUM:CadEllipse={center:[12000,8000,0],axisU:[3600*Math.cos(.32),3600*Math.sin(.32),0],axisV:[-2300*Math.sin(.32),2300*Math.cos(.32),0],startParam:0,sweep:Math.PI*2};
export function flowBoundary(floor:number){const p=sampleSpline(flowOutline(floor),2);p.pop();return p;}
export function flowInnerBoundary(floor:number){const points=flowBoundary(floor),o={id:"boundary",name:"Boundary",geometryId:"g",visible:true,layerId:"l",transform:{translation:[0,0,0] as [number,number,number],rotation:[0,0,0] as [number,number,number],scale:[1,1,1] as [number,number,number]}},f={id:"f",type:"drawing" as const,inputs:[],output:"boundary",params:{kind:"polyline",closed:true,workPlane:"XY",points}};const p=offsetDrawingForObject(o,f,300,"left");if(!p)throw Error("Facade offset is not a simple valid ring.");return p.points as [number,number,number][];}
export const bridge={a:[8100,5700] as P,b:[16400,10500] as P,width:1500};
const dx=bridge.b[0]-bridge.a[0],dy=bridge.b[1]-bridge.a[1],len=Math.hypot(dx,dy);
export const bridgeNormal:P=[-dy/len,dx/len];
export const FLOW_STAIRS=[{id:"main",x:19500,y:7000,width:1200,going:280,landing:1400},{id:"rear",x:6000,y:10800,width:1100,going:250,landing:1200}];
export function flowFloorOpenings(floor:number):P[][]{return [...atriumOpenings(floor),...(floor===2?[...FLOW_STAIRS.map(s=>{const w=s.width*2+200,d=13*s.going+s.landing;return [[s.x,s.y],[s.x+w,s.y],[s.x+w,s.y+d],[s.x,s.y+d]] as P[];}),[[17550,13350],[19450,13350],[19450,15450],[17550,15450]] as P[]]:[])];}
export function flowExtents(floor:number){const s=flowOutline(floor),points=s.controlPoints.slice(0,1);for(const span of splineBezierSpans(s))for(const axis of [0,1]){const p=span.h.map(q=>q[axis]/q[3]),a=3*(-p[0]+3*p[1]-3*p[2]+p[3]),b=2*(3*p[0]-6*p[1]+3*p[2]),c=3*(p[1]-p[0]),ts=[0,1];if(Math.abs(a)<1e-10){if(Math.abs(b)>1e-10)ts.push(-c/b);}else{const disc=b*b-4*a*c;if(disc>=0)ts.push((-b+Math.sqrt(disc))/(2*a),(-b-Math.sqrt(disc))/(2*a));}for(const t of ts)if(t>=0&&t<=1)points.push(splinePoint(s,span.a+(span.b-span.a)*t));}return {min:[0,1].map(i=>Math.min(...points.map(p=>p[i]))) as P,max:[0,1].map(i=>Math.max(...points.map(p=>p[i]))) as P};}
export function clipHalfPlane(points:P[],normal:P,limit:number,positive:boolean):P[]{const out:P[]=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],fa=a[0]*normal[0]+a[1]*normal[1]-limit,fb=b[0]*normal[0]+b[1]*normal[1]-limit,ina=positive?fa>=0:fa<=0,inb=positive?fb>=0:fb<=0;if(ina)out.push(a);if(ina!==inb){const t=fa/(fa-fb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}return out;}
export function atriumOpenings(floor:number):P[][]{const ring=sampleEllipse(FLOW_ATRIUM,.5).slice(0,-1).map(p=>[p[0],p[1]] as P);if(floor===1)return [ring];const c=bridge.a[0]*bridgeNormal[0]+bridge.a[1]*bridgeNormal[1];return [clipHalfPlane(ring,bridgeNormal,c+750,true),clipHalfPlane(ring,bridgeNormal,c-750,false)];}
export const polygonArea=(p:P[])=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0)/2);
/** Shared authored roof underside height field, used only as 2D section/elevation design data. */
export const roofHeight=(x:number,y:number)=>7550+1250*Math.exp(-(((x-6800)/6000)**2))+650*Math.exp(-(((x-22300)/4600)**2))-300*Math.exp(-(((x-14500)/3500)**2))+100*Math.sin((y-8000)/8000*Math.PI/2);
export const flowAreas=()=>[1,2].map(f=>({floor:f,envelopeM2:splineArea(flowOutline(f),.01)!/1e6,openingM2:flowFloorOpenings(f).reduce((s,p)=>s+polygonArea(p),0)/1e6,netPlateM2:splineArea(flowOutline(f),.01)!/1e6-flowFloorOpenings(f).reduce((s,p)=>s+polygonArea(p),0)/1e6}));
export function inside(p:P,ring:P[]){let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
