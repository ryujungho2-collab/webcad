import * as kernel from "./kernelGeometryService";
import { KernelCancelledError, type PrimitiveParams } from "./kernelProtocol";
export function createViewGeometry(signal?:AbortSignal){
function view<T>(request:(options:kernel.KernelTaskOptions)=>Promise<T>){const options=kernel.viewTaskOptions();if(signal)options.signal=AbortSignal.any([signal,options.signal!]);return request(options).then(value=>{if(options.signal?.aborted)throw new KernelCancelledError(-1);return value;});}
const buildPrimitiveMesh=(p:PrimitiveParams)=>view(o=>kernel.buildPrimitiveMesh(p,o));
const buildDemoPartMesh=()=>view(o=>kernel.buildDemoPartMesh(o));
const enumerateSolidTopology=(p:PrimitiveParams)=>view(o=>kernel.enumerateSolidTopology(p,o));
const buildBooleanMesh=(p:PrimitiveParams,preflight=false)=>view(o=>kernel.buildBooleanMesh(p,preflight,o));
const buildExtrudeMesh=(p:PrimitiveParams,preflight=false)=>view(o=>kernel.buildExtrudeMesh(p,preflight,o));
const buildFilletMesh=(p:PrimitiveParams,preflight=false)=>view(o=>kernel.buildFilletMesh(p,preflight,o));
const buildChamferMesh=(p:PrimitiveParams,preflight=false)=>view(o=>kernel.buildChamferMesh(p,preflight,o));
const buildRevolveMesh=(p:PrimitiveParams,preflight=false)=>view(o=>kernel.buildRevolveMesh(p,preflight,o));
const buildSweepMesh=(p:PrimitiveParams,preflight=false)=>view(o=>kernel.buildSweepMesh(p,preflight,o));
const buildLoftMesh=(p:PrimitiveParams,preflight=false)=>view(o=>kernel.buildLoftMesh(p,preflight,o));
const buildShellMesh=(p:PrimitiveParams,preflight=false)=>view(o=>kernel.buildShellMesh(p,preflight,o));

return {buildPrimitiveMesh,buildDemoPartMesh,enumerateSolidTopology,buildBooleanMesh,buildExtrudeMesh,buildFilletMesh,buildChamferMesh,buildRevolveMesh,buildSweepMesh,buildLoftMesh,buildShellMesh};
}
export const {buildPrimitiveMesh,buildDemoPartMesh,enumerateSolidTopology,buildBooleanMesh,buildExtrudeMesh,buildFilletMesh,buildChamferMesh,buildRevolveMesh,buildSweepMesh,buildLoftMesh,buildShellMesh}=createViewGeometry();