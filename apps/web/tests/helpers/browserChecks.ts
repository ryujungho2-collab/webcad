/** Shared automatic execution/reporting for the real React/Worker pages. */
export function installBrowserChecks(button: HTMLButtonElement, output: HTMLElement) {
  const query = new URLSearchParams(location.search);
  let reported = false;
  const report = () => {
    if (reported) return;
    const message = output.textContent ?? "";
    const passed = message.match(/ALL (\d+) CHECKS PASSED/);
    if (!passed && !message.includes("FAIL:")) return;
    reported = true;
    document.documentElement.dataset.browserStatus = passed ? "passed" : "failed";
    if (query.get("run")) void (async()=>{
      const json=JSON.stringify({ status: passed ? "passed" : "failed", checks: Number(passed?.[1] ?? 0), message, artifacts:(globalThis as typeof globalThis & {cadTestArtifacts?:Record<string,string>}).cadTestArtifacts, metrics:(globalThis as typeof globalThis & {cadTestMetrics?:unknown}).cadTestMetrics });
      const headers:Record<string,string>={"Content-Type":"application/json"};let body:string|ArrayBuffer=json;
      if(json.length>1000000&&typeof CompressionStream!=="undefined"){body=await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();headers["Content-Encoding"]="gzip";}
      const result=await fetch(`/__browser_result?run=${encodeURIComponent(query.get("run")!)}`,{method:"POST",headers,body});
      if(!result.ok)throw Error(`Browser result delivery failed: HTTP ${result.status}`);
    })();
  };
  new MutationObserver(report).observe(output, { childList: true, subtree: true, characterData: true });
  window.addEventListener("error",event=>{output.textContent=`${output.textContent}\nFAIL: Uncaught browser error: ${event.message} STACK ${String((event.error as Error|undefined)?.stack??"").replaceAll(String.fromCharCode(10)," | ").slice(0,900)}`;});
  window.addEventListener("unhandledrejection",event=>{output.textContent=`${output.textContent}\nFAIL: Unhandled browser rejection: ${String(event.reason)}`;});
  if (query.get("auto") === "1") setTimeout(() => button.click(), 100);
}
