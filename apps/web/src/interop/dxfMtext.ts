import type {DxfEntity} from "./dxfParser";
/** Editable plain-text fallback. Layout/formatting loss must be accepted in Review. */
export function readDxfMtext(fields:[number,string][]):DxfEntity[]{
 const first=(c:number)=>fields.find(([code])=>code===c)?.[1],num=(c:number,f=0)=>first(c)===undefined?f:Number(first(c));
 const height=num(40),width=num(41),attachment=num(71,1),point=[num(10),num(20),num(30)];
 if(![...point,height,width,attachment].every(Number.isFinite)||height<=0||width<0||!Number.isInteger(attachment)||attachment<1||attachment>9||[210,220,230].some((c,i)=>Math.abs(num(c,i===2?1:0)-(i===2?1:0))>1e-9)||num(75)!==0)throw Error("unsupported columns, extrusion or invalid text geometry");
 // Only the first content record is used; later subclass/extended data is unrelated.
 const content:string[]=[];for(const [c,v] of fields){if(c===3)content.push(v);if(c===1){content.push(v);break;}}
 const raw=content.join("");if(raw.length>16000)throw Error("text content exceeds the import limit");
 const centered=/\\p[^;]*qc[^;]*;/.test(raw);
 let text=raw.replace(/\\U\+([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)))
  .replace(/\\([\\{}])/g,(_,c)=>c==="\\"?"\uE000":c==="{"?"\uE001":"\uE002")
  .replace(/\\P/g,"\n").replace(/\\~/g," ").replace(/\\S([^;]*);/g,(_,s)=>s.replace(/[\^#]/g,"/"))
  .replace(/\\(?:[ACcFfHhQqTtWw]|p)[^;]*;/g,"").replace(/\\[LlOoKk]/g,"").replace(/[{}]/g,"");
 if(/\\[A-Za-z]/.test(text))throw Error("unsupported MTEXT control sequence");
 text=text.replace(/\uE000/g,"\\").replace(/\uE001/g,"{").replace(/\uE002/g,"}");
 const lines=text.split("\n");if(!text.trim()||text.length>4000||lines.length>128)throw Error("empty or excessive text content");
 const direction=[num(11,1),num(21)],angle=first(11)!==undefined?Math.atan2(direction[1],direction[0]):num(50);
 if(!Number.isFinite(angle)||Math.hypot(...direction)<1e-12)throw Error("invalid text direction");
 const column=(attachment-1)%3,row=Math.floor((attachment-1)/3),align=column===1||centered,step=height*1.67;
 return lines.flatMap((line,i)=>{if(!line.trim())return [];const x=(align?width/2:0)-column*width/2,y=row*(height+(lines.length-1)*step)/2-height-i*step,c=Math.cos(angle),s=Math.sin(angle);
  return [{kind:"text" as const,layer:first(8)?.trim()||"0",point:[point[0]+c*x-s*y,point[1]+s*x+c*y,point[2]] as [number,number,number],text:line,height,angle:angle*180/Math.PI,...(align?{align:"center" as const}:{})}];});
}
