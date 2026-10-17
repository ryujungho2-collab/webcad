import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ToolDisclosure } from "../ui/ToolDisclosure";

const ToolHost = createContext<HTMLElement | null>(null);

/** Only launch controls move into the popover; overlays/editors remain mounted. */
export function FrameToolDock({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return <ToolHost.Provider value={host}>
    <div className="frame-tool-dock" hidden={!enabled}>
      <ToolDisclosure label="Frames & sheets" disabled={!enabled}>
        <p className="frame-tool-intro">Arrange drawings, connect views and prepare paper sheets.</p>
        <div className="frame-tool-actions" ref={setHost} />
      </ToolDisclosure>
    </div>
    {children}
  </ToolHost.Provider>;
}

export function FrameToolActions({ label, order, children }: { label: string; order: number; children: ReactNode }) {
  const host = useContext(ToolHost);
  return host ? createPortal(<section className="frame-tool-section" style={{ order }} aria-label={`${label} tools`}>
    <h3>{label}</h3>{children}
  </section>, host) : null;
}
