import type { SnapResult, SnapType } from "./snapEngine";
export type SnapPreferences = { enabled: Record<SnapType, boolean>; gridStep: number; tolerancePx: number };
export const SNAP_LABELS: Record<SnapType,string> = {intersection:"Intersection",endpoint:"Endpoint",midpoint:"Midpoint",center:"Center",quadrant:"Quadrant",perpendicular:"Perpendicular",tangent:"Tangent",extension:"Extension",nearest:"Nearest",grid:"Grid"};
export const SNAP_SYMBOLS: Record<SnapType,string> = {intersection:"×",endpoint:"□",midpoint:"△",center:"○",quadrant:"◇",perpendicular:"⊥",tangent:"T",extension:"⋯",nearest:"∼",grid:"#"};
export const DEFAULT_SNAP_PREFERENCES: SnapPreferences = { enabled: {intersection:true,endpoint:true,midpoint:true,center:true,quadrant:true,perpendicular:true,tangent:true,extension:false,nearest:true,grid:true},gridStep:1,tolerancePx:12 };
const key="agent-webcad.snap-preferences.v1";
export function loadSnapPreferences():SnapPreferences {
  const defaults=structuredClone(DEFAULT_SNAP_PREFERENCES);
  try{const stored=JSON.parse(localStorage.getItem(key)??"null");if(!stored)return defaults;
    for(const type of Object.keys(defaults.enabled) as SnapType[])if(typeof stored.enabled?.[type]==="boolean")defaults.enabled[type]=stored.enabled[type];
    if(Number.isFinite(stored.gridStep)&&stored.gridStep>=1e-6&&stored.gridStep<=1e9)defaults.gridStep=stored.gridStep;
    if(Number.isFinite(stored.tolerancePx)&&stored.tolerancePx>=2&&stored.tolerancePx<=40)defaults.tolerancePx=stored.tolerancePx;
  }catch{/* Storage unavailable or malformed: retain usable defaults. */}return defaults;
}
export function saveSnapPreferences(preferences:SnapPreferences){try{localStorage.setItem(key,JSON.stringify(preferences));}catch{/* Preferences work in memory when storage is unavailable. */}}
export function snapCaption(snap: SnapResult, objectName?:string){return `${SNAP_SYMBOLS[snap.type]} ${SNAP_LABELS[snap.type]}${objectName?` · ${objectName}`:""}`;}
