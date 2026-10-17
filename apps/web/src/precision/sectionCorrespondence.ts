import type {SectionDrawing} from "./modelSection";
type Point=number[];
const close=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6;
const direction=(a:Point,b:Point)=>{const n=Math.hypot(b[0]-a[0],b[1]-a[1]);return [(b[0]-a[0])/n,(b[1]-a[1])/n];};
/** Anchor a unique line graph to stationary vertices, then propagate incidence.
 * Equal edge counts alone and nearest-point matching are never sufficient.
 * A changed crop, disconnected moving component or ambiguous branch rejects. */
export function preserveSectionCorrespondence(previous:SectionDrawing[],next:SectionDrawing[]):SectionDrawing[]{
 if(previous.length!==next.length)return next;
 const mapped=new Map<string,string>();
 for(const part of new Set(previous.map(g=>g.partId))){
  const old=previous.filter(g=>g.partId===part),now=next.filter(g=>g.partId===part);
  if(old.length!==now.length)return next;
  // Exact-key behavior for circles/arcs remains available; graph proof is for lines.
  if(old.some(g=>g.kind!=="line")||now.some(g=>g.kind!=="line")){if(old.some(g=>!now.some(n=>n.sourceKey===g.sourceKey)))return next;for(const g of old)mapped.set(g.sourceKey,g.sourceKey);continue;}
  const graph=(edges:SectionDrawing[])=>{const vertices:Point[]=[],ends:number[][]=[];for(const g of edges){const e:number[]=[];for(const p of g.params.points as Point[]){let i=vertices.findIndex(q=>close(p,q));if(i<0){i=vertices.length;vertices.push(p);}e.push(i);}ends.push(e);}return {vertices,ends,degree:vertices.map((_,i)=>ends.filter(e=>e.includes(i)).length)};};
  const a=graph(old),b=graph(now);if(a.vertices.length!==b.vertices.length)return next;
  const vertices=new Map<number,number>(),used=new Set<number>();
  for(const [i,p] of a.vertices.entries()){const candidates=b.vertices.map((q,j)=>close(p,q)&&a.degree[i]===b.degree[j]?j:-1).filter(j=>j>=0);if(candidates.length===1&&!used.has(candidates[0])){vertices.set(i,candidates[0]);used.add(candidates[0]);}}
  let changed=true;
  while(changed){changed=false;for(const [u,v] of a.ends)for(const [from,to] of [[u,v],[v,u]]){
   if(!vertices.has(from)||vertices.has(to))continue;const anchor=vertices.get(from)!,dir=direction(a.vertices[from],a.vertices[to]);
   const candidates=b.ends.filter(e=>e.includes(anchor)).map(e=>e[0]===anchor?e[1]:e[0]).filter(j=>!used.has(j)&&a.degree[to]===b.degree[j]&&close(dir,direction(b.vertices[anchor],b.vertices[j])));
   if(candidates.length===1){vertices.set(to,candidates[0]);used.add(candidates[0]);changed=true;}
  }}
  if(vertices.size!==a.vertices.length)return next;
  const edges=new Set<number>();
  for(const [i,[u,v]] of a.ends.entries()){const candidates=b.ends.map((e,j)=>e.includes(vertices.get(u)!)&&e.includes(vertices.get(v)!)?j:-1).filter(j=>j>=0);if(candidates.length!==1||edges.has(candidates[0]))return next;edges.add(candidates[0]);mapped.set(now[candidates[0]].sourceKey,old[i].sourceKey);}
 }
 return next.map(g=>({...g,sourceKey:mapped.get(g.sourceKey)??g.sourceKey}));
}
