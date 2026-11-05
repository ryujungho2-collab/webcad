import {meshElementId,meshVector,type MeshVector} from "./EditableMesh";

/** A material point on a control-mesh triangle, never a nearest-face guess. */
export type HybridSurfaceReference = {
  version:1; documentId:string; sessionId:string; objectId:string; geometryId:string;
  representation:"editable-mesh"; fingerprint:string; topologyFingerprint:string;
  lineageFingerprint:string; derivationFingerprint:string; provenanceRevision:number;
  faceId:string; triangle:[string,string,string]; barycentric:MeshVector;
  point:MeshVector; normal:MeshVector; datumEnabled:boolean;
};
export function validHybridReference(value:unknown):value is HybridSurfaceReference {
  if(!value||typeof value!=="object")return false;
  const r=value as HybridSurfaceReference;
  return r.version===1&&r.representation==="editable-mesh"&&
    [r.documentId,r.sessionId,r.objectId,r.geometryId].every(s=>typeof s==="string"&&s.length>0&&s.length<=256)&&
    [r.fingerprint,r.topologyFingerprint,r.lineageFingerprint,r.derivationFingerprint].every(s=>typeof s==="string"&&/^[a-f0-9]{16}$/.test(s))&&
    Number.isInteger(r.provenanceRevision)&&r.provenanceRevision>=0&&r.provenanceRevision<=200&&
    meshElementId(r.faceId)&&Array.isArray(r.triangle)&&r.triangle.length===3&&r.triangle.every(meshElementId)&&new Set(r.triangle).size===3&&
    meshVector(r.barycentric)&&r.barycentric.every(n=>n>=-1e-8&&n<=1+1e-8)&&Math.abs(r.barycentric.reduce((a,b)=>a+b,0)-1)<1e-8&&
    meshVector(r.point)&&meshVector(r.normal)&&Math.abs(Math.hypot(...r.normal)-1)<1e-6&&typeof r.datumEnabled==="boolean";
}

/** Persisted receipts are validated even when the originating source is later missing. */
export function validHybridFeature(feature:import("./Feature").CadFeature):boolean {
  const h=feature.params.hybridDatum as Record<string,unknown>|undefined,c=feature.params.hybridConversion as Record<string,unknown>|undefined;
  if(h!==undefined&&(!h||typeof h!=="object"||feature.type!=="extrude"||feature.dependencyMode!=="live"||feature.inputs.length!==1||typeof h.referenceId!=="string"||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(h.referenceId)||![h.width,h.depth,h.height].every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=.01&&n<=10000)||typeof h.fingerprint!=="string"||!/^[a-f0-9]{16}$/.test(h.fingerprint)||!["resolved","unresolved"].includes(String(h.status))))return false;
  if(h!==undefined){
    const profile=feature.params.profile as {normal?:unknown;segments?:{kind?:string;start?:unknown;end?:unknown}[]}|undefined,segments=profile?.segments;
    if(feature.params.distance!==h.height||!meshVector(profile?.normal)||Math.abs(Math.hypot(...profile.normal)-1)>1e-6||!Array.isArray(segments)||segments.length!==4)return false;
    for(let i=0;i<4;i++){
      const s=segments[i],next=segments[(i+1)%4];if(s.kind!=="line"||!meshVector(s.start)||!meshVector(s.end)||!meshVector(next.start))return false;
      if(Math.hypot(...s.end.map((n,j)=>n-(next.start as MeshVector)[j]))>1e-7)return false;
      const edge=s.end.map((n,j)=>n-(s.start as MeshVector)[j]),length=Math.hypot(...edge),expected=Number(i%2?h.depth:h.width);
      if(Math.abs(length-expected)>Math.max(1e-7,expected*1e-9)||Math.abs(edge.reduce((n,v,j)=>n+v*(profile.normal as MeshVector)[j],0))>1e-6)return false;
    }
    const e=segments.map(s=>(s.end as MeshVector).map((n,j)=>n-(s.start as MeshVector)[j]));
    if(Math.abs(e[0].reduce((n,v,j)=>n+v*e[1][j],0))>1e-7*Number(h.width)*Number(h.depth))return false;
  }
  if(c!==undefined){
    if(!c||typeof c!=="object"||feature.type!=="mesh"||c.version!==1||c.sourceRepresentation!=="brep"||c.resultRepresentation!=="editable-mesh"||![c.sourceObjectId,c.sourceDocumentId,c.sourceFingerprint,c.accuracy].every(s=>typeof s==="string"&&s.length>0)||!Number.isSafeInteger(c.sourceRevision)||Number(c.sourceRevision)<0||c.linearDeflection!==.1||c.angularDeflection!==.5||c.relative!==false||c.weldTolerance!==1e-7||typeof c.maxWeldDistance!=="number"||c.maxWeldDistance<0||c.maxWeldDistance>1e-7||!c.faceMap||typeof c.faceMap!=="object"||Array.isArray(c.faceMap)||Object.keys(c.faceMap).length>128||!Array.isArray(c.lost)||!c.lost.every(s=>typeof s==="string"))return false;
    const mapped=Object.values(c.faceMap).flat();if(!mapped.length||mapped.length>20000||mapped.some(id=>!meshElementId(id))||new Set(mapped).size!==mapped.length||typeof c.resultTopologyFingerprint!=="string"||!/^[a-f0-9]{16}$/.test(c.resultTopologyFingerprint))return false;
  }
  return true;
}
