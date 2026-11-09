import type {CadSpline} from "@agent-webcad/cad-document";
export const periodicSource:CadSpline={degree:2,controlPoints:[[0,0,0],[40,0,0],[40,40,0],[0,40,0],[0,0,0],[40,0,0]],weights:[1,2,1,2,1,2],knots:[-2,-1,0,1,2,3,4,5,6],domain:[0,4]};
export const periodicTags=()=>[0,"SPLINE",8,"Periodic",70,7,71,2,72,9,73,6,74,0,...periodicSource.knots.flatMap(k=>[40,k]),...periodicSource.weights!.flatMap(w=>[41,w]),...periodicSource.controlPoints.flatMap(p=>[10,p[0],20,p[1],30,p[2]])];
export const fitPoints:[number,number,number][]=[[65,0,0],[80,20,0],[95,-10,0],[115,15,0]];
export const fitTags=()=>[0,"SPLINE",8,"Fit",70,8,71,3,72,0,73,0,74,fitPoints.length,44,1e-8,...fitPoints.flatMap(p=>[11,p[0],21,p[1],31,p[2]])];
export const curveDxfFixture=(tags:(string|number)[]=[...periodicTags(),...fitTags()],unit=4)=>[0,"SECTION",2,"HEADER",9,"$INSUNITS",70,unit,0,"ENDSEC",0,"SECTION",2,"ENTITIES",...tags,0,"ENDSEC",0,"EOF", ""].join("\n");
