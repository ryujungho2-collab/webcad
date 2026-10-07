import type { CadDocument } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { worldToPlane, WORK_PLANES } from "../precision/workPlane";
type SingleSourceDimensionCommand = Exclude<Extract<CadCommand, { type: "create-dimension" }>, { dimension: "angular" }>;

/**
 * Shared dimension-creation planning for the Inspector button, the App
 * palette action and future Copilot intents. Returns a layer-agnostic
 * create-dimension command, or null when the selection is not dimensionable
 * (locked layer, rotated geometry, non-uniform scale, unsupported kind).
 * Dimensions link back via sourceObjectId and follow later edits of the
 * measured line/circle inside the same undo step; deleting the source
 * freezes the annotation and drops the link.
 */
export function planDimensionFromSelection(document: CadDocument, objectId: string): SingleSourceDimensionCommand | null {
  const object = document.objects[objectId];
  if (!object) return null;
  const layer = document.layers[object.layerId];
  if (!object.visible || !layer?.visible || layer.locked) return null;
  const feature = Object.values(document.features).find((entry) => entry.output === objectId);
  if (!feature || feature.type !== "drawing" || feature.params.sketchId) return null;
  const world = getWorldDrawingGeometry(object, feature);
  if (!world || !world.planeAligned) return null;
  const plane = world.workPlane;
  const frame = WORK_PLANES[plane];

  if (world.kind === "line" && world.points?.length === 2) {
    const points = world.points.map((point) => worldToPlane(point, frame));
    return {
      type: "create-dimension",
      dimension: "linear",
      params: {
        workPlane: plane,
        points,
        orientation: "aligned",
        offset: 10,
        sourceObjectId: object.id,
      },
    };
  }
  if (world.kind === "circle" && world.center && world.radius !== undefined && world.uniformScale) {
    return {
      type: "create-dimension",
      dimension: "radius",
      params: {
        workPlane: plane,
        center: worldToPlane(world.center, frame),
        radius: world.radius,
        angle: 45,
        sourceObjectId: object.id,
      },
    };
  }
  return null;
}

/** Diameter annotation measures the supporting circle, without adding a sketch driver. */
export function planDiameterFromSelection(document:CadDocument,objectId:string):SingleSourceDimensionCommand|null {
 const object=document.objects[objectId],layer=object&&document.layers[object.layerId];
 if(!object?.visible||!layer?.visible||layer.locked)return null;
 const feature=Object.values(document.features).find(f=>f.output===objectId);
 if(!feature||feature.type!=="drawing"||feature.params.sketchId)return null;
 const world=getWorldDrawingGeometry(object,feature);
 if(!world?.planeAligned||!world.uniformScale||!["circle","arc"].includes(world.kind)||!world.center||world.radius===undefined)return null;
 return {type:"create-dimension",dimension:"diameter",params:{workPlane:world.workPlane,center:worldToPlane(world.center,WORK_PLANES[world.workPlane]),radius:world.radius,angle:world.kind==="arc"?world.startAngle!*180/Math.PI:45,sourceObjectId:objectId}};
}
