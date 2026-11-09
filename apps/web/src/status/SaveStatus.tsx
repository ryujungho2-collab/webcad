import {ToolDisclosure} from "../ui/ToolDisclosure";

export function SaveStatus({local,file,onSave,onDownload}:{local:string;file:string;onSave:()=>void;onDownload:()=>void}){
  const failed=/failed/i.test(local);
  return <div className={`status-save${failed?" status-save-failed":""}`}>
    <ToolDisclosure label="Save and download status" triggerContent={local}>
      <p role="status" aria-live="polite" aria-atomic="true">{local}</p>
      <p>{file}</p>
      <small>Local recovery stays in this browser. File download completion must be checked in your browser.</small>
      <div className="status-save-actions"><button type="button" onClick={onSave}>{failed?"Retry local save":"Save locally"}</button><button type="button" onClick={onDownload}>Download WebCAD file</button></div>
    </ToolDisclosure>
  </div>;
}
