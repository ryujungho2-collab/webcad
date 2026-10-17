export type WorkPlaneVector = [number, number, number];
export type CadWorkPlaneFrame = { origin: WorkPlaneVector; xAxis: WorkPlaneVector; yAxis: WorkPlaneVector; normal: WorkPlaneVector };
export type CadWorkPlaneFaceSource = { kind: "brep-face"; objectId: string; topologyId: string };
/** A face-bound plane retains its captured frame for review, but resolution uses only the exact saved face key. */
export type CadWorkPlane = CadWorkPlaneFrame & { id: string; name: string; source?: CadWorkPlaneFaceSource };
const record=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
const vector=(value:unknown):value is WorkPlaneVector=>Array.isArray(value)&&value.length===3&&value.every(v=>typeof v==="number"&&Number.isFinite(v));
const dot=(a:WorkPlaneVector,b:WorkPlaneVector)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:WorkPlaneVector,b:WorkPlaneVector):WorkPlaneVector=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const validWorkPlaneId=(value:unknown):value is string=>typeof value==="string"&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)&&!["XY","XZ","YZ","__proto__","prototype","constructor"].includes(value);
export function validWorkPlaneFrame(value:unknown):value is CadWorkPlaneFrame {
  if(!record(value)||!vector(value.origin)||!vector(value.xAxis)||!vector(value.yAxis)||!vector(value.normal))return false;
  const {xAxis:x,yAxis:y,normal:n}=value;
  return [x,y,n].every(v=>Math.abs(dot(v,v)-1)<=1e-6)&&Math.abs(dot(x,y))<=1e-6&&Math.abs(dot(x,n))<=1e-6&&Math.abs(dot(y,n))<=1e-6&&dot(cross(x,y),n)>=1-1e-6;
}
export function validWorkPlaneFaceSource(value:unknown):value is CadWorkPlaneFaceSource {
  return record(value)&&value.kind==="brep-face"&&typeof value.objectId==="string"&&value.objectId.length>0&&typeof value.topologyId==="string"&&value.topologyId.length<=512&&value.topologyId.startsWith("face:");
}
export function validCadWorkPlane(value:unknown):value is CadWorkPlane {
  if(!validWorkPlaneFrame(value)||!record(value))return false;
  const plane=value as CadWorkPlaneFrame&Record<string,unknown>;
  return validWorkPlaneId(plane.id)&&typeof plane.name==="string"&&plane.name.trim().length>0&&plane.name.length<=80&&(plane.source===undefined||validWorkPlaneFaceSource(plane.source));
}
export function validateCadWorkPlanes(planes:Record<string,CadWorkPlane>|undefined):void {
  if(planes===undefined)return;
  if(!record(planes))throw Error("Invalid work plane collection.");
  for(const [id,plane] of Object.entries(planes))if(!validCadWorkPlane(plane)||plane.id!==id)throw Error(`Invalid work plane ${id}.`);
}
