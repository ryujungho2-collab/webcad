import { validateSceneGraph, type CadDocument } from "@agent-webcad/cad-document";
import { encodeSvg } from "../export/svgWriter";
import { evaluateScene } from "./sceneEvaluation";

/** Freeze the evaluated artwork and graph into a self-contained, read-only prototype. */
export function encodeOfflineScenePlayer(document: CadDocument, initialSceneId: string): string {
  validateSceneGraph(document);
  if (!document.scenes?.[initialSceneId]) throw new Error("Choose a saved scene to export.");
  const scenes = Object.values(document.scenes).map(scene => {
    const states = [{ id: "", name: "Default" }, ...scene.states.map(({ id, name }) => ({ id, name }))];
    const variants = states.map(state => {
      const base = evaluateScene(document, { ...scene, tracks: [] }, 0, state.id || undefined);
      return {
        id: state.id,
        frames: base.frames.map(frame => ({
          objectId: frame.objectId, name: document.objects[frame.objectId]?.name ?? frame.objectId,
          x: frame.x, y: frame.y, width: frame.width, height: frame.height,
          svg: encodeSvg([], { items: frame.items, viewBox: { origin: base.board.origin, size: base.board.size } }),
          visible: frame.items.some(item => (item.type === "image" ? item.image.opacity : item.polyline.opacity) !== 0),
        })),
      };
    });
    // Reject a scene whose animated output cannot be evaluated, before writing a partial file.
    for (const state of states) evaluateScene(document, scene, scene.durationMs, state.id || undefined);
    const board = document.artboards![scene.artboardId];
    return {
      id: scene.id, name: scene.name, notes: scene.notes, durationMs: scene.durationMs,
      autoAdvance: scene.autoAdvance, board: { origin: board.origin, size: board.size, background: board.background },
      states, variants, links: scene.links, tracks: scene.tracks,
    };
  });
  const payload = JSON.stringify({ initialSceneId, scenes }).replace(/</g, "\\u003c").replace(/&/g, "\\u0026");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scene prototype</title><style>
body{margin:0;background:#171c27;color:#f3f5f8;font:15px system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:20px}header,footer,.controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}header{justify-content:space-between}h1{font-size:20px}button,select,input{font:inherit}button,select{background:#303a4b;color:inherit;border:1px solid #65738a;border-radius:5px;padding:7px 10px}button:disabled{opacity:.4}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #ffca62}#stage{position:relative;width:100%;overflow:hidden;border:1px solid #65738a;background:#fff}#stage img{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#stage button{position:absolute;background:transparent;border:2px solid transparent;padding:0;min-width:2px;min-height:2px}#stage button:hover,#stage button:focus-visible{border-color:#ffca62;background:#ffca6233}#timeline{flex:1;min-width:180px}#notes{white-space:pre-wrap}
</style></head><body><main><header><h1 id="title"></h1><span>Offline scene prototype</span></header>
<div id="stage" aria-label="Scene artwork"></div><footer><div class="controls">
<button id="previous">Previous scene</button><button id="back">Back</button><button id="play">Play</button><button id="next">Next scene</button>
<label>State <select id="state" aria-label="Presentation state"></select></label>
<input id="timeline" aria-label="Scene timeline" type="range" min="0"><output id="time"></output></div><p id="notes"></p></footer></main>
<script>"use strict";
const data=${payload};
const byId=id=>document.getElementById(id);
let index=Math.max(0,data.scenes.findIndex(scene=>scene.id===data.initialSceneId)),state="",time=0,playing=false,last=0,mountedScene=null,mountedState=null;
const back=[];
function scene(){return data.scenes[index]}
function pose(track){if(!track)return [0,0,1];let t=Math.max(0,Math.min(1,(time-track.startMs)/(track.endMs-track.startMs)));if(track.easing==="ease-in-out")t=t*t*(3-2*t);return track.from.map((value,i)=>value+(track.to[i]-value)*t)}
function navigate(id,targetState="",remember=true){const next=data.scenes.findIndex(item=>item.id===id);if(next<0)return;if(remember)back.push({id:scene().id,state});index=next;state=targetState;time=0;render()}
function move(delta){const target=data.scenes[index+delta];if(target)navigate(target.id)}
function render(){const current=scene(),board=current.board,stage=byId("stage");byId("title").textContent=current.name;byId("notes").textContent=current.notes;
const variant=current.variants.find(item=>item.id===state)||current.variants[0];
if(mountedScene!==current.id||mountedState!==state){mountedScene=current.id;mountedState=state;stage.style.aspectRatio=board.size[0]+" / "+board.size[1];stage.style.background=board.background||"#fff";stage.replaceChildren();
for(const frame of variant.frames){const image=document.createElement("img");image.alt="";image.src=frame.url||(frame.url="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(frame.svg));frame.image=image;stage.append(image);
const link=current.links.find(item=>item.objectId===frame.objectId);if(link&&frame.visible){const button=document.createElement("button");button.type="button";button.setAttribute("aria-label","Navigate via "+frame.name);button.title="Open linked scene";button.style.width=Math.max(1,frame.width/board.size[0]*100)+"%";button.style.height=Math.max(1,frame.height/board.size[1]*100)+"%";button.onclick=()=>navigate(link.targetSceneId,link.targetStateId||"");frame.button=button;stage.append(button)}}}
for(const frame of variant.frames){const track=current.tracks.find(item=>item.objectId===frame.objectId),p=pose(track),dx=p[0]/board.size[0]*100,dy=-p[1]/board.size[1]*100;
frame.image.style.transform="translate("+dx+"%,"+dy+"%)";frame.image.style.opacity=String(p[2]);
if(frame.button){frame.button.hidden=p[2]<=0.000001;frame.button.style.left=((frame.x-board.origin[0])/board.size[0]*100+dx)+"%";frame.button.style.top=((board.origin[1]+board.size[1]-frame.y)/board.size[1]*100+dy)+"%"}}
const selector=byId("state");if(selector.dataset.scene!==current.id){selector.replaceChildren();for(const item of current.states){const option=document.createElement("option");option.value=item.id;option.textContent=item.name;selector.append(option)}selector.dataset.scene=current.id}selector.value=state;
byId("timeline").max=String(current.durationMs);byId("timeline").value=String(Math.round(time));byId("time").textContent=Math.round(time)+" / "+current.durationMs+" ms";
byId("previous").disabled=index===0;byId("next").disabled=index===data.scenes.length-1;byId("back").disabled=back.length===0;byId("play").textContent=playing?"Pause":"Play"}
byId("previous").onclick=()=>move(-1);byId("next").onclick=()=>move(1);byId("back").onclick=()=>{const entry=back.pop();if(entry)navigate(entry.id,entry.state,false)};
byId("play").onclick=()=>{if(time>=scene().durationMs)time=0;playing=!playing;last=performance.now();render()};
byId("state").onchange=event=>{state=event.target.value;render()};byId("timeline").oninput=event=>{playing=false;time=Number(event.target.value);render()};
function tick(now){if(playing){time=Math.min(scene().durationMs,time+Math.max(0,now-last));if(time>=scene().durationMs){if(scene().autoAdvance&&index<data.scenes.length-1)move(1);else playing=false}render()}last=now;requestAnimationFrame(tick)}
render();requestAnimationFrame(tick);
</script></body></html>`;
}
