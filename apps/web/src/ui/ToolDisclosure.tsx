import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Native top-layer popover: survives toolbar scrolling and owns light-dismiss/Escape. */
export function ToolDisclosure({ label, children, disabled = false, closeOnAction = false }: {
  label: string; children: ReactNode; disabled?: boolean; closeOnAction?: boolean;
}) {
  const id = useId(), panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 540 });
  useEffect(() => { if (disabled) panel.current?.hidePopover(); }, [disabled]);
  useEffect(() => {
    const close = () => panel.current?.hidePopover();
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);
  return <>
    <button type="button" className="tool-disclosure-trigger" popoverTarget={id}
      disabled={disabled} aria-expanded={open} aria-controls={id}
      onClick={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const top = bounds.bottom + 6;
        setPosition({ left: Math.max(8, Math.min(bounds.left, window.innerWidth - 312)), top, maxHeight: Math.max(80, window.innerHeight - top - 8) });
      }}>{label}<span aria-hidden="true">⌄</span></button>
    <div id={id} ref={panel} popover="auto" className="tool-disclosure-panel" data-cad-editor="true"
      role="group" aria-label={label} style={position}
      onToggle={event => setOpen(event.newState === "open")}
      onClick={event => {
        if (closeOnAction && event.target instanceof Element && event.target.closest("button:not(:disabled)")) panel.current?.hidePopover();
      }}>
      <div className="tool-disclosure-title">{label}</div>{children}
    </div>
  </>;
}
