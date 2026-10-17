import { useSyncExternalStore } from "react";
import { subscribeProjectActivity, projectActivityMetrics } from "./projectActivity";
const snapshot=()=>projectActivityMetrics().active;
export function useProjectActivity(){return useSyncExternalStore(subscribeProjectActivity,snapshot,()=>true);}
