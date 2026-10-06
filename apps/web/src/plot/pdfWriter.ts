export type PdfPolyline = {
  points: [number, number][];
  closed: boolean;
  color?: string;
  lineWeight?: number;
  dash?: number[];
};

export type PdfText = {
  position: [number, number];
  sizeMm: number;
  text: string;
  color?: string;
  angle?: number;
  raster?: {hex:string;width:number;height:number};
  align?: "center";
};

export type PdfPage = {
  /** Paper size in millimetres (after orientation). */
  widthMm: number;
  heightMm: number;
  polylines: PdfPolyline[];
  texts: PdfText[];
};

export type PdfRasterPage = {
  /** Physical page size in millimetres. */
  widthMm: number;
  heightMm: number;
  /** Opaque sRGB JPEG covering the complete page. PDF has no page alpha. */
  raster: { width: number; height: number; jpeg: Uint8Array };
};

export const MM_TO_PT = 2.834645669;

function format(value: number): string {
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * Base-14 Helvetica is WinAnsi-only: anything outside Latin-1 degrades to
 * "?" instead of corrupting the byte offsets the xref table depends on.
 */
function sanitizeText(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x0a) {
      out += " ";
    } else if (code < 32 || code > 255) {
      throw new Error("Unicode text needs the browser font rasterizer before PDF encoding.");
    } else {
      out += char;
    }
  }
  return out.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Minimal single-page vector PDF writer (no dependencies): stroked
 * polylines plus Helvetica labels. Coordinates arrive in paper
 * millimetres, Y-up; the writer flips to PDF's bottom-left origin.
 */
