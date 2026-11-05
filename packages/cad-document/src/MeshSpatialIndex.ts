import {type EditableMesh,type MeshVector} from "./EditableMesh";
import {meshTriangles,add,sub,mul,dot,cross,unit} from "./MeshTopology";
type Box={min:MeshVector;max:MeshVector};
type Triangle={ids:string[];points:MeshVector[];faceId:string;box:Box};
type Branch={box:Box;left?:Branch;right?:Branch;triangles?:Triangle[]};
const bounds=(points:MeshVector[]):Box=>({min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))) as MeshVector,max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))) as MeshVector});
const boxDistance=(b:Box,p:MeshVector)=>[0,1,2].reduce((s,i)=>s+Math.max(b.min[i]-p[i],0,p[i]-b.max[i])**2,0);
function rayBox(b:Box,o:MeshVector,d:MeshVector,max:number){let low=0,high=max;for(let i=0;i<3;i++){if(Math.abs(d[i])<1e-14){if(o[i]<b.min[i]-1e-9||o[i]>b.max[i]+1e-9)return false;}else{const a=(b.min[i]-o[i])/d[i],c=(b.max[i]-o[i])/d[i];low=Math.max(low,Math.min(a,c));high=Math.min(high,Math.max(a,c));if(low>high)return false;}}return true;}
function rayTriangle(t:Triangle,o:MeshVector,d:MeshVector){const [a,b,c]=t.points,e=sub(b,a),f=sub(c,a),p=cross(d,f),det=dot(e,p);if(Math.abs(det)<1e-12)return;const s=sub(o,a),u=dot(s,p)/det,q=cross(s,e),v=dot(d,q)/det,distance=dot(f,q)/det;if(u< -1e-9||v< -1e-9||u+v>1+1e-9||distance<0)return;return distance;}
/** Closest point on a triangle, including its edges and vertices. */
function closest(p:MeshVector,[a,b,c]:MeshVector[]):MeshVector{const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return a;const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return add(a,mul(ab,d1/(d1-d3)));const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return add(a,mul(ac,d2/(d2-d6)));const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0)return add(b,mul(sub(c,b),(d4-d3)/(d4-d3+d5-d6)));const inv=1/(va+vb+vc);return add(a,add(mul(ab,vb*inv),mul(ac,vc*inv)));}
/** Immutable triangle BVH. Rebuild after topology changes; a stroke uses its frozen source. */
export class MeshSurfaceIndex{
 private root:Branch;
 constructor(mesh:EditableMesh){const p=new Map(mesh.vertices.map(v=>[v.id,v.position]));const triangles=meshTriangles(mesh).map(t=>{const points=t.vertices.map(id=>p.get(id)!);return {ids:t.vertices,points,faceId:t.faceId,box:bounds(points)};});
  const build=(ts:Triangle[]):Branch=>{const box=bounds(ts.flatMap(t=>[t.box.min,t.box.max]));if(ts.length<=8)return {box,triangles:ts};const axis=[0,1,2].sort((a,b)=>(box.max[b]-box.min[b])-(box.max[a]-box.min[a]))[0];ts.sort((a,b)=>a.box.min[axis]+a.box.max[axis]-b.box.min[axis]-b.box.max[axis]);const mid=Math.floor(ts.length/2);return {box,left:build(ts.slice(0,mid)),right:build(ts.slice(mid))};};this.root=build(triangles);
 }
 raycast(origin:MeshVector,direction:MeshVector){const d=unit(direction);let distance=Infinity,triangle:Triangle|undefined;const visit=(n:Branch)=>{if(!rayBox(n.box,origin,d,distance))return;if(n.triangles)for(const t of n.triangles){const hit=rayTriangle(t,origin,d);if(hit!==undefined&&hit<distance){distance=hit;triangle=t;}}else{visit(n.left!);visit(n.right!);}};visit(this.root);if(!triangle)return;const t=triangle as Triangle;return {point:add(origin,mul(d,distance)),normal:unit(cross(sub(t.points[1],t.points[0]),sub(t.points[2],t.points[0]))),faceId:t.faceId,distance};}
 nearest(point:MeshVector){let distance2=Infinity,result:MeshVector=point;const visit=(n:Branch)=>{if(boxDistance(n.box,point)>distance2)return;if(n.triangles)for(const t of n.triangles){const q=closest(point,t.points),d=dot(sub(point,q),sub(point,q));if(d<distance2){distance2=d;result=q;}}else{const children=[n.left!,n.right!].sort((a,b)=>boxDistance(a.box,point)-boxDistance(b.box,point));children.forEach(visit);}};visit(this.root);return {point:[...result] as MeshVector,distance:Math.sqrt(distance2)};}
 contains(point:MeshVector){const d=unit([1,.3713906763541037,.2173913043478261]),hits:number[]=[];const visit=(n:Branch)=>{if(!rayBox(n.box,point,d,Infinity))return;if(n.triangles)for(const t of n.triangles){const x=rayTriangle(t,point,d);if(x!==undefined&&x>1e-9)hits.push(x);}else{visit(n.left!);visit(n.right!);}};visit(this.root);hits.sort((a,b)=>a-b);return hits.filter((n,i)=>i===0||Math.abs(n-hits[i-1])>1e-7).length%2===1;}
}
/** Fixed source hash: sphere queries visit only overlapping buckets and exact-radius vertices. */
export class MeshVertexIndex{
 private buckets=new Map<string,number[]>();
 constructor(private mesh:EditableMesh,private cellSize:number){if(!Number.isFinite(cellSize)||cellSize<=0)throw Error("Positive spatial cell size required.");mesh.vertices.forEach((v,i)=>{const key=this.key(v.position),list=this.buckets.get(key)??[];list.push(i);this.buckets.set(key,list);});}
 private key(p:MeshVector){return p.map(n=>Math.floor(n/this.cellSize)).join(",");}
 sphere(center:MeshVector,radius:number){const min=center.map(n=>Math.floor((n-radius)/this.cellSize)),max=center.map(n=>Math.floor((n+radius)/this.cellSize)),result:number[]=[];if(max.reduce((n,v,i)=>n*(v-min[i]+1),1)>4096)throw Error("Spatial query cell budget exceeded.");for(let x=min[0];x<=max[0];x++)for(let y=min[1];y<=max[1];y++)for(let z=min[2];z<=max[2];z++)for(const i of this.buckets.get(`${x},${y},${z}`)??[])if(Math.hypot(...sub(this.mesh.vertices[i].position,center))<radius)result.push(i);return result;}
}
