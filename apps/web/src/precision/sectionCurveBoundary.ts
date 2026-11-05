import {validEllipse,validSpline,type CadEllipse,type CadSpline} from "@agent-webcad/cad-document";
import {splineBezierSpans} from "./splineGeometry";
import type {SectionDrawing} from "./modelSection";

type H=[number,number,number];
type Piece={h:H[];box:number[]};
const TAU=2*Math.PI,EPS=1e-7,ROOT_EPS=1e-9;
const point=(h:H)=>[h[0]/h[2],h[1]/h[2]];
const near=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1])<=EPS;
function piece(h:H[]):Piece{const p=h.map(point);return {h,box:[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))]};}
function split(p:Piece):[Piece,Piece]{let row=p.h;const left=[row[0]],right=[row.at(-1)!];while(row.length>1){row=row.slice(1).map((q,i)=>q.map((v,j)=>(v+row[i][j])/2) as H);left.push(row[0]);right.unshift(row.at(-1)!);}return [piece(left),piece(right)];}
const size=(p:Piece)=>Math.max(p.box[2]-p.box[0],p.box[3]-p.box[1]);
const ends=(p:Piece)=>[point(p.h[0]),point(p.h.at(-1)!)];
const monotone=(p:Piece)=>[0,1].some(axis=>{const q=p.h.map(h=>point(h)[axis]),d=q.slice(1).map((v,i)=>v-q[i]);return d.some(v=>v!==0)&&(d.every(v=>v>=0)||d.every(v=>v<=0));});

/** Exact positive rational Bezier representation; never a display polyline. */
export function sectionCurvePieces(curves:SectionDrawing[],origin:number[]=[0,0],angle=0):Piece[]{
  const rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),result:Piece[]=[];
  const map=(p:number[])=>{if(p.length<2||!p.every(Number.isFinite)||p.length>2&&Math.abs(p[2])>EPS)throw Error("non-finite or non-planar cut boundary");if(Math.max(...p.map(Math.abs),...origin.map(Math.abs))*Number.EPSILON*32>EPS/4)throw Error("coordinate precision exceeds 1e-7 paper mm boundary resolution");return [(p[0]-origin[0])*c+(p[1]-origin[1])*s,-(p[0]-origin[0])*s+(p[1]-origin[1])*c];};
  const add=(h:H[])=>{if(result.length>=1024)throw Error("boundary exceeds 1,024 Bezier spans");if(h.some(p=>!p.every(Number.isFinite)||p[2]<=0))throw Error("invalid rational boundary weights");const scale=Math.max(...h.map(p=>p[2]));result.push(piece(h.map(p=>p.map(v=>v/scale) as H)));};
  if(curves.length>512)throw Error("cut boundary exceeds 512 edges");
  for(const g of curves){
    if(g.kind==="line"){const p=g.params.points as number[][];if(!Array.isArray(p)||p.length!==2)throw Error("invalid line boundary");add(p.map(q=>[...map(q),1] as H));continue;}
    if(g.kind==="spline"){
      const spline=g.params as CadSpline;if(!validSpline(spline))throw Error("invalid spline/domain boundary");
      for(const span of splineBezierSpans(spline))add(span.h.map(h=>{const p=map(h.slice(0,3).map(v=>v/h[3]));return [p[0]*h[3],p[1]*h[3],h[3]];}));continue;
    }
    const e:CadEllipse=g.kind==="ellipse"||g.kind==="elliptic-arc"?g.params as CadEllipse:{center:g.params.center as CadEllipse["center"],axisU:[Number(g.params.radius),0,0],axisV:[0,Number(g.params.radius),0],startParam:g.kind==="circle"?0:Number(g.params.startAngle),sweep:g.kind==="circle"?TAU:Number(g.params.endAngle)-Number(g.params.startAngle)};
    if(!validEllipse(e))throw Error("invalid conic/domain boundary");
    const center=map(e.center),u=map(e.center.map((v,i)=>v+e.axisU[i])).map((v,i)=>v-center[i]),v=map(e.center.map((v,i)=>v+e.axisV[i])).map((x,i)=>x-center[i]);
    const count=Math.ceil(Math.abs(e.sweep)/(Math.PI/2));
    for(let i=0;i<count;i++){const a=e.startParam+e.sweep*i/count,b=e.startParam+e.sweep*(i+1)/count,m=(a+b)/2,w=Math.cos((b-a)/2),at=(t:number)=>center.map((x,j)=>x+u[j]*Math.cos(t)+v[j]*Math.sin(t));add([[...at(a),1],[center[0]*w+u[0]*Math.cos(m)+v[0]*Math.sin(m),center[1]*w+u[1]*Math.cos(m)+v[1]*Math.sin(m),w],[...at(b),1]] as H[]);}
  }
  return result;
}

