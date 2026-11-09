import {useEffect,useId,useRef} from "react";
import type {PaletteCommand} from "../commands/paletteCommands";
import type {SelectionContext} from "../commands/selectionContext";
import {ToolDisclosure} from "./ToolDisclosure";
import "./selectionToolbar.css";

export function SelectionToolbar({context,commands,selectionKey}:{context:SelectionContext;commands:PaletteCommand[];selectionKey:string}){
  const host=useRef<HTMLDivElement>(null),previous=useRef(selectionKey);
  const descriptionScope=useId();
  useEffect(()=>{if(previous.current!==selectionKey){host.current?.querySelector<HTMLElement>(":popover-open")?.hidePopover();previous.current=selectionKey;}},[selectionKey]);
  const action=(id:string,compact=false)=>{
    const command=commands.find(c=>c.id===id);if(!command)return null;
    const inspection=id==="inspect-image"||id==="inspect-selection"||id==="inspect-frame"||id==="fit-selection"||id==="fit-active-frame"||id==="sketch";
    const reason=command.disabledReason??(!inspection&&context.reason&&context.kind!=="mixed"&&context.kind!=="unsupported"?context.reason:undefined);
    const fullLabel=id==="inspect-selection"?context.kind==="annotation"?"Content, references & style":context.kind==="solid"?"Edit values":"Properties":command.label;
    const label=compact?({"frame-edit":"Crop & scale","frame-links":"Connect frames","frame-sheets":"Sheets","points-move":"Move","points-copy":"Copy","translate":"Move","rotate":"Rotate"} as Record<string,string>)[id]??fullLabel:fullLabel;
    const reasonId=reason?`${descriptionScope}-${id}-reason`:undefined;
    return <button type="button" key={id} data-context-command={id} aria-label={fullLabel} aria-describedby={reasonId} disabled={!!reason} title={reason??command.description??fullLabel} onClick={()=>{if(!reason)command.run();}}>{label}{reason&&<small id={reasonId}>{reason}</small>}</button>;
  };
  const primary=[...new Set(context.primary)],more=[...new Set(context.more)].filter(id=>!primary.includes(id));
  const reason=context.reason??primary.map(id=>commands.find(c=>c.id===id)?.disabledReason).find(Boolean);
  return <div ref={host} className="selection-toolbar" data-context-kind={context.kind} role="region" aria-label="Selection tools">
    <div className="selection-toolbar-row"><strong title={context.label}>{context.label}</strong><div role="group" aria-label="Suggested selection commands">{primary.map(id=>action(id,true))}</div>{more.length>0&&<ToolDisclosure label="More selection tools" closeOnAction>{more.map(id=>action(id))}</ToolDisclosure>}</div>
    <div className="selection-toolbar-reason" title={reason}>{reason??"Choose a tool · More tools includes additional actions"}</div>
  </div>;
}
