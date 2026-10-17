import { embeddedProjectId, PROJECT_CHANNEL, projectSessionGeneration } from "./projectSession";

/** A paused frame remains queued, so mounted tools retain their local drafts. */
export class ProjectFrameScheduler {
  private next = 0;
  private frames = new Map<number, { callback: FrameRequestCallback; native?: number }>();
  active = true;
  delivered = 0;
  constructor(private request: (callback: FrameRequestCallback) => number, private cancel: (id: number) => void) {}
  schedule(callback: FrameRequestCallback) {
    const id = ++this.next; this.frames.set(id, { callback }); this.arm(id); return id;
  }
  remove(id: number) { const frame = this.frames.get(id); if (frame?.native !== undefined) this.cancel(frame.native); this.frames.delete(id); }
  setActive(active: boolean) {
    if (active === this.active) return;
    this.active = active;
    for (const [id, frame] of this.frames) {
      if (!active && frame.native !== undefined) { this.cancel(frame.native); frame.native = undefined; }
      else if (active) this.arm(id);
    }
  }
  private arm(id: number) {
    const frame = this.frames.get(id); if (!frame || !this.active || frame.native !== undefined) return;
    frame.native = this.request(time => {
      if (!this.frames.has(id)) return;
      frame.native = undefined;
      if (!this.active) return;
      this.frames.delete(id); this.delivered++; frame.callback(time);
    });
  }
  get pending() { return this.frames.size; }
}

const browser = typeof window !== "undefined";
let hostActive = !browser || !embeddedProjectId();
const listeners = new Set<(active: boolean) => void>();
const scheduler = new ProjectFrameScheduler(callback => window.requestAnimationFrame(callback), id => window.cancelAnimationFrame(id));
const activeNow = () => hostActive && (!browser || !document.hidden);
function update() {
  const active = activeNow(); if (active === scheduler.active) return;
  scheduler.setActive(active);
  if (browser) document.documentElement.dataset.projectRenderState = active ? "active" : "paused";
  for (const listener of listeners) listener(active);
}
if (browser) {
  scheduler.setActive(activeNow());
  document.documentElement.dataset.projectRenderState = scheduler.active ? "active" : "paused";
  document.addEventListener("visibilitychange", update);
  window.addEventListener("message", event => {
    const data = event.data;
    if (!embeddedProjectId() || event.source !== window.parent || event.origin !== location.origin || data?.channel !== PROJECT_CHANNEL
      || data.id !== embeddedProjectId() || data.generation !== projectSessionGeneration() || data.type !== "activity" || typeof data.active !== "boolean") return;
    hostActive = data.active; update();
  });
}
export const requestProjectFrame = (callback: FrameRequestCallback) => scheduler.schedule(callback);
export const cancelProjectFrame = (id: number) => scheduler.remove(id);
export function subscribeProjectActivity(listener: (active: boolean) => void) { listeners.add(listener); listener(scheduler.active); return () => { listeners.delete(listener); }; }
export function projectActivityMetrics() { return { active: scheduler.active, deliveredFrames: scheduler.delivered, pendingFrames: scheduler.pending }; }
