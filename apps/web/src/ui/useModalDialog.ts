import {useLayoutEffect,useRef} from "react";

/** Keep native modal focus containment, and restore only if another control has not taken focus. */
export function useModalDialog(open=true,initialFocus?:string){
  const ref=useRef<HTMLDialogElement>(null);
  useLayoutEffect(()=>{
    const element=ref.current;if(!open||!element)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(!element.open)element.showModal();
    if(initialFocus)element.querySelector<HTMLElement>(initialFocus)?.focus();
    return()=>{
      const ownedFocus=element.contains(document.activeElement)||document.activeElement===document.body;
      element.close();
      if(ownedFocus&&previous?.isConnected&&!previous.closest('[hidden], [inert]')&&previous.getClientRects().length)previous.focus({preventScroll:true});
    };
  },[open,initialFocus]);
  return ref;
}
