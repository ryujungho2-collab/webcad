/** SVG meet/letterbox mapping. Snap to displayed source endpoints within ten CSS pixels. */
export function pickDxfPreviewPoint(svg:string,box:{left:number;top:number;width:number;height:number},client:[number,number],endpoints:[number,number][]):[number,number]|null{
  const view=svg.match(/viewBox="([^"]+)"/)?.[1].trim().split(/\s+/).map(Number);if(!view||view.length!==4||!view.every(Number.isFinite))return null;
  const [x,y,w,h]=view;if(w<=0||h<=0||box.width<=0||box.height<=0)return null;
  const scale=Math.min(box.width/w,box.height/h),px=client[0]-box.left-(box.width-w*scale)/2,py=client[1]-box.top-(box.height-h*scale)/2;
  if(px<0||py<0||px>w*scale||py>h*scale)return null;
  const point:[number,number]=[x+px/scale,-(y+py/scale)],nearest=endpoints.reduce<[number,number]|null>((best,p)=>!best||Math.hypot(p[0]-point[0],p[1]-point[1])<Math.hypot(best[0]-point[0],best[1]-point[1])?p:best,null);
  return nearest&&Math.hypot(nearest[0]-point[0],nearest[1]-point[1])*scale<=10?[...nearest]:point;
}