export function encodePdf(page: PdfPage): Uint8Array {
  const { widthMm, heightMm } = page;
  const widthPt = widthMm * MM_TO_PT;
  const heightPt = heightMm * MM_TO_PT;
  const toPt = (x: number, y: number): [number, number] => [x * MM_TO_PT, heightPt - y * MM_TO_PT];

  const ops: string[] = ["0.5 w", "0 0 0 RG"];
  const images:NonNullable<PdfText["raster"]>[]=[];
  const rgb=(color?:string)=>{const hex=(color??"#000000").slice(1);return [0,2,4].map(i=>format(parseInt(hex.slice(i,i+2),16)/255)).join(" ");};
  for (const line of page.polylines) {
    if (line.points.length < 2) continue;
    ops.push(`${format((line.lineWeight??0.25)*MM_TO_PT)} w`,`${rgb(line.color)} RG`,`[${(line.dash??[]).map(v=>format(v*MM_TO_PT)).join(" ")}] 0 d`);
    const [first, ...rest] = line.points;
    const [fx, fy] = toPt(first[0], first[1]);
    ops.push(`${format(fx)} ${format(fy)} m`);
    for (const [x, y] of rest) {
      const [px, py] = toPt(x, y);
      ops.push(`${format(px)} ${format(py)} l`);
    }
    if (line.closed) ops.push("h");
    ops.push("S");
  }
  for (const label of page.texts) {
    if (!label.text) continue;
    let [x, y] = toPt(label.position[0], label.position[1]);
    const sizePt = Math.max(1, label.sizeMm * MM_TO_PT);
    const radians=Number(label.angle??0)*Math.PI/180,c=format(Math.cos(radians)),s=format(Math.sin(radians));
    if(label.align==="center"){
      const width=label.raster?sizePt*label.raster.width/label.raster.height:Array.from(label.text).reduce((sum,ch)=>sum+(/[0-9]/.test(ch)?0.556:/[., ]/.test(ch)?0.278:ch==="m"?0.833:0.55),0)*sizePt;
      x-=Math.cos(radians)*width/2;y-=Math.sin(radians)*width/2;
    }
    if(label.raster){
      const image=label.raster,index=images.push(image)-1,w=sizePt*image.width/image.height;
      const unicode="FEFF"+Array.from({length:label.text.length},(_,i)=>label.text.charCodeAt(i).toString(16).padStart(4,"0")).join("");
      ops.push(`/Span << /ActualText <${unicode}> >> BDC`,`q ${format(w*Math.cos(radians))} ${format(w*Math.sin(radians))} ${format(-sizePt*Math.sin(radians))} ${format(sizePt*Math.cos(radians))} ${format(x)} ${format(y)} cm /Im${index} Do Q`,"EMC");
    }else ops.push(`${rgb(label.color)} rg`,`BT /F1 ${format(sizePt)} Tf ${c} ${s} ${format(-Math.sin(radians))} ${c} ${format(x)} ${format(y)} Tm (${sanitizeText(label.text)}) Tj ET`);
  }
  const content = ops.join("\n") + "\n";

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${format(widthPt)} ${format(heightPt)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /XObject << ${images.map((_,i)=>`/Im${i} ${i+6} 0 R`).join(" ")} >> >> >>`,
    `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for(const image of images){const data=image.hex+">\n";objects.push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${data.length} >>\nstream\n${data}endstream`);}

  const encoder = new TextEncoder();
  const header = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";
  const chunks: Uint8Array[] = [encoder.encode(header)];
  const offsets: number[] = [];
  let cursor = chunks[0].length;
  objects.forEach((body, index) => {
    const text = `${index + 1} 0 obj\n${body}\nendobj\n`;
    offsets.push(cursor);
    const bytes = encoder.encode(text);
    chunks.push(bytes);
    cursor += bytes.length;
  });
  const xrefAt = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * Writes opaque full-page raster boards to a multi-page PDF. JPEG streams are
 * stored as binary DCTDecode images, avoiding a second ASCII-hex copy of every
 * raster. The existing vector plot encoder remains unchanged.
 */
export function encodePdfRasterPages(pages: PdfRasterPage[]): Uint8Array {
  if (!pages.length) throw new Error("Add at least one visible artboard before creating a PDF.");
  const encoder = new TextEncoder();
  const bodies: Array<{ prefix: string; data?: Uint8Array; suffix?: string }> = [
    { prefix: "<< /Type /Catalog /Pages 2 0 R >>" },
    { prefix: `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 3} 0 R`).join(" ")}] /Count ${pages.length} >>` },
  ];

  for (const [index, page] of pages.entries()) {
    const widthPt = page.widthMm * MM_TO_PT, heightPt = page.heightMm * MM_TO_PT;
    const { width, height, jpeg } = page.raster;
    if (![page.widthMm, page.heightMm].every(value => Number.isFinite(value) && value > 0)) throw new Error("PDF page dimensions must be finite and positive.");
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error("PDF raster dimensions must be positive integer pixels.");
    if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[jpeg.length - 2] !== 0xff || jpeg[jpeg.length - 1] !== 0xd9) throw new Error("PDF page images must be complete JPEG data.");
    const pageObjectId = 3 + index * 3, contentObjectId = pageObjectId + 1, imageObjectId = pageObjectId + 2;
    const content = `q ${format(widthPt)} 0 0 ${format(heightPt)} 0 0 cm /Im0 Do Q\n`;
    bodies.push(
      { prefix: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${format(widthPt)} ${format(heightPt)}] /Contents ${contentObjectId} 0 R /Resources << /XObject << /Im0 ${imageObjectId} 0 R >> >> >>` },
      { prefix: `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream` },
      { prefix: `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, data: jpeg, suffix: "\nendstream" },
    );
  }

  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n")];
  const offsets: number[] = [];
  let cursor = chunks[0].length;
  for (const [index, body] of bodies.entries()) {
    const objectHeader = encoder.encode(`${index + 1} 0 obj\n`), prefix = encoder.encode(body.prefix), suffix = encoder.encode(`${body.suffix ?? ""}\nendobj\n`);
    offsets.push(cursor);
    chunks.push(objectHeader, prefix);
    cursor += objectHeader.length + prefix.length;
    if (body.data) { chunks.push(body.data); cursor += body.data.length; }
    chunks.push(suffix); cursor += suffix.length;
  }
  const xrefAt = cursor;
  let xref = `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));

  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
