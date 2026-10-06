import * as THREE from "three";
import { DEFAULT_CAD_IMAGE_ADJUSTMENTS, type CadDocument, type CadImageAdjustments, type CadImageCrop, type CadImageMask, type CadRasterAsset } from "@agent-webcad/cad-document";
import { WORK_PLANES } from "../precision/workPlane";
import { acquireImageTexture } from "./imageTextureResources";

function applyCrop(texture: THREE.Texture, crop: CadImageCrop) {
  texture.repeat.set(crop.width, crop.height);
  texture.offset.set(crop.x, 1 - crop.y - crop.height);
  // UV transform is a uniform change; it must not upload unchanged source pixels.
}

function setImageAdjustments(material: THREE.MeshBasicMaterial, value: CadImageAdjustments) {
  material.userData.cadImageAdjustments = { brightness: value.brightness / 100, contrast: value.contrast / 100, saturation: value.saturation / 100 };
  const uniforms = material.userData.cadImageAdjustmentUniforms as Record<string, { value: number }> | undefined;
  if (uniforms) {
    uniforms.cadImageBrightness.value = value.brightness / 100;
    uniforms.cadImageContrast.value = value.contrast / 100;
    uniforms.cadImageSaturation.value = value.saturation / 100;
  }
}

export function configureImageAdjustmentMaterial(material: THREE.MeshBasicMaterial, value: CadImageAdjustments) {
  setImageAdjustments(material, value);
  material.onBeforeCompile = shader => {
    const values = material.userData.cadImageAdjustments as { brightness: number; contrast: number; saturation: number };
    shader.uniforms.cadImageBrightness = { value: values.brightness };
    shader.uniforms.cadImageContrast = { value: values.contrast };
    shader.uniforms.cadImageSaturation = { value: values.saturation };
    material.userData.cadImageAdjustmentUniforms = shader.uniforms;
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      uniform float cadImageBrightness;
      uniform float cadImageContrast;
      uniform float cadImageSaturation;
      vec3 cadImageToSrgb(vec3 color) {
        bvec3 low = lessThanEqual(color, vec3(0.0031308));
        vec3 linearPart = color * 12.92;
        vec3 srgbPart = 1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
        return mix(srgbPart, linearPart, low);
      }
      vec3 cadImageToLinear(vec3 color) {
        bvec3 low = lessThanEqual(color, vec3(0.04045));
        vec3 linearPart = color / 12.92;
        vec3 srgbPart = pow(max((color + 0.055) / 1.055, vec3(0.0)), vec3(2.4));
        return mix(srgbPart, linearPart, low);
      }`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      vec3 cadImageSrgb = cadImageToSrgb(diffuseColor.rgb);
      cadImageSrgb = (cadImageSrgb + vec3(cadImageBrightness) - 0.5) * (1.0 + cadImageContrast) + 0.5;
      float cadImageLuminance = dot(cadImageSrgb, vec3(0.2126, 0.7152, 0.0722));
      cadImageSrgb = clamp(vec3(cadImageLuminance) + (cadImageSrgb - vec3(cadImageLuminance)) * (1.0 + cadImageSaturation), 0.0, 1.0);
      diffuseColor.rgb = cadImageToLinear(cadImageSrgb);`);
  };
  material.customProgramCacheKey = () => "cad-image-placement-adjustments-v1";
}

export function imageGeometry(width: number, height: number, mask: CadImageMask): THREE.BufferGeometry {
  if (mask === "ellipse") {
    const geometry = new THREE.CircleGeometry(1, 64);
    geometry.scale(width / 2, height / 2, 1);
    return geometry;
  }
  return new THREE.PlaneGeometry(width, height);
}

export function createImageSceneObject(objectId: string, document: CadDocument): THREE.Group | null {
  const feature = Object.values(document.features).find(entry => entry.output === objectId && entry.type === "image");
  if (!feature) return null;
  const params = feature.params as unknown as import("@agent-webcad/cad-document").CadImageNodeParams;
  const asset = document.rasterAssets?.[params.assetId];
  if (!asset) return null;
  const root = new THREE.Group();
  root.name = asset.name;
  root.userData.cadObjectId = objectId;
  const oriented = new THREE.Group();
  const plane = WORK_PLANES[params.workPlane];
  oriented.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...plane.xAxis), new THREE.Vector3(...plane.yAxis), new THREE.Vector3(...plane.normal),
  ));
  const texture = acquireImageTexture(asset);
  applyCrop(texture, params.crop);
  const material = new THREE.MeshBasicMaterial({ map: texture, opacity: params.opacity ?? 1, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false });
  configureImageAdjustmentMaterial(material, params.adjustments ?? DEFAULT_CAD_IMAGE_ADJUSTMENTS);
  material.userData.baseColor = material.color.getHex();
  const mask = params.mask ?? "rect";
  const image = new THREE.Mesh(imageGeometry(params.width, params.height, mask), material);
  image.name = `Raster image ${asset.name}`;
  image.renderOrder = -1;
  image.userData.cadObjectId = objectId;
  image.userData.rasterAssetId = asset.id;
  image.userData.imageMask = mask;
  image.userData.imageWidth = params.width;
  image.userData.imageHeight = params.height;
  oriented.add(image);
  root.add(oriented);
  return root;
}

export function updateImageSceneCrop(root: THREE.Object3D | undefined, crop: CadImageCrop, mask: CadImageMask = "rect", opacity = 1, revealSource = false, adjustments: CadImageAdjustments = DEFAULT_CAD_IMAGE_ADJUSTMENTS, asset?: CadRasterAsset) {
  root?.traverse(child => {
    const mesh = child as THREE.Mesh;
    const material = mesh.material as THREE.MeshBasicMaterial | undefined;
    if (!mesh.isMesh || !material?.map) return;
    if (asset && mesh.userData.rasterAssetId !== asset.id) {
      const previous = material.map;
      material.map = acquireImageTexture(asset);
      mesh.userData.rasterAssetId = asset.id;
      previous.dispose();
    }
    applyCrop(material.map, revealSource ? { x: 0, y: 0, width: 1, height: 1 } : crop);
    material.opacity = opacity;
    setImageAdjustments(material, adjustments);
    if (mesh.userData.imageMask !== mask) {
      mesh.geometry.dispose();
      mesh.geometry = imageGeometry(Number(mesh.userData.imageWidth), Number(mesh.userData.imageHeight), mask);
      mesh.userData.imageMask = mask;
    }
  });
}
