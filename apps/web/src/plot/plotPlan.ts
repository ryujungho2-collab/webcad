import { collectExportDrawings } from "../export/exportModel";
import { cadDocument } from "../state/cadDocument";
import { resolveDimension } from "../precision/dimensionGeometry";
import { worldToPlane, WORK_PLANES, type WorkPlaneId } from "../precision/workPlane";
import { encodePdf, type PdfPage, type PdfPolyline, type PdfText } from "./pdfWriter";
import { worldDraftingGeometry } from "../precision/draftingGeometry";
import { layerStyle, paperDash } from "../precision/layerStyle";

export type PaperSize = "A4" | "A3" | "A2" | "A1";
export type PlotOrientation = "landscape" | "portrait";
export type PlotScaleId = "1:1" | "1:2" | "1:5" | "1:10" | "1:20" | "1:50" | "1:100" | "fit";

export const PAPER_MM: Record<PaperSize, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
};

export const PLOT_SCALES: { id: PlotScaleId; ratio: number | null; label: string }[] = [
  { id: "1:1", ratio: 1, label: "1:1" },
  { id: "1:2", ratio: 1 / 2, label: "1:2" },
  { id: "1:5", ratio: 1 / 5, label: "1:5" },
  { id: "1:10", ratio: 1 / 10, label: "1:10" },
  { id: "1:20", ratio: 1 / 20, label: "1:20" },
  { id: "1:50", ratio: 1 / 50, label: "1:50" },
  { id: "1:100", ratio: 1 / 100, label: "1:100" },
  { id: "fit", ratio: null, label: "Fit to page" },
];

export const PLOT_MARGIN_MM = 10;
export const TITLE_TEXT_MM = 5;

export type PlotPlan = {
  page: PdfPage;
  scaleLabel: string;
  ratio: number;
  drawings: number;
  dimensions: number;
  fitsPaper: boolean;
};

/**
 * Scale-accurate 2D plot of the active work plane: visible drawings plus
 * dimension linework/labels, mapped model-mm -> paper-mm at an explicit
 * ratio (or fit) and centered in the printable area. A title strip records
 * document, plane, date and the applied scale so the print is verifiable
 * with a ruler.
 */
export function planPlot(
  plane: WorkPlaneId,
  paper: PaperSize,
  orientation: PlotOrientation,
  scaleId: PlotScaleId,
  title?: string,
): PlotPlan | null {
  const document = cadDocument;
  const frame = WORK_PLANES[plane];
  const drawings = collectExportDrawings(plane);
  const polylines: PdfPolyline[] = drawings.map(line => ({...line}));
  // Annotation heights are resolved model-mm, just like their linework.
  const texts: PdfText[] = [];

  let dimensions = 0;
  for (const id of document.rootObjects) {
    const object = document.objects[id];
    const feature = Object.values(document.features).find((entry) => entry.output === id);
    const layer = object ? document.layers[object.layerId] : undefined;
    if (!object || !feature || !object.visible || !layer?.visible) continue;
    if (String(feature.params.workPlane ?? "XY") !== plane) continue;
    if(feature.type==="drafting") {
      const data=worldDraftingGeometry(document,object,feature);
      texts.push(...data.texts.map(text=>({position:worldToPlane(text.point,frame),sizeMm:text.height,text:text.text,color:text.style.color,angle:text.angle,align:text.align})));
      if(feature.params.kind==="chain"||feature.params.kind==="floor-plan")dimensions+=data.texts.length-Number(feature.params.kind==="floor-plan");
      continue;
    }
    if(feature.type!=="dimension")continue;
    const resolved = resolveDimension(feature.params);
    if (!resolved) continue;
    const style = layerStyle(layer);
    for (const [a, b] of resolved.segments) {
      polylines.push({ points: [worldToPlane(a, frame), worldToPlane(b, frame)], closed: false, color:style.color,lineWeight:style.lineWeight,dash:paperDash(style.lineType) });
    }
    texts.push({ position: worldToPlane(resolved.textPosition, frame), sizeMm: resolved.textHeight, text: resolved.text, color:style.color });
    dimensions += 1;
  }
  if (!polylines.length && !texts.length) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const line of polylines) {
    for (const [x, y] of line.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  for (const label of texts) {
    const [x, y] = label.position;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;

  const [paperW, paperH] = PAPER_MM[paper];
  const widthMm = orientation === "landscape" ? Math.max(paperW, paperH) : Math.min(paperW, paperH);
  const heightMm = orientation === "landscape" ? Math.min(paperW, paperH) : Math.max(paperW, paperH);
  const areaW = widthMm - PLOT_MARGIN_MM * 2;
  const areaH = heightMm - PLOT_MARGIN_MM * 2 - 8;
  const contentW = Math.max(maxX - minX, 1e-9);
  const contentH = Math.max(maxY - minY, 1e-9);

  const requested = PLOT_SCALES.find((entry) => entry.id === scaleId) ?? PLOT_SCALES[PLOT_SCALES.length - 1];
  const ratio = requested.ratio ?? Math.min(areaW / contentW, areaH / contentH);
  const scaleLabel = requested.ratio !== null ? requested.label : `fit 1:${(1 / ratio).toFixed(1)}`;
  const originX = PLOT_MARGIN_MM + (areaW - contentW * ratio) / 2 - minX * ratio;
  const originY = PLOT_MARGIN_MM + 8 + (areaH - contentH * ratio) / 2 - minY * ratio;
  const map = ([x, y]: [number, number]): [number, number] => [originX + x * ratio, heightMm - originY - y * ratio];

  const page: PdfPage = {
    widthMm,
    heightMm,
    polylines: polylines.map((line) => ({ ...line, points: line.points.map(map) })),
    texts: [
      ...texts.map((label) => ({ ...label, sizeMm: label.sizeMm * ratio, position: map(label.position) })),
      {
        position: [PLOT_MARGIN_MM, PLOT_MARGIN_MM - 3] as [number, number],
        sizeMm: TITLE_TEXT_MM,
        text: `${title?.trim() || (document.id.startsWith("document-")?"Drawing":document.id)} · ${plane} · ${scaleLabel} · ${new Date().toISOString().slice(0, 10)}`,
      },
    ],
  };
  return { page, scaleLabel, ratio, drawings: drawings.length, dimensions, fitsPaper:contentW*ratio<=areaW+1e-6&&contentH*ratio<=areaH+1e-6 };
}

export function renderPlotPdf(plan: PlotPlan): Uint8Array {
  return encodePdf(plan.page);
}

/** Uses installed browser fonts for Unicode labels, keeping all drawing paths vector. */
export async function renderPlotPdfForDownload(plan:PlotPlan):Promise<Uint8Array> {
  await document.fonts.ready;
  const texts=plan.page.texts.map(label=>{
    if(!Array.from(label.text).some(c=>(c.codePointAt(0)??0)>255))return label;
    const canvas=document.createElement("canvas"),context=canvas.getContext("2d")!;
    context.font="96px system-ui";canvas.width=Math.ceil(context.measureText(label.text).width)+8;canvas.height=116;
    context.fillStyle="white";context.fillRect(0,0,canvas.width,canvas.height);context.font="96px system-ui";context.textBaseline="bottom";context.fillStyle=label.color??"black";context.fillText(label.text,4,110);
    const binary=atob(canvas.toDataURL("image/jpeg",0.95).split(",")[1]),hex=Array.from(binary,c=>c.charCodeAt(0).toString(16).padStart(2,"0")).join("");
    return {...label,raster:{hex,width:canvas.width,height:canvas.height}};
  });
  return encodePdf({...plan.page,texts});
}
