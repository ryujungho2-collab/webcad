import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { CadDocument, CadFeature } from "@agent-webcad/cad-document";
import { layerStyle } from "../precision/layerStyle";
import { localDraftingGeometry } from "../precision/draftingGeometry";
import { planeToWorld, worldToPlane, WORK_PLANES, type WorkPlaneId } from "../precision/workPlane";
import { applyCenterPattern } from "./lineStyle";

export function createDraftingRenderObject(id:string,document:CadDocument,knownFeature?:CadFeature):THREE.Group {
  const object=document.objects[id],feature=knownFeature??Object.values(document.features).find(f=>f.output===id)!,group=new THREE.Group();
  const data=localDraftingGeometry(document,feature.params,layerStyle(document.layers[object.layerId]));
  for(const line of data.lines){
    const vectorStyle=line.vectorStyle;
    if(line.closed&&vectorStyle?.fill){
      const plane=(feature.params.workPlane==="XZ"||feature.params.workPlane==="YZ"?feature.params.workPlane:"XY") as WorkPlaneId;
      const normal=WORK_PLANES[plane].normal,points=line.points.map(point=>worldToPlane(point,WORK_PLANES[plane]));
      if(points.length>1&&Math.hypot(points[0][0]-points.at(-1)![0],points[0][1]-points.at(-1)![1])<1e-8)points.pop();
      const holes=(line.holes??[]).map(ring=>ring.map(point=>worldToPlane(point,WORK_PLANES[plane])));
      const contour=points.map(point=>new THREE.Vector2(...point)),triangles=contour.length>=3?THREE.ShapeUtils.triangulateShape(contour,holes.map(ring=>ring.map(p=>new THREE.Vector2(...p)))):[];
      if(triangles.length){
        const elevation=line.points[0].reduce((sum,value,index)=>sum+value*normal[index],0);
        const positions=[...points,...holes.flat()].flatMap(([x,y])=>planeToWorld([x,y],WORK_PLANES[plane]).map((value,index)=>value+normal[index]*elevation));
        const fillGeometry=new THREE.BufferGeometry();fillGeometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));fillGeometry.setIndex(triangles.flat());fillGeometry.computeVertexNormals();
        const fill=new THREE.Mesh(fillGeometry,new THREE.MeshBasicMaterial({color:vectorStyle.fill,transparent:vectorStyle.opacity<1,opacity:vectorStyle.opacity,side:THREE.DoubleSide,depthWrite:false}));
        fill.name=`Component fill · ${id}`;fill.userData.cadObjectId=id;fill.renderOrder=-1;group.add(fill);
      }
    }
    for(const ring of [line.points,...(line.holes??[])]){
    const points=line.closed?[...ring,ring[0]]:ring;
    const geometry=new LineGeometry().setPositions(points.flat());
    const material=new LineMaterial({color:vectorStyle?.stroke??line.style.color,linewidth:Math.max(1,(vectorStyle?.strokeWidth??line.style.lineWeight)*96/25.4),dashed:line.style.lineType!=="continuous",dashSize:line.style.lineType==="center"?6:3,gapSize:1.5});
    material.transparent=(vectorStyle?.opacity??1)<1;material.opacity=vectorStyle?.opacity??1;
    applyCenterPattern(material,line.style.lineType);
    const mesh=new Line2(geometry,material);mesh.computeLineDistances();mesh.onBeforeRender=renderer=>material.resolution.copy(renderer.getSize(new THREE.Vector2()));material.userData.baseColor=material.color.clone();group.add(mesh);
    }
  }
  for(const label of data.texts){
    const canvas=globalThis.document.createElement("canvas"),context=canvas.getContext("2d")!;
    context.font="48px system-ui";canvas.width=Math.max(64,Math.ceil(context.measureText(label.text).width)+8);canvas.height=64;
    context.font="48px system-ui";context.textBaseline="bottom";context.fillStyle=label.style.color;context.fillText(label.text,4,58);
    const texture=new THREE.CanvasTexture(canvas),material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,side:THREE.DoubleSide});
    const w=label.height*canvas.width/64,h=label.height;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material),plane=WORK_PLANES[String(feature.params.workPlane??"XY") as WorkPlaneId];
    const basis=new THREE.Matrix4().makeBasis(new THREE.Vector3(...plane.xAxis),new THREE.Vector3(...plane.yAxis),new THREE.Vector3(...plane.normal));
    mesh.quaternion.setFromRotationMatrix(basis);mesh.rotateZ(label.angle*Math.PI/180);
    if(label.axes){
      mesh.quaternion.identity();
      mesh.geometry.translate(label.align==="center"?0:w/2,h/2,0);
      mesh.geometry.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(...label.axes[0]),new THREE.Vector3(...label.axes[1]),new THREE.Vector3(...plane.normal)));
      mesh.position.set(...label.point);
    }else mesh.position.set(...label.point).add(new THREE.Vector3(label.align==="center"?0:w/2,h/2,0).applyQuaternion(mesh.quaternion));material.userData.baseColor=material.color.clone();mesh.renderOrder=21;group.add(mesh);
  }
  group.userData.cadObjectId=id;return group;
}
