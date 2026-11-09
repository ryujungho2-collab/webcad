import type {MeshVector,CadWorkPlaneFrame} from "@agent-webcad/cad-document";
import type {MeshData} from "../cad/kernelProtocol";
type HybridView={pick?:{objectId:string;accept:(origin:MeshVector,direction:MeshVector,fingerprint:string)=>void;error:(message:string)=>void};preview?:{data:MeshData;objectId?:string};frame?:CadWorkPlaneFrame};
let state:HybridView={};const listeners=new Set<()=>void>();
export const hybridView=()=>state;
export function updateHybridView(value:HybridView){state=value;for(const listener of listeners)listener();}
export function subscribeHybridView(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
