import { useEffect, useState } from "react";

/** Comparison panes need a viewport, with Explorer/Properties available on demand. */
export function useCompactComparison() {
  const current=()=>document.documentElement.dataset.projectComparison==="true"&&window.innerWidth<=900;
  const [compact,setCompact]=useState(current);
  useEffect(()=>{
    const refresh=()=>setCompact(current()),observer=new MutationObserver(refresh);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-project-comparison"]});
    window.addEventListener("resize",refresh);refresh();
    return()=>{observer.disconnect();window.removeEventListener("resize",refresh);};
  },[]);
  return compact;
}
