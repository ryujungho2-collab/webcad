// Frame timings are opt-in: an idle review must not accumulate User Timing
// entries throughout a long working session. Command/preview timings stay on.
let recording=false;
export function recordFeedbackTimings(enabled:boolean){recording=enabled;}
export function measureDirectFeedback(start:number){
  if(recording)performance.measure("agent-webcad:direct-feedback",{start,end:performance.now()});
}
