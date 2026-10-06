import { useEffect, useId, useState, type ReactNode } from "react";

type PropertySectionProps = {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  active?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Inspector disclosure only; model state and command handling stay with the caller. */
export function PropertySection({ title, meta, children, defaultOpen = true, active = false, onOpenChange }: PropertySectionProps) {
  const [open, setOpen] = useState(defaultOpen || active);
  const id = useId();

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return <section className={`property-section property-section-collapsible${open ? " is-open" : ""}`}>
    <h3 className="property-section-heading">
      <button type="button" className="property-section-trigger" aria-expanded={open} aria-controls={id} onClick={() => {
        const next = !open;
        setOpen(next);
        onOpenChange?.(next);
      }}>
        <span className="property-section-chevron" aria-hidden="true" />
        <span className="property-section-title">{title}</span>
        {meta !== undefined && <small>{meta}</small>}
      </button>
    </h3>
    <div id={id} className="property-section-body" hidden={!open}>{children}</div>
  </section>;
}
