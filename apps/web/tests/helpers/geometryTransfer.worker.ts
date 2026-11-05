// Benchmark only: round-trip structured-clone payload, never a CAD executor.
export {};
self.onmessage=(event:MessageEvent)=>self.postMessage(event.data);
self.postMessage({ready:true});
