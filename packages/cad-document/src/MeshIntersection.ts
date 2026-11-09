import type {EditableMesh,MeshVector} from "./EditableMesh";
import {meshTriangles,sub,cross,dot,add,mul} from "./MeshTopology";

export type IntersectionProfile={preparationMs:number;bvhBuildMs:number;candidateSearchMs:number;trianglePredicateMs:number;totalMs:number;candidatePairs:number;predicatePairs:number;status:"valid"|"rejected"};

/** Bounded triangle-pair validation. Shared topological boundary contacts are allowed; overlapping interiors are not. */
export function validateMeshIntersections(mesh:EditableMesh,options:{maxPairs?:number;timeMs?:number;profile?:Partial<IntersectionProfile>}={}){
 const profile=options.profile,started=performance.now();let candidateMs=0,predicatePairs=0;if(profile)Object.assign(profile,{bvhBuildMs:0,status:"rejected"});try{const positions=new Map(mesh.vertices.map(v=>[v.id,v.position])),triangles=meshTriangles(mesh).map(t=>{const p=t.vertices.map(id=>positions.get(id)!);return {...t,p,min:[0,1,2].map(a=>Math.min(...p.map(v=>v[a]))),max:[0,1,2].map(a=>Math.max(...p.map(v=>v[a])))};}).sort((a,b)=>a.min[0]-b.min[0]);let pairs=0;
 const epsilon=Math.max(1e-7,...mesh.vertices.flatMap(v=>v.position.map(n=>Math.abs(n)*Number.EPSILON*32)));
 if(profile)profile.preparationMs=performance.now()-started;
 const candidates=overlappingPairs(triangles,epsilon,()=>{if(performance.now()-started>(options.timeMs??1500))throw Error("Self-intersection validation budget exceeded; result is not certified.");},profile);
 while(true){const searchStart=profile?performance.now():0;let item:IteratorResult<[number,number]>;try{item=candidates.next();}finally{if(profile)candidateMs+=performance.now()-searchStart;}if(item.done)break;const [i,j]=item.value;
  if(profile)profile.candidatePairs=pairs+1;
  if(++pairs>(options.maxPairs??2_000_000)||performance.now()-started>(options.timeMs??1500))throw Error("Self-intersection validation budget exceeded; result is not certified.");
  const a=triangles[i],b=triangles[j];if(a.faceId===b.faceId||[1,2].some(k=>a.max[k]<b.min[k]-epsilon||b.max[k]<a.min[k]-epsilon))continue;
  predicatePairs++;const shared=a.vertices.filter(id=>b.vertices.includes(id)).map(id=>positions.get(id)!);
  const allowed=(p:MeshVector)=>shared.some(q=>Math.hypot(...sub(p,q))<=epsilon)||shared.length===2&&pointOnSegment(p,shared[0],shared[1],epsilon);
  const na=cross(sub(a.p[1],a.p[0]),sub(a.p[2],a.p[0])),nb=cross(sub(b.p[1],b.p[0]),sub(b.p[2],b.p[0]));
  const parallel=Math.hypot(...cross(na,nb))<=1e-10*Math.hypot(...na)*Math.hypot(...nb);
  // Two triangles on different planes meet only along their shared edge.
  // Coplanar triangles on opposite sides of that edge also cannot overlap internally.
  if(shared.length===2){if(!parallel)continue;const edge=sub(shared[1],shared[0]),ta=a.p[a.vertices.findIndex(id=>!b.vertices.includes(id))],tb=b.p[b.vertices.findIndex(id=>!a.vertices.includes(id))];if(ta&&tb&&dot(cross(edge,sub(ta,shared[0])),cross(edge,sub(tb,shared[0])))<0)continue;}
  if(parallel&&Math.abs(dot(na,sub(b.p[0],a.p[0])))<=epsilon*Math.hypot(...na)){
   const axis=na.map(Math.abs).indexOf(Math.max(...na.map(Math.abs))),project=(p:MeshVector)=>p.filter((_,i)=>i!==axis),A=a.p.map(project),B=b.p.map(project);
   const orient=(p:number[],q:number[],r:number[])=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);const sign=Math.sign(orient(B[0],B[1],B[2]));let polygon=A;
   for(let k=0;k<3;k++){const u=B[k],v=B[(k+1)%3],input=polygon;polygon=[];for(let n=0;n<input.length;n++){const p=input[n],q=input[(n+1)%input.length],dp=sign*orient(u,v,p),dq=sign*orient(u,v,q);if(dp>=0)polygon.push(p);if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);polygon.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}}
   const origin=polygon[0]??[0,0],area=Math.abs(polygon.reduce((s,p,k)=>{const q=polygon[(k+1)%polygon.length];return s+(p[0]-origin[0])*(q[1]-origin[1])-(p[1]-origin[1])*(q[0]-origin[0]);},0))/2;
   const extent=Math.max(1,...A.concat(B).map(p=>Math.hypot(p[0]-A[0][0],p[1]-A[0][1])));
   if(area>epsilon*extent)throw Error(`Self-intersection: coplanar faces ${a.faceId} / ${b.faceId}.`);
   for(const point of polygon){const p:MeshVector=[0,0,0],axes=[0,1,2].filter(i=>i!==axis);p[axes[0]]=point[0];p[axes[1]]=point[1];p[axis]=a.p[0][axis]-(na[axes[0]]*(p[axes[0]]-a.p[0][axes[0]])+na[axes[1]]*(p[axes[1]]-a.p[0][axes[1]]))/na[axis];if(!allowed(p))throw Error(`Self-intersection: non-topological coplanar contact ${a.faceId} / ${b.faceId}.`);}
  }
  for(const [one,two] of [[a,b],[b,a]])for(let k=0;k<3;k++){const p=one.p[k],q=one.p[(k+1)%3],hit=segmentTriangle(p,q,two.p,epsilon);if(hit&&!allowed(hit))throw Error(`Self-intersection: faces ${a.faceId} / ${b.faceId}.`);}
 }
 if(profile)profile.status="valid";return {status:"valid" as const,pairs,elapsedMs:performance.now()-started,tolerance:epsilon};
 }finally{if(profile){profile.totalMs=performance.now()-started;profile.candidateSearchMs=Math.max(0,candidateMs-(profile.bvhBuildMs??0));profile.trianglePredicateMs=Math.max(0,profile.totalMs-(profile.preparationMs??0)-candidateMs);profile.predicatePairs=predicatePairs;}}
}
function pointOnSegment(p:MeshVector,a:MeshVector,b:MeshVector,e:number){const ab=sub(b,a),t=dot(sub(p,a),ab)/dot(ab,ab);return t>=-e&&t<=1+e&&Math.hypot(...sub(p,add(a,mul(ab,t))))<=e;}
function segmentTriangle(p:MeshVector,q:MeshVector,t:MeshVector[],e:number):MeshVector|null{
 const d=sub(q,p),u=sub(t[1],t[0]),v=sub(t[2],t[0]),h=cross(d,v),det=dot(u,h);if(Math.abs(det)<=1e-12*Math.max(1,Math.hypot(...d)*Math.hypot(...u)*Math.hypot(...v)))return null;
 const s=sub(p,t[0]),a=dot(s,h)/det;if(a<-e||a>1+e)return null;const r=cross(s,u),b=dot(d,r)/det;if(b<-e||a+b>1+e)return null;const distance=dot(v,r)/det;return distance>=-e&&distance<=1+e?add(p,mul(d,distance)):null;
}

