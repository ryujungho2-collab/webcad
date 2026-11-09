import {ShapeUtils,Vector2} from "three";
import type {DxfEntity} from "./dxfParser";
type P=[number,number];
const cross=(a:P,b:P,c:P)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const crossing=(p:P,q:P,r:P,s:P,unit:number)=>{const e=1e-6/unit**2,a=cross(p,q,r),b=cross(p,q,s),c=cross(r,s,p),d=cross(r,s,q);return (a>e&&b< -e||a< -e&&b>e)&&(c>e&&d< -e||c< -e&&d>e);};
const inside=(p:P,r:P[])=>{let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>p[1])!==(r[j][1]>p[1])&&p[0]<(r[j][0]-r[i][0])*(p[1]-r[i][1])/(r[j][1]-r[i][1])+r[i][0])hit=!hit;return hit;};
/** Finite XY straight-boundary HATCH flattened to editable triangles/strokes. */
export function readDxfHatch(fields:[number,string][],unitScale:number):DxfEntity[]{
 const first=(c:number)=>fields.find(([code])=>code===c)?.[1],num=(c:number,f=0)=>first(c)===undefined?f:Number(first(c));
 if(num(450)!==0||num(77)!==0||[210,220,230].some((c,i)=>num(c,i===2?1:0)!==(i===2?1:0))||![0,1].includes(num(70))||![0,1,2].includes(num(75)))throw Error("unsupported gradient, extrusion or hatch style");
 let i=fields.findIndex(([c])=>c===91);if(i<0)throw Error("missing boundary count");
 const take=(code:number)=>{const v=fields[i++];if(!v||v[0]!==code||!v[1].trim()||!Number.isFinite(Number(v[1])))throw Error(`invalid boundary/pattern code ${code}`);return Number(v[1]);};
 const count=take(91);if(!Number.isInteger(count)||count<1||count>256)throw Error("boundary limit");
 const rings:P[][]=[];let total=0;
 for(let n=0;n<count;n++){
  const flags=take(92),ring:P[]=[];if(!Number.isInteger(flags)||flags<0||flags>31)throw Error("invalid path flags");
  if(flags&2){const bulges=take(72),closed=take(73),vertices=take(93);if(![0,1].includes(bulges)||closed!==1||!Number.isInteger(vertices)||vertices<3||vertices>4096)throw Error("open or excessive polyline boundary");
   for(let v=0;v<vertices;v++){ring.push([take(10),take(20)]);if(fields[i]?.[0]===42&&take(42)!==0)throw Error("curved hatch boundary not supported");}
  }else{const edges=take(93);if(!Number.isInteger(edges)||edges<3||edges>4096)throw Error("edge boundary limit");let end:P|undefined;
   for(let e=0;e<edges;e++){if(take(72)!==1)throw Error("curved hatch boundary not supported");const a:P=[take(10),take(20)],b:P=[take(11),take(21)];if(end&&Math.hypot(a[0]-end[0],a[1]-end[1])*unitScale>1e-5)throw Error("disconnected hatch edges");ring.push(a);end=b;}
   if(!end||Math.hypot(end[0]-ring[0][0],end[1]-ring[0][1])*unitScale>1e-5)throw Error("open hatch edge loop");
  }
  if(ring.length>3&&Math.hypot(ring[0][0]-ring.at(-1)![0],ring[0][1]-ring.at(-1)![1])*unitScale<1e-7)ring.pop();
  total+=ring.length;if(total>8192)throw Error("total boundary limit");
  for(let a=0;a<ring.length;a++)for(let b=a+1;b<ring.length;b++){if(b===a+1||a===0&&b===ring.length-1)continue;const p=ring[a],q=ring[(a+1)%ring.length],r=ring[b],s=ring[(b+1)%ring.length];if(crossing(p,q,r,s,unitScale))throw Error("self-intersecting hatch boundary");}
  if(Math.abs(ShapeUtils.area(ring.map(p=>new Vector2(...p))))*unitScale**2<1e-8)throw Error("zero-area hatch boundary");rings.push(ring);
  const refs=take(97);if(!Number.isInteger(refs)||refs<0||refs>4096)throw Error("invalid boundary references");for(let r=0;r<refs;r++){if(fields[i++]?.[0]!==330)throw Error("missing boundary reference");}
 }
 // Reject crossings/touches across islands rather than guessing a filled region.
 for(let a=0;a<rings.length;a++)for(let b=a+1;b<rings.length;b++)for(let j=0;j<rings[a].length;j++)for(let k=0;k<rings[b].length;k++){
  const p=rings[a][j],q=rings[a][(j+1)%rings[a].length],r=rings[b][k],s=rings[b][(k+1)%rings[b].length];
  if(crossing(p,q,r,s,unitScale))throw Error("intersecting hatch islands");
 }
 const depth=rings.map((r,j)=>rings.filter((s,k)=>k!==j&&inside(r[0],s)).length),style=num(75),active=rings.filter((_,j)=>style===0||depth[j]<=(style===1?1:0));
 const layer=first(8)?.trim()||"0",z=num(30),out:DxfEntity[]=[];if(!Number.isFinite(z))throw Error("invalid elevation");
 const point=(p:P):[number,number,number]=>[...p,z];
 if(num(70)===1){
  for(const [j,ring]of rings.entries()){if(style===2?depth[j]!==0:depth[j]%2!==0||style===1&&depth[j]>0)continue;
   const holes=style===2?[]:rings.filter((r,k)=>depth[k]===depth[j]+1&&inside(r[0],ring)),points=[...ring,...holes.flat()];
   const faces=ShapeUtils.triangulateShape(ring.map(p=>new Vector2(...p)),holes.map(h=>h.map(p=>new Vector2(...p))));if(!faces.length)throw Error("cannot triangulate hatch");
   for(const face of faces)out.push({kind:"polyline",layer,closed:true,points:face.map(n=>point(points[n])),dxfStyle:{fill:true}});
  }
 }else{
  while(i<fields.length&&fields[i][0]!==78)i++;const definitions=take(78);if(!Number.isInteger(definitions)||definitions<1||definitions>128)throw Error("pattern definition limit");
  for(let n=0;n<definitions;n++){
   const angle=take(53)*Math.PI/180,origin:P=[take(43),take(44)],offset:P=[take(45),take(46)],dashCount=take(79);if(!Number.isInteger(dashCount)||dashCount<0||dashCount>64)throw Error("dash definition limit");const dashes=Array.from({length:dashCount},()=>take(49));
   const u:P=[Math.cos(angle),Math.sin(angle)],v:P=[-u[1],u[0]],dot=(p:P,q:P)=>p[0]*q[0]+p[1]*q[1],step=dot(offset,v),base=dot(origin,v);if(Math.abs(step)*unitScale<1e-5)throw Error("degenerate pattern spacing");
   const limits=active.flat().map(p=>dot(p,v)),lo=Math.min(...limits),hi=Math.max(...limits),indices=[(lo-base)/step,(hi-base)/step].sort((a,b)=>a-b),k0=Math.ceil(indices[0]-1e-9),k1=Math.floor(indices[1]+1e-9);if(k1-k0>10000)throw Error("pattern row budget exceeded");
   for(let k=k0;k<=k1;k++){const row=base+k*step,cuts:number[]=[];
    for(const ring of active)for(let a=0,b=ring.length-1;a<ring.length;b=a++){const p=ring[a],q=ring[b],pa=dot(p,v),qa=dot(q,v);if((pa>row)!==(qa>row)){const t=(row-pa)/(qa-pa);cuts.push(dot([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])],u));}}
    cuts.sort((a,b)=>a-b);const phase=dot([origin[0]+k*offset[0],origin[1]+k*offset[1]],u),emit=(a:number,b:number)=>{if(b-a<=1e-10)return;if(out.length>=12000)throw Error("pattern stroke budget exceeded");out.push({kind:"line",layer,points:[point([a*u[0]+row*v[0],a*u[1]+row*v[1]]),point([b*u[0]+row*v[0],b*u[1]+row*v[1]])]});};
    for(let c=0;c+1<cuts.length;c+=2){const a=cuts[c],b=cuts[c+1];if(!dashes.length){emit(a,b);continue;}const cycle=dashes.reduce((s,d)=>s+Math.abs(d),0);if(cycle*unitScale<1e-5||(b-a)/cycle>12000)throw Error("dash stroke budget exceeded");
     for(let t=Math.floor((a-phase)/cycle);t*cycle+phase<=b;t++){let cursor=phase+t*cycle;for(const dash of dashes){if(dash>=0)emit(Math.max(a,cursor),Math.min(b,cursor+(dash||.01/unitScale)));cursor+=Math.abs(dash);}}
    }
   }
  }
 }
 if(!out.length)throw Error("empty hatch presentation");return out;
}
