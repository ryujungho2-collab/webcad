/** Browser runner input crosses CDP, including hit testing; it never dispatches synthetic click events. */
export const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,35));
export async function waitFor(check:()=>boolean,message="UI did not become ready"){
  const end=Date.now()+18000;while(!check()){if(Date.now()>end)throw new Error(`${message}: ${document.body.innerText.slice(-1000)}`);await pause();}await pause();
}
export async function input(action:Record<string,unknown>){const run=new URLSearchParams(location.search).get("run"),response=await fetch(`/__browser_input?run=${run}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});if(!response.ok)throw new Error(await response.text());return response;}
/** Open the visible disclosure that owns a ribbon tool. Never force-clicks hidden tools or calls showPopover. */
export async function openDisclosureFor(element:Element){
  const panel=element.closest<HTMLElement>("[popover]");
  if(panel&&!panel.matches(":popover-open")){
    const trigger=[...document.querySelectorAll<HTMLButtonElement>("button[popovertarget]")].find(button=>button.popoverTargetElement===panel);
    if(!trigger||trigger.disabled)throw new Error(`Unavailable tool group: ${panel.getAttribute("aria-label")}`);
    await physical(trigger);await waitFor(()=>panel.matches(":popover-open"));
  }
}
export async function physical(element:Element,modifiers=0){
  await openDisclosureFor(element);
  const body=element.closest<HTMLElement>(".property-section-body[hidden]");
  if(body){const trigger=[...document.querySelectorAll<HTMLButtonElement>(".property-section-trigger")].find(button=>button.getAttribute("aria-controls")===body.id);if(!trigger||trigger.disabled)throw Error("Unavailable inspector section");await physical(trigger);await waitFor(()=>!body.hidden);}
  element.scrollIntoView({block:"center"});await pause();const box=element.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;if(!element.contains(document.elementFromPoint(x,y)))throw new Error(`Obscured control: ${element.outerHTML.slice(0,180)} by ${document.elementFromPoint(x,y)?.outerHTML.slice(0,180)??"nothing"}`);await input({type:"mousePressed",x,y,button:"left",buttons:1,modifiers});await input({type:"mouseReleased",x,y,button:"left",buttons:0,modifiers});await pause();
}
export function find(name:string){const element=[...document.querySelectorAll<HTMLButtonElement>("button")].find(e=>(e.getAttribute("aria-label")??e.textContent?.trim())===name);if(!element)throw new Error(`Missing control: ${name}`);return element;}
export async function click(name:string){const element=find(name);if(element.disabled)throw new Error(`Disabled: ${name}`);await physical(element);}
export async function text(name:string,value:string){const field=document.querySelector(`[aria-label="${name}"]`);if(!field)throw new Error(`Missing field: ${name}`);await physical(field);await input({type:"key",key:"a",modifiers:2});await input(value?{type:"text",text:value}:{type:"key",key:"Backspace"});await pause();}
export async function choose(name:string,index:number){const field=document.querySelector(`[aria-label="${name}"]`);if(!field)throw new Error(`Missing select: ${name}`);await physical(field);await input({type:"key",key:"Home"});for(let i=0;i<index;i++)await input({type:"key",key:"ArrowDown"});await input({type:"key",key:"Enter"});await pause();}
