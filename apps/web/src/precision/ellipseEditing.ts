import {validEllipse,type CadEllipse} from "@agent-webcad/cad-document";
import {TAU} from "./ellipseGeometry";
export function editEllipseControl(e:CadEllipse,role:string,p:[number,number,number]):CadEllipse{
 const result=structuredClone(e),u=e.axisU,v=e.axisV,c=e.center,d=p.map((x,i)=>x-c[i]),cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0),normal=cross(u,v),nl=Math.hypot(...normal);
 if(role==="center"){result.center=[...p];return result;}
 if(Math.abs(dot(d,normal)/nl)>1e-6)throw Error("Ellipse handles must stay on its plane.");
 if(role==="axis-u"||role==="axis-v"){const other=role==="axis-u"?cross(normal,d):cross(d,normal),len=Math.hypot(...other),size=Math.hypot(...(role==="axis-u"?v:u));if(len<1e-9)throw Error("Ellipse axis cannot collapse.");if(role==="axis-u"){result.axisU=d as CadEllipse["axisU"];result.axisV=other.map(x=>x/len*size) as CadEllipse["axisV"];}else{result.axisV=d as CadEllipse["axisV"];result.axisU=other.map(x=>x/len*size) as CadEllipse["axisU"];}}
 else if(role==="start"||role==="end"){const a=dot(u,u),b=dot(v,v),k=dot(u,v),det=a*b-k*k,x=(dot(d,u)*b-dot(d,v)*k)/det,y=(dot(d,v)*a-dot(d,u)*k)/det;if(Math.hypot(x,y)<1e-9)throw Error("Choose a point away from ellipse center.");const t=Math.atan2(y,x),sign=Math.sign(e.sweep),start=role==="start"?t:e.startParam,end=role==="end"?t:e.startParam+e.sweep;result.startParam=start;result.sweep=sign*((sign*(end-start)%TAU+TAU)%TAU);}
 else throw Error("Unknown ellipse handle.");if(!validEllipse(result))throw Error("Ellipse axes or finite domain are degenerate.");return result;
}