/** Convex-hull subdivision proves separation; unresolved/touching interiors fail closed. */
export function verifySectionCurveBoundary(input:Piece[]):Piece[]{
  const pieces:Piece[]=[];let work=0;
  const partition=(p:Piece,depth:number)=>{
    if(++work>65536||pieces.length>=1024)throw Error("boundary certification budget exceeded");
    if(size(p)<=EPS)throw Error("boundary feature below 1e-7 paper mm resolution");
    if(monotone(p)){pieces.push(p);return;}
    if(!depth)throw Error("singular or self-intersecting boundary cannot be certified");
    for(const q of split(p))partition(q,depth-1);
  };
  for(const p of input)partition(p,32);
  const vertices:number[][]=[],degree:number[]=[];
  for(const p of pieces)for(const q of ends(p)){let at=vertices.findIndex(v=>near(v,q));if(at<0){at=vertices.length;vertices.push(q);degree.push(0);}degree[at]++;}
  if(degree.some(n=>n!==2))throw Error("open or branched cut boundary");
  const overlap=(a:Piece,b:Piece,shared:number[][],depth:number):boolean=>{
    if(++work>200000)throw Error("boundary intersection budget exceeded");
    if(a.box[2]<b.box[0]||b.box[2]<a.box[0]||a.box[3]<b.box[1]||b.box[3]<a.box[1])return false;
    const intersection=[Math.max(a.box[0],b.box[0]),Math.max(a.box[1],b.box[1]),Math.min(a.box[2],b.box[2]),Math.min(a.box[3],b.box[3])];
    if(shared.some(p=>Math.hypot(Math.max(Math.abs(intersection[0]-p[0]),Math.abs(intersection[2]-p[0])),Math.max(Math.abs(intersection[1]-p[1]),Math.abs(intersection[3]-p[1])))<=EPS))return false;
    if(!depth||Math.max(size(a),size(b))<=EPS)return true;
    if(size(a)>=size(b))return split(a).some(q=>overlap(q,b,shared,depth-1));
    return split(b).some(q=>overlap(a,q,shared,depth-1));
  };
  for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++){
    const a=pieces[i],b=pieces[j],shared=ends(a).filter(p=>ends(b).some(q=>near(p,q)));
    if(overlap(a,b,shared,96))throw Error("intersecting, touching or coincident cut boundaries");
  }
  return pieces;
}

/** Bernstein sign variation isolates actual rational curve/row intersections. */
export function sectionCurveRow(pieces:Piece[],y:number,budget={remaining:500000}):number[]{
  const xs:number[]=[];let work=0;
  const visit=(p:Piece,depth:number)=>{
    if(++work>65536||--budget.remaining<0)throw Error("hatch root isolation budget exceeded");
    if(y<p.box[1]-ROOT_EPS||y>p.box[3]+ROOT_EPS)return;
    // Reconcile floating-point seams only at endpoints (e.g. sin(pi)),
    // within 1e-12 paper mm; interior Bernstein signs stay untouched.
    const coeff=p.h.map(h=>h[1]-y*h[2]),signs=coeff.map((v,i)=>(i===0||i===coeff.length-1)&&Math.abs(v/p.h[i][2])<=1e-12?0:Math.sign(v)),nonzero=signs.filter(Boolean);
    if(!nonzero.length){if(p.box[3]-p.box[1]>ROOT_EPS)throw Error("ill-conditioned horizontal hatch intersection");return;}
    const variations=nonzero.slice(1).filter((v,i)=>v!==nonzero[i]).length;
    if(variations>1){if(!depth||size(p)<ROOT_EPS)throw Error("tangent or clustered hatch roots cannot be certified");for(const q of split(p))visit(q,depth-1);return;}
    // Half-open parity: include an endpoint only from its positive-y side.
    if(signs[0]===0&&nonzero[0]>0)xs.push(point(p.h[0])[0]);
    if(signs.at(-1)===0&&nonzero.at(-1)!>0)xs.push(point(p.h.at(-1)!)[0]);
    if(!variations)return;
    let q=p;const start=nonzero[0];
    for(let i=0;i<64;i++){
      if(--budget.remaining<0)throw Error("hatch root isolation budget exceeded");
      const [left,right]=split(q),mid=left.h.at(-1)!,value=mid[1]-y*mid[2];
      if(value===0||size(q)<=ROOT_EPS){xs.push(point(mid)[0]);return;}
      q=Math.sign(value)===start?right:left;
    }
    throw Error("hatch root accuracy did not converge to 1e-9 paper mm");
  };
  for(const p of pieces)visit(p,48);
  return xs.sort((a,b)=>a-b);
}

export function curvedSectionHatch(curves:SectionDrawing[],origin:number[],spacing:number,angle:number){
  const pieces=verifySectionCurveBoundary(sectionCurvePieces(curves,origin,angle)),lo=Math.min(...pieces.map(p=>p.box[1])),hi=Math.max(...pieces.map(p=>p.box[3]));
  if((hi-lo)/spacing>4000)throw Error("Section hatch exceeds 4,000 paper rows; increase spacing.");
  const rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),restore=(x:number,y:number)=>[origin[0]+x*c-y*s,origin[1]+x*s+y*c,0],lines:{key:string;partId:string;points:number[][]}[]=[],partId=curves[0].partId,budget={remaining:500000};
  for(let row=Math.ceil(lo/spacing);row*spacing<hi-ROOT_EPS;row++){
    const y=row*spacing,xs=sectionCurveRow(pieces,y,budget);if(xs.length%2)throw Error("ambiguous hatch intersection parity");
    for(let i=0;i<xs.length;i+=2)if(xs[i+1]-xs[i]>EPS)lines.push({key:`hatch:${partId}:${row}:${i/2}`,partId,points:[restore(xs[i],y),restore(xs[i+1],y)]});
    if(lines.length>20000)throw Error("Section hatch exceeds 20,000 strokes; increase spacing.");
  }
  return lines;
}
/** Bounded rational convex-hull subdivision for boundary hit exclusion. */
export function sectionCurvePointOn(pieces:Piece[],p:number[]):boolean{
 let work=0;const visit=(q:Piece,depth:number):boolean=>{
  if(++work>65536)throw Error("Boundary point classification budget exceeded.");
  if(p[0]<q.box[0]-EPS||p[0]>q.box[2]+EPS||p[1]<q.box[1]-EPS||p[1]>q.box[3]+EPS)return false;
  if(size(q)<=EPS)return true;if(!depth)throw Error("Boundary point classification did not converge.");return split(q).some(s=>visit(s,depth-1));
 };return pieces.some(q=>visit(q,96));
}
