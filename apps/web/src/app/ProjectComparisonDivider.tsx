import { useEffect, useRef, useState } from "react";
import { comparisonRatio } from "./projectComparison";

/** Sibling of the stable editor sections: no iframe is reparented during layout changes. */
export function ProjectComparisonDivider({ ratio, disabled, onChange, onCommit }: {
  ratio: number; disabled: boolean; onChange: (ratio: number) => void; onCommit: () => void;
}) {
  const drag = useRef<{ pointer: number; initial: number } | null>(null);
  const divider = useRef<HTMLDivElement>(null), latest = useRef({ ratio, onChange, onCommit }); latest.current={ratio,onChange,onCommit};
  const [dragging, setDragging] = useState(false);
  useEffect(()=>{
    const parent=divider.current?.parentElement;if(!parent)return;
    const observer=new ResizeObserver(()=>{
      const current=latest.current,next=comparisonRatio(current.ratio,parent.clientWidth);
      if(next!==current.ratio){current.onChange(next);current.onCommit();}
    });observer.observe(parent);return()=>observer.disconnect();
  },[]);
  function finish(cancel = false) {
    const current = drag.current; if (!current) return;
    drag.current = null; setDragging(false);
    if (cancel) onChange(current.initial);
    onCommit();
  }
  return <>
    <div ref={divider} className="project-divider" role="separator" aria-label="Resize project comparison" aria-orientation="vertical"
      aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(ratio * 100)} aria-valuetext={`Left ${Math.round(ratio * 100)}%, right ${Math.round((1 - ratio) * 100)}%`}
      aria-disabled={disabled} tabIndex={disabled ? -1 : 0} style={{ left: `calc(${ratio * 100}% - 4px)` }}
      onPointerDown={e => {
        if (disabled || e.button !== 0) return;
        e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { pointer: e.pointerId, initial: ratio }; setDragging(true);
      }} onPointerMove={e => {
        if (drag.current?.pointer !== e.pointerId) return;
        const bounds = e.currentTarget.parentElement!.getBoundingClientRect();
        onChange(comparisonRatio((e.clientX - bounds.left) / bounds.width, bounds.width));
      }} onPointerUp={e => { if (drag.current?.pointer === e.pointerId) finish(); }} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish()}
      onKeyDown={e => {
        if (disabled) return;
        const width = e.currentTarget.parentElement!.clientWidth;
        const next = e.key === "ArrowLeft" ? ratio - (e.shiftKey ? .1 : .02) : e.key === "ArrowRight" ? ratio + (e.shiftKey ? .1 : .02) : e.key === "Home" ? .25 : e.key === "End" ? .75 : null;
        if (e.key === "Escape" && drag.current) { e.preventDefault(); finish(true); }
        if (next === null) return;
        e.preventDefault(); onChange(comparisonRatio(next, width)); onCommit();
      }} onDoubleClick={() => { if (!disabled) { onChange(.5); onCommit(); } }} />
    {dragging && <div className="project-resize-shield" aria-hidden="true" />}
  </>;
}