/** Three-axis BVH broad phase: sparse grids and voxel surfaces do not scan whole X slabs. */
function* overlappingPairs(boxes:{min:number[];max:number[]}[],epsilon:number,checkpoint:()=>void,profile?:Partial<IntersectionProfile>):Generator<[number,number]>{
 type Node={min:number[];max:number[];ids?:number[];left?:Node;right?:Node;count:number};
 const build=(ids:number[]):Node=>{checkpoint();const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const id of ids)for(let a=0;a<3;a++){min[a]=Math.min(min[a],boxes[id].min[a]);max[a]=Math.max(max[a],boxes[id].max[a]);}if(ids.length<=8)return {min,max,ids,count:ids.length};const axis=[0,1,2].sort((a,b)=>(max[b]-min[b])-(max[a]-min[a]))[0];ids.sort((a,b)=>boxes[a].min[axis]+boxes[a].max[axis]-boxes[b].min[axis]-boxes[b].max[axis]);const mid=Math.floor(ids.length/2);return {min,max,count:ids.length,left:build(ids.slice(0,mid)),right:build(ids.slice(mid))};};
 const overlap=(a:{min:number[];max:number[]},b:{min:number[];max:number[]})=>[0,1,2].every(k=>a.max[k]>=b.min[k]-epsilon&&b.max[k]>=a.min[k]-epsilon);
 function* visit(a:Node,b:Node):Generator<[number,number]>{checkpoint();if(!overlap(a,b))return;if(a===b){if(a.ids){for(let i=0;i<a.ids.length;i++)for(let j=i+1;j<a.ids.length;j++)if(overlap(boxes[a.ids[i]],boxes[a.ids[j]]))yield [a.ids[i],a.ids[j]];}else{yield*visit(a.left!,a.left!);yield*visit(a.left!,a.right!);yield*visit(a.right!,a.right!);}return;}
  if(a.ids&&b.ids){for(const i of a.ids)for(const j of b.ids)if(overlap(boxes[i],boxes[j]))yield [i,j];}
  else if(!a.ids&&(b.ids||a.count>=b.count)){yield*visit(a.left!,b);yield*visit(a.right!,b);}else{yield*visit(a,b.left!);yield*visit(a,b.right!);}
 }
 if(boxes.length){const start=profile?performance.now():0;let root:Node;try{root=build(boxes.map((_,i)=>i));}finally{if(profile)profile.bvhBuildMs=performance.now()-start;}yield*visit(root,root);}
}
