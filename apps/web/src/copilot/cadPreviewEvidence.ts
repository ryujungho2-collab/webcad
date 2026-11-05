import type {PlanChange} from "../state/documentPlans";
/** Human Review and MCP receipts report the same native result, not just requested inputs. */
export function cadPreviewEvidence(changes:PlanChange[]){return changes.filter(change=>change.after?.volume!==undefined).map(change=>{const m=change.after!,b=m.bounds;return `${change.name}: ${m.volume!.toFixed(4)} mm³${b?` · BRep bounds mm: X [${b.min[0].toFixed(3)}, ${b.max[0].toFixed(3)}], Y [${b.min[1].toFixed(3)}, ${b.max[1].toFixed(3)}], Z [${b.min[2].toFixed(3)}, ${b.max[2].toFixed(3)}]`:""}`;});}
