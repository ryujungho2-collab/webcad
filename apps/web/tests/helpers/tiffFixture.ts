/** Independent 2×2 baseline RGB TIFF fixture (red, green, blue, white). */
export function rgbTiffFixture(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(152), view = new DataView(bytes.buffer);
  bytes.set([73, 73, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 10, true);
  const tags: [number, number, number, number][] = [
    [256, 3, 1, 2], [257, 3, 1, 2], [258, 3, 3, 134], [259, 3, 1, 1],
    [262, 3, 1, 2], [273, 4, 1, 140], [277, 3, 1, 3], [278, 4, 1, 2],
    [279, 4, 1, 12], [284, 3, 1, 1],
  ];
  tags.forEach(([tag, type, count, value], index) => {
    const at = 10 + index * 12;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    if (type === 3 && count === 1) view.setUint16(at + 8, value, true);
    else view.setUint32(at + 8, value, true);
  });
  view.setUint32(130, 0, true);
  view.setUint16(134, 8, true); view.setUint16(136, 8, true); view.setUint16(138, 8, true);
  bytes.set([255,0,0, 0,255,0, 0,0,255, 255,255,255], 140);
  return bytes;
}
