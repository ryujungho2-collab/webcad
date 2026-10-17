import {validFrameStitch} from "./FrameStitch";
import type {CadDrawingFrame} from "./CadDocument";
export function validDrawingFrame(value:unknown):value is CadDrawingFrame {
 if(!value||typeof value!=="object")return false;
 const f=value as CadDrawingFrame;
 return (f.stitch===undefined||validFrameStitch(f.stitch))&&Array.isArray(f.memberIds)&&f.memberIds.length<=1000&&f.memberIds.every(id=>typeof id==="string"&&id.length>0)&&new Set(f.memberIds).size===f.memberIds.length&&Array.isArray(f.sourceOrigin)&&f.sourceOrigin.length===2&&f.sourceOrigin.every(Number.isFinite)&&Number.isFinite(f.denominator)&&f.denominator>=.001&&f.denominator<=1e6;
}
