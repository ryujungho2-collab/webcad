import { createContext,useContext,useEffect, useId, useState, type ReactNode } from "react";
import {readInspectorSection,writeInspectorSection} from "../properties/inspectorPreferences";
const Scope=createContext<string|null>(null);
export function InspectorSectionScope({scope,children}:{scope:string;children:ReactNode}){return <Scope.Provider value={scope}>{children}</Scope.Provider>;}

type PropertySectionProps = {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  active?: boolean;
  keepOpen?:boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Inspector disclosure only; model state and command handling stay with the caller. */
export function PropertySection({ title, meta, children, defaultOpen = true, active = false, keepOpen=false,onOpenChange }: PropertySectionProps) {
  const scope=useContext(Scope),key=scope?`${scope}:${title}`:null;
  const saved=()=>{try{return key?readInspectorSection(localStorage,key,defaultOpen):defaultOpen;}catch{return defaultOpen;}};
  const [open, setOpen] = useState(saved);
  const expanded=keepOpen||open;
  const id = useId();
  useEffect(()=>setOpen(saved()),[key]);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return <section className={`property-section property-section-collapsible${expanded ? " is-open" : ""}`} data-inspector-section={title}>
    <h3 className="property-section-heading">
      <button type="button" className="property-section-trigger" aria-expanded={expanded} aria-controls={id} disabled={keepOpen} onClick={() => {
        const next = !open;
        setOpen(next);
        if(key)try{writeInspectorSection(localStorage,key,next);}catch{/* UI preferences never block document editing. */}
        onOpenChange?.(next);
      }}>
        <span className="property-section-chevron" aria-hidden="true" />
        <span className="property-section-title">{title}</span>
        {meta !== undefined && <small>{meta}</small>}
      </button>
    </h3>
    <div id={id} className="property-section-body" hidden={!expanded}>{children}</div>
  </section>;
}
