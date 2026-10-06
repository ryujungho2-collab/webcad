export type SvgPolyline = {
  /** Plane coordinates in millimetres. Y grows up (negated on write). */
  points: [number, number][];
  closed: boolean;
  color?: string;
  lineWeight?: number;
  dash?: number[];
  opacity?: number;
  fill?: string;
  /** Internal source identity used to preserve document stacking in board exports. */
  objectId?: string;
};
export type SvgImage = { id: string; href: string; center: [number, number]; width: number; height: number; rotation: number; crop: { x: number; y: number; width: number; height: number }; mask?: "rect" | "ellipse"; opacity?: number; adjustments?: { brightness: number; contrast: number; saturation: number }; sourceSize?: [number, number] };
export type SvgExportItem = { type: "image"; image: SvgImage } | { type: "polyline"; polyline: SvgPolyline };

function format(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * Minimal SVG writer for 2D drawing export. One coordinate space (the active
 * work plane), uniform polylines — circles/arcs arrive pre-sampled from the
 * world-geometry layer, so curved output stays faithful without arc syntax.
 */
export function encodeSvg(polylines: SvgPolyline[], options: { decimals?: number; strokeWidth?: number; viewBox?: { origin: [number, number]; size: [number, number] }; background?: string; images?: SvgImage[]; items?: SvgExportItem[]; pixelSize?: { width: number; height: number } } = {}): string {
  const decimals = options.decimals ?? 3;
  const strokeWidth = options.strokeWidth ?? 0.5;
  const orderedPolylines = options.items ? options.items.filter((item): item is Extract<SvgExportItem, { type: "polyline" }> => item.type === "polyline").map(item => item.polyline) : polylines;
  const orderedImages = options.items ? options.items.filter((item): item is Extract<SvgExportItem, { type: "image" }> => item.type === "image").map(item => item.image) : options.images ?? [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const line of orderedPolylines) {
    for (const [x, y] of line.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  for (const image of orderedImages) {
    const radians=image.rotation*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
    for(const [x,y] of [[-image.width/2,-image.height/2],[image.width/2,-image.height/2],[image.width/2,image.height/2],[-image.width/2,image.height/2]]){
      const px=image.center[0]+x*cos-y*sin,py=image.center[1]+x*sin+y*cos;
      minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
    }
  }
  if ((!orderedPolylines.length && !orderedImages.length) || ![minX, minY, maxX, maxY].every(Number.isFinite)) {
    minX = 0; minY = 0; maxX = 10; maxY = 10;
  }
  const margin = Math.max(maxX - minX, maxY - minY) * 0.05 || 1;
  const board = options.viewBox;
  const viewX = board?.origin[0] ?? minX - margin;
  const viewY = board ? -(board.origin[1] + board.size[1]) : -(maxY + margin);
  const viewW = board?.size[0] ?? (maxX - minX) + margin * 2;
  const viewH = board?.size[1] ?? (maxY - minY) + margin * 2;

  const bodies = orderedPolylines.map((line) => {
    const points = line.points.map(([x, y]) => `${format(x, decimals)},${format(-y, decimals)}`).join(" ");
    const style=`${line.color?` stroke="${line.color}"`:""}${line.lineWeight?` stroke-width="${line.lineWeight}"`:""}${line.dash?.length?` stroke-dasharray="${line.dash.join(" ")}"`:""}${line.opacity!==undefined?` opacity="${format(line.opacity,decimals)}"`:""}${line.fill&&/^#[0-9a-f]{6}$/i.test(line.fill)?` fill="${line.fill}"`:""}`;
    return line.closed
      ? `<polygon points="${points}"${style} />`
      : `<polyline points="${points}"${style} />`;
  });
  const images=orderedImages.map((image,index)=>{
    const id=`raster-crop-${index}`,x=image.center[0]-image.width/2,y=-(image.center[1]+image.height/2);
    const sourceWidth=image.width/image.crop.width,sourceHeight=image.height/image.crop.height;
    const sourceX=x-image.crop.x*sourceWidth,sourceY=y-image.crop.y*sourceHeight;
    const opacity=image.opacity===undefined?"":` opacity="${format(Math.max(0,Math.min(1,image.opacity)),decimals)}"`;
    const adjustments=image.adjustments??{brightness:0,contrast:0,saturation:0};
    const contrast=1+adjustments.contrast/100,intercept=(adjustments.brightness/100-0.5)*contrast+0.5,saturation=1+adjustments.saturation/100;
    const filterId=`raster-adjustment-${index}`;
    const filter=adjustments.brightness||adjustments.contrast||adjustments.saturation
      ? `<defs><filter id="${filterId}" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="linear" slope="${format(contrast,decimals)}" intercept="${format(intercept,decimals)}" /><feFuncG type="linear" slope="${format(contrast,decimals)}" intercept="${format(intercept,decimals)}" /><feFuncB type="linear" slope="${format(contrast,decimals)}" intercept="${format(intercept,decimals)}" /></feComponentTransfer><feColorMatrix type="saturate" values="${format(saturation,decimals)}" /></filter></defs>`
      : "";
    const filterAttribute=filter?` filter="url(#${filterId})"`:"";
    const safeHref=image.href.replace(/&/g,"&amp;").replace(/"/g,"&quot;");
    const centerY=-image.center[1],rotate=-image.rotation;
    const shape=image.mask==="ellipse"
      ? `<ellipse cx="${format(x+image.width/2,decimals)}" cy="${format(y+image.height/2,decimals)}" rx="${format(image.width/2,decimals)}" ry="${format(image.height/2,decimals)}" />`
      : `<rect x="${format(x,decimals)}" y="${format(y,decimals)}" width="${format(image.width,decimals)}" height="${format(image.height,decimals)}" />`;
    return `${filter}<defs><clipPath id="${id}">${shape}</clipPath></defs><g clip-path="url(#${id})" transform="rotate(${format(rotate,decimals)} ${format(image.center[0],decimals)} ${format(centerY,decimals)})"><image x="${format(sourceX,decimals)}" y="${format(sourceY,decimals)}" width="${format(sourceWidth,decimals)}" height="${format(sourceHeight,decimals)}" href="${safeHref}" preserveAspectRatio="none"${opacity}${filterAttribute} /></g>`;
  });
  const background = /^#[0-9a-f]{6}$/i.test(options.background ?? "")
    ? `<rect x="${format(viewX, decimals)}" y="${format(viewY, decimals)}" width="${format(viewW, decimals)}" height="${format(viewH, decimals)}" fill="${options.background}" stroke="none" />\n`
    : "";
  const imageBody = new Map(orderedImages.map((image, index) => [image, images[index]]));
  const polylineBody = new Map(orderedPolylines.map((line, index) => [line, bodies[index]]));
  const orderedContent = options.items
    ? options.items.map(item => item.type === "image" ? imageBody.get(item.image)! : polylineBody.get(item.polyline)!)
    : [...images, ...bodies];
  const content = `${background}${orderedContent.join("\n")}`;
  const clippedContent = board
    ? `<defs><clipPath id="artboard-crop"><rect x="${format(viewX, decimals)}" y="${format(viewY, decimals)}" width="${format(viewW, decimals)}" height="${format(viewH, decimals)}" /></clipPath></defs>\n<g clip-path="url(#artboard-crop)">\n${content}\n</g>`
    : content;
  const pixelDimensions = options.pixelSize ? ` width="${options.pixelSize.width}px" height="${options.pixelSize.height}px"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg"${pixelDimensions} viewBox="${format(viewX, decimals)} ${format(viewY, decimals)} ${format(viewW, decimals)} ${format(viewH, decimals)}" stroke="black" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n${clippedContent}\n</svg>\n`;
}
