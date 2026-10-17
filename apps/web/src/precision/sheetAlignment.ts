import type {CadDocument} from "@agent-webcad/cad-document";
export function sheetAlignmentUnits(d:CadDocument,ids:string[],alignment="none"):string[][]{
 if(alignment==="none")return [...ids].sort().map(id=>[id]);const groups=new Map<string,string[]>(),units:string[][]=[];
 for(const id of [...ids].sort()){const v=d.modelPresentation!.projections[id];if(!v){units.push([id]);continue;}const key=[...v.partIds].sort().join("\0"),g=groups.get(key)??[];g.push(id);groups.set(key,g);}
 for(const g of groups.values()){const bases=g.map(id=>d.modelPresentation!.projections[id].basis);if(new Set(bases).size!==bases.length)throw Error("Orthographic alignment needs one view per basis for the same parts. Remove duplicate bases or choose independent layout.");if(g.length>1&&!bases.includes("XZ"))throw Error("Include a front (XZ) view for orthographic alignment, or choose independent layout.");units.push(g);}return units.sort((a,b)=>a[0].localeCompare(b[0]));
}

/** Shared model coordinate remains aligned even when two frame crops differ. */
export function orthographicSharedOrigin(anchor:number,sourceOffset=0,targetOffset=0,denominator=1){return anchor+(targetOffset-sourceOffset)/denominator;}
