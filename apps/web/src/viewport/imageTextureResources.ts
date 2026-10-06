import * as THREE from "three";
import type { CadRasterAsset } from "@agent-webcad/cad-document";

type Entry = { base: THREE.Texture; image: HTMLImageElement; leases: Set<THREE.Texture>; pixels: number; ready: boolean };
// Only live placements retain sources. There is deliberately no idle/eviction cache.
const sources = new Map<string, Entry>();

/** Share decoded pixels and GPU Source; crop/offset remain private to each texture. */
export function acquireImageTexture(asset: CadRasterAsset): THREE.Texture {
  const key = asset.dataUrl;
  let entry = sources.get(key);
  if (!entry) {
    const image = new Image(), base = new THREE.Texture(image);
    base.colorSpace = THREE.SRGBColorSpace;
    entry = { base, image, leases: new Set(), pixels: asset.width * asset.height, ready: false };
    const current = entry;
    sources.set(key, current);
    image.onload = () => {
      if (sources.get(key) !== current) return;
      current.ready = true;
      for (const texture of current.leases) texture.needsUpdate = true;
    };
    image.onerror = () => { for (const texture of current.leases) texture.userData.loadError = "Image source could not be decoded."; };
    image.src = key;
  }
  const current = entry, texture = current.base.clone();
  current.leases.add(texture);
  if (current.ready) texture.needsUpdate = true;
  const release = () => {
    texture.removeEventListener("dispose", release);
    current.leases.delete(texture);
    if (current.leases.size) return;
    if (sources.get(key) === current) sources.delete(key);
    current.image.onload = current.image.onerror = null;
    current.image.src = "";
    current.base.dispose();
    current.base.source.data = null;
  };
  texture.addEventListener("dispose", release);
  return texture;
}

/** Resource counters, not a measurement of driver/heap memory. */
export function imageTextureResourceStats() {
  return { sources: sources.size, placements: [...sources.values()].reduce((n,e)=>n+e.leases.size,0), decodedRgbaBytes: [...sources.values()].reduce((n,e)=>n+e.pixels*4,0) };
}
