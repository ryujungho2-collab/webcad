import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {isCompositionKey,isTextEditingTarget} from "../input/shortcutRouter";

/** Native top-layer popover: survives toolbar scrolling and owns light-dismiss/Escape. */
export function ToolDisclosure({ label, children, disabled = false, closeOnAction = false, triggerContent }: {
  label: string; children: ReactNode; disabled?: boolean; closeOnAction?: boolean; triggerContent?:ReactNode;
}) {
  const id = useId(), panel = useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null),keyboardOpen=useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 540 });
  function close(restore=false){const owned=panel.current?.contains(document.activeElement);panel.current?.hidePopover();if(restore&&owned&&!disabled&&!document.querySelector('dialog[open]'))trigger.current?.focus();}
  function positionPanel(){const bounds=trigger.current?.getBoundingClientRect();if(!bounds)return;const height=Math.min(panel.current?.scrollHeight??540,540,Math.max(80,innerHeight-16)),below=innerHeight-bounds.bottom-14,above=bounds.top-14,up=below<height&&above>below;setPosition({left:Math.max(8,Math.min(bounds.left,innerWidth-320)),top:up?Math.max(8,bounds.top-height-6):Math.min(bounds.bottom+6,innerHeight-88),maxHeight:Math.max(64,up?above:below)});}
  useEffect(() => { if (disabled) close(); }, [disabled]);
  useEffect(() => {
    const resized = () => close(true);
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, []);
  return <>
    <button ref={trigger} type="button" className="tool-disclosure-trigger" popoverTarget={id} aria-label={label}
      disabled={disabled} aria-expanded={open} aria-controls={id}
      onKeyDown={event=>{if(isCompositionKey(event.nativeEvent))return;if(event.key==="Escape"&&panel.current?.matches(":popover-open")){event.preventDefault();event.stopPropagation();close(true);}else if(event.key==="ArrowDown"){event.preventDefault();keyboardOpen.current=true;positionPanel();panel.current?.showPopover();}else if(event.key==="Enter"||event.key===" ")keyboardOpen.current=true;}}
      onClick={event => {keyboardOpen.current=event.detail===0;positionPanel();}}>{triggerContent??label}<span aria-hidden="true">⌄</span></button>
    <div id={id} ref={panel} popover="auto" className="tool-disclosure-panel" data-cad-editor="true"
      role="group" aria-label={label} style={position}
      onToggle={event => {const next=event.newState==="open";setOpen(next);if(next){positionPanel();if(keyboardOpen.current)panel.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')?.focus();}keyboardOpen.current=false;}}
      onKeyDown={event=>{if(isCompositionKey(event.nativeEvent))return;if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close(true);return;}if(isTextEditingTarget(event.target)||!(event.target instanceof HTMLButtonElement)||!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;const stops=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(button=>button.getClientRects().length>0),index=stops.indexOf(event.target);event.preventDefault();stops[event.key==="Home"?0:event.key==="End"?stops.length-1:(index+(event.key==="ArrowDown"?1:-1)+stops.length)%stops.length]?.focus();}}
      onClick={event => {
        if (closeOnAction && event.target instanceof Element && event.target.closest("button:not(:disabled)")) close(true);
      }}>
      <div className="tool-disclosure-title">{label}</div>{children}
    </div>
  </>;
}
