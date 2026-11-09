import type {CadFeature} from "./Feature";
import {featureContract} from "./FeatureContract";
import type {GeometryRepresentation} from "./Precision";

/** Capabilities, not an implicit converter. Source ownership always belongs to CadDocument. */
export const GEOMETRY_REPRESENTATIONS = Object.freeze({
  "external-reference":{owner:"externalSceneAssets original GLB bytes",derived:"Three.js render cache",editing:"placement only; no CAD conversion"},
  "brep":{owner:"feature-parameters",derived:"kernel BRep and render tessellation",editing:"parametric-solid"},
  "polygon-mesh":{owner:"feature.params.mesh",derived:"half-edge adjacency, modifier evaluation and render buffers",editing:"triangle and polygon elements"},
  "analytic-curve":{owner:"feature-parameters",derived:"render paths",editing:"sketch"},
  "planar-region":{owner:"boundary-references",derived:"evaluated region",editing:"source-curves"},
  "annotation":{owner:"feature-parameters",derived:"annotation render objects",editing:"annotation"},
} satisfies Record<GeometryRepresentation,{owner:string;derived:string;editing:string}>);
export function geometryOwnership(feature:CadFeature){const representation=featureContract(feature).representation;return {representation,...GEOMETRY_REPRESENTATIONS[representation],...feature.type==="geometry-nodes"?{owner:"feature.params.graph",derived:"typed graph evaluation and render buffers",editing:"validated graph actions"}:{}};}
export type GeometryConversionReport={supported:boolean;source:GeometryRepresentation;target:GeometryRepresentation;losses:{kind:"precision"|"references"|"history";message:string}[];reason:string};
/** Explicitly rejects conversions instead of mislabelling display tessellation as editable source. */
export function geometryConversionSupport(source:GeometryRepresentation,target:GeometryRepresentation):GeometryConversionReport{
  return {supported:false,source,target,losses:[],reason:source===target?"Use the existing representation; no conversion was performed.":"Representation conversion is not implemented. No geometry or references were changed."};
}
