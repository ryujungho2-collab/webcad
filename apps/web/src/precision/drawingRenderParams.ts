/** Ownership/status/topology describe references, not drawable geometry.
 * Visibility is applied by the viewport separately; HLR dash classification
 * remains in the signature because it changes the rendered stroke. */
const metadata=new Set(["modelProjection","modelSection","modelSectionPresentation","presentationKey","sourcePartId","sourceKey","sourceEdges","projectionStatus","projectionEdgePolicy","projectionEdgeClass","sectionFrame","topology"]);
export const drawingRenderParams=(params:Record<string,unknown>)=>Object.fromEntries(Object.entries(params).filter(([key])=>!metadata.has(key)));
