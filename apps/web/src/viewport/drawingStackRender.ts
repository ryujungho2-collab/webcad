import type { Material, Mesh, Object3D } from "three";

const nodeOrder = new WeakMap<Object3D, number>();
const materialState = new WeakMap<Material, Pick<Material, "transparent" | "depthTest" | "depthWrite">>();

/** A single transparent pass lets 2D strokes and fills use the same painter order. */
export function setDrawingStackOrder(root: Object3D, order?: number, step = 1) {
  if (order === undefined && !nodeOrder.has(root)) return;
  root.traverse(node => {
    const previousOrder = nodeOrder.get(node);
    if (order === undefined) {
      if (previousOrder !== undefined) node.renderOrder = previousOrder;
      nodeOrder.delete(node);
    } else {
      if (previousOrder === undefined) nodeOrder.set(node, node.renderOrder);
      // A drawing's fill must precede its own outline.
      // Three.js sorts group order before mesh order. Keep both grouped fills
      // and stand-alone strokes in the same group order.
      node.renderOrder = (node as Object3D & { isGroup?: boolean }).isGroup
        ? 0 : order + ((previousOrder ?? node.renderOrder) < 0 ? 0 : step / 2);
    }
    const material = (node as Mesh).material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      const previous = materialState.get(entry);
      if (order === undefined) {
        if (!previous) continue;
        Object.assign(entry, previous);
        materialState.delete(entry);
      } else {
        if (previous) continue;
        materialState.set(entry, { transparent: entry.transparent, depthTest: entry.depthTest, depthWrite: entry.depthWrite });
        entry.transparent = true;
        entry.depthTest = false;
        entry.depthWrite = false;
      }
      entry.needsUpdate = true;
    }
  });
}
