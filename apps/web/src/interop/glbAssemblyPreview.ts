import {Matrix4,Vector3,Quaternion,Euler,MathUtils} from 'three';
import {inspectGlbMetadata,validJointInput,finiteVector,type ExternalSceneAsset,type AssemblyJoint} from '@agent-webcad/cad-document';

/** Detached mapping evidence only. No CadDocument objects or Assembly Apply commands. */
export function previewGlbAssembly(json:any,source:ExternalSceneAsset['source']){
 const m=inspectGlbMetadata(json),nodes:any[]=json.nodes??[],parents=new Map<number,number>(),issues:string[]=[];
 nodes.forEach((n,i)=>(n.children??[]).forEach((c:number)=>{if(parents.has(c))issues.push('Multiple node parents.');parents.set(c,i);}));
 const worldCache=new Map<number,Matrix4>(),visiting=new Set<number>();
 const world=(i:number):Matrix4=>{if(worldCache.has(i))return worldCache.get(i)!.clone();if(!nodes[i]||visiting.has(i))throw Error('Invalid node reference or cycle.');visiting.add(i);const n=nodes[i],local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));const result=parents.has(i)?world(parents.get(i)!).multiply(local):local;visiting.delete(i);worldCache.set(i,result);return result.clone();};
 const basis=new Matrix4().makeRotationX(Math.PI/2).scale(new Vector3(1000,1000,1000)),inverseBasis=basis.clone().invert();
 const cadWorld=(i:number)=>basis.clone().multiply(world(i)).multiply(inverseBasis);
 const rigid=(matrix:Matrix4)=>{const p=new Vector3(),q=new Quaternion(),s=new Vector3();matrix.decompose(p,q,s);return s.toArray().every(v=>Math.abs(v-1)<1e-5)&&matrix.elements.every((v,i)=>Math.abs(v-new Matrix4().compose(p,q,s).elements[i])<1e-5);};
 const body=(i:number):number|undefined=>{const seen=new Set<number>();let n:number|undefined=i;while(n!==undefined&&!seen.has(n)){seen.add(n);if(nodes[n]?.extensions?.KHR_physics_rigid_bodies?.motion!==undefined)return n;n=parents.get(n);}return undefined;};
 const graph=new Map<number,number>();
 const rows=m.joints.map((j,index)=>{
  const reasons:string[]=[],raw=j.raw,sourceAxis=j.type==='fixed'&&raw?.axis===undefined?[0,0,1]:raw?.axis,parentIds=nodes.flatMap((n,i)=>n.name===raw?.parent?[i]:[]),parent=parentIds.length===1?parentIds[0]:undefined;
  if(parent===undefined||parent===j.child)reasons.push('Missing, ambiguous or self parent reference.');
  if(graph.has(j.child))issues.push('Multiple incoming joints on one body.');if(parent!==undefined)graph.set(j.child,parent);
  const supported=j.type==='fixed'||j.type==='revolute';if(!supported)reasons.push(`Unsupported joint type: ${j.type}. Preserved in original GLB.`);
  if(source.coordinateConvention!=='simready-model-rest')reasons.push('Joint coordinate convention is not established for this source.');
  if(j.origin.state!=='valid'||!(finiteVector(sourceAxis)&&Math.abs(Math.hypot(...sourceAxis)-1)<1e-4))reasons.push('Missing/invalid origin or unit axis.');
  if(j.type==='revolute'&&raw.unit!=='degrees')reasons.push('Revolute angle unit must be degrees.');
  let candidate:AssemblyJoint|undefined;
  try{
   if(parent!==undefined){
    if(m.parts[parent]?.rigidBody.state!=='valid'||m.parts[j.child]?.rigidBody.state!=='valid')reasons.push('Both endpoints require rigid body metadata.');
    const pw=cadWorld(parent),cw=cadWorld(j.child),rest=pw.clone().invert().multiply(cw);
    if(!rigid(pw)||!rigid(cw)||!rigid(rest))reasons.push('Non-unit scale, reflection or shear in rest frame.');
    const connections=m.extensionJoints.filter(e=>body(e.node)===parent&&body(e.connectedNode)===j.child);
    if(connections.length!==1)reasons.push('Exactly one matching physics extension joint is required to cross-check rest frames.');
    else {
     const e=connections[0],definition=m.extensionJointDefinitions[e.joint],a=world(e.node),b=world(e.connectedNode),ap=new Vector3().setFromMatrixPosition(a),bp=new Vector3().setFromMatrixPosition(b);
     if(!definition||!Array.isArray(definition.limits))reasons.push('Invalid physics joint definition reference.');
     if(ap.distanceTo(bp)>.0001||finiteVector(raw.pivot)&&ap.distanceTo(new Vector3(...raw.pivot))>.0001)reasons.push('Rest frame origins disagree by more than 0.1 mm.');
     const aq=new Quaternion(),bq=new Quaternion();a.decompose(new Vector3(),aq,new Vector3());b.decompose(new Vector3(),bq,new Vector3());if(aq.angleTo(bq)>1e-4)reasons.push('Joint frame orientations disagree at the declared zero rest angle.');
     if(definition&&supported){
      const limits=definition.limits as any[],free=([0,1,2] as const).filter(axis=>!limits.some(l=>l.angularAxes?.includes(axis)&&l.min===0&&l.max===0));
      if(![0,1,2].every(axis=>limits.some(l=>l.linearAxes?.includes(axis)&&l.min===0&&l.max===0)))reasons.push('Physics extension allows translation.');
      if(j.type==='fixed'&&free.length)reasons.push('Physics extension is not fixed.');
      if(j.type==='revolute'){
       if(free.length!==1)reasons.push('Physics extension is not single-axis revolute.');
       else {const axis=new Vector3(...([0,1,2].map(i=>i===free[0]?1:0) as [number,number,number])).transformDirection(a),childAxis=new Vector3(...([0,1,2].map(i=>i===free[0]?1:0) as [number,number,number])).transformDirection(b);if(!finiteVector(raw.axis)||axis.dot(new Vector3(...raw.axis))<.9999||axis.dot(childAxis)<.9999)reasons.push('Joint axes disagree across extras and rest frames.');
        const lim=limits.find(l=>l.angularAxes?.length===1&&l.angularAxes[0]===free[0]);for(const key of ['min','max'])if((raw[key]===undefined)!==(lim?.[key]===undefined)||raw[key]!==undefined&&Math.abs(raw[key]*Math.PI/180-lim[key])>1e-5)reasons.push(`Joint ${key} limit disagrees with physics extension.`);
       }
      }
     }
    }
    if(supported&&finiteVector(raw.pivot)&&finiteVector(sourceAxis)){
     const parentInverse=pw.clone().invert(),origin=new Vector3(...raw.pivot).applyMatrix4(basis).applyMatrix4(parentInverse),axis=new Vector3(...sourceAxis).transformDirection(basis).transformDirection(parentInverse),p=new Vector3(),q=new Quaternion(),s=new Vector3();rest.decompose(p,q,s);const r=new Euler().setFromQuaternion(q,'XYZ');
     candidate={id:`glb-joint-${index}`,type:j.type as 'fixed'|'revolute',parentId:`node-${parent}`,childId:`node-${j.child}`,origin:origin.toArray(),axis:axis.toArray(),angle:0,rest:{translation:p.toArray(),rotation:[r.x,r.y,r.z].map(MathUtils.radToDeg) as [number,number,number],scale:[1,1,1]},...(raw.min===undefined?{}:{min:raw.min}),...(raw.max===undefined?{}:{max:raw.max})};
     if(!validJointInput(Object.fromEntries(Object.entries(candidate).filter(([k])=>k!=='rest'))))reasons.push('Invalid native Joint values or rest angle outside limits.');
    }
   }
  }catch(e){reasons.push(e instanceof Error?e.message:String(e));}
  return {name:String(raw?.name??`Joint ${index}`).slice(0,200),type:j.type,parent,child:j.child,status:reasons.length?'blocked' as const:'candidate' as const,reasons,candidate:reasons.length?undefined:candidate,raw};
 });
 for(const start of graph.keys()){let n:number|undefined=start;const seen=new Set<number>();while(n!==undefined){if(seen.has(n)){issues.push('Joint graph cycle.');break;}seen.add(n);n=graph.get(n);}}
 if(m.extensionJoints.some(e=>!nodes[e.connectedNode]||!m.extensionJointDefinitions[e.joint]))issues.push('Invalid physics extension joint reference.');
 if(issues.length)for(const row of rows){row.status='blocked';row.candidate=undefined;row.reasons.push(...new Set(issues));}
 return {rows,candidateCount:rows.filter(r=>r.status==='candidate').length,issues:[...new Set(issues)],applySupported:false,semantics:'Source pivot/axis: model rest frame, metres, Y-up. Preview: parent-local origin in mm, unit axis, Z-up; rest = inverse(parent) × child. Native Fixed/Revolute tree only. No body conversion or Assembly Apply.',warning:m.warning};
}
