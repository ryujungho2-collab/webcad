import { useState } from "react";
import type { WorkPlaneId } from "../precision/workPlane";
import {
  PAPER_MM,
  PLOT_SCALES,
  planPlot,
  renderPlotPdfForDownload,
  type PaperSize,
  type PlotOrientation,
  type PlotScaleId,
} from "./plotPlan";
import { downloadFile } from "../export/exportModel";

type PlotDialogProps = {
  activeWorkPlane: WorkPlaneId;
  onClose: () => void;
  onPlotted: (message: string) => void;
};

/**
 * Scale plot dialog: paper, orientation and explicit ratio (or fit), with a
 * live content summary before committing to a download. The title strip on
 * the sheet records the applied scale so prints stay verifiable.
 */
export function PlotDialog({ activeWorkPlane, onClose, onPlotted }: PlotDialogProps) {
  const [paper, setPaper] = useState<PaperSize>("A4");
  const [orientation, setOrientation] = useState<PlotOrientation>("landscape");
  const [scaleId, setScaleId] = useState<PlotScaleId>("fit");
  const [title,setTitle]=useState("Drawing");

  const preview = planPlot(activeWorkPlane, paper, orientation, scaleId,title);
  const [w, h] = PAPER_MM[paper];
  const sheetW = orientation === "landscape" ? Math.max(w, h) : Math.min(w, h);
  const sheetH = orientation === "landscape" ? Math.min(w, h) : Math.max(w, h);

  async function plot() {
    const plan = planPlot(activeWorkPlane, paper, orientation, scaleId,title);
    if (!plan) {
      onPlotted(`Nothing to plot: no visible drawings or dimensions on ${activeWorkPlane}`);
      return;
    }
    if(!plan.fitsPaper)return;
    downloadFile(await renderPlotPdfForDownload(plan), `plot-${activeWorkPlane.toLowerCase()}-${scaleId.replace(":", "-")}.pdf`, "application/pdf");
    onPlotted(`Plotted ${plan.drawings} drawing${plan.drawings === 1 ? "" : "s"} + ${plan.dimensions} dimension${plan.dimensions === 1 ? "" : "s"} at ${plan.scaleLabel}`);
    onClose();
  }

  return (
    <dialog className="plot-dialog" aria-labelledby="plot-title" open
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="plot-heading"><h2 id="plot-title">Plot PDF · {activeWorkPlane}</h2></div>
      <label className="property-row"><span>Title</span><input aria-label="Plot title" value={title} onChange={event=>setTitle(event.target.value)}/></label>
      <label className="property-row"><span>Paper</span><select value={paper} onChange={(event) => setPaper(event.target.value as PaperSize)}>{(Object.keys(PAPER_MM) as PaperSize[]).map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
      <label className="property-row"><span>Orientation</span><select value={orientation} onChange={(event) => setOrientation(event.target.value as PlotOrientation)}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label>
      <label className="property-row"><span>Scale</span><select value={scaleId} onChange={(event) => setScaleId(event.target.value as PlotScaleId)}>{PLOT_SCALES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
      <div className="property-row"><span>Sheet</span><strong>{sheetW} × {sheetH} mm</strong></div>
      <div className="property-row"><span>Content</span><strong>{preview ? `${preview.drawings} drawings + ${preview.dimensions} dimensions at ${preview.scaleLabel}` : "Nothing on this plane"}</strong></div>
      <div className="sketch-actions">
        <button type="button" disabled={!preview?.fitsPaper} onClick={plot}>Plot PDF</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
      {preview&&!preview.fitsPaper&&<p role="alert">Content exceeds the printable area at this scale. Choose a larger sheet or a smaller scale.</p>}
      <p className="property-hint">Explicit ratios print to exact scale — verify with a ruler. Fit reports its effective ratio in the title strip.</p>
    </dialog>
  );
}
