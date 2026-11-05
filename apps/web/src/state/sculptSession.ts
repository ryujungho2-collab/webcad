import type {EditableMesh,SculptStroke} from "@agent-webcad/cad-document";
export type SculptSettings=Omit<SculptStroke,"samples">;
export type SculptViewState={objectId:string|null;settings:SculptSettings;active:boolean;preview?:EditableMesh;message:string;busy:boolean};
let state:SculptViewState={objectId:null,settings:{brush:"draw",radius:15,strength:.3,falloff:"smooth",spacing:.15,symmetry:false},active:false,message:"",busy:false};
const listeners=new Set<()=>void>();
export const sculptView=()=>state;
export function updateSculptView(patch:Partial<SculptViewState>){state={...state,...patch};listeners.forEach(f=>f());}
export function subscribeSculptView(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
