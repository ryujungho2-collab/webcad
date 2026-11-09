import type {CadCommand} from "@agent-webcad/cad-commands";

/** Purpose-built, dimensioned single-solid library sources, not bounding-box placeholders.
 * Door: three-sided frame + connected leaf; window: open frame + mullion;
 * sofa: seat, back, arms and plinth. Units are mm, source poses are normalized on capture.
 */
export function residentialContentCommands(): CadCommand[] {
  const commands: CadCommand[] = [];
  const box=(id:string,size:number[],at:number[])=>{
    commands.push({type:"create-box",id,width:size[0],depth:size[1],height:size[2]});
    commands.push({type:"move-object",objectId:id,translation:at as [number,number,number]});
  };
  const boolean=(operation:"cut"|"union",target:string,tool:string,id:string)=>commands.push({type:"boolean-operation",operation,target,tool,id});
  box("door-frame-stock",[890,140,2090],[12000,0,0]);
  box("door-frame-void",[790,160,2040],[12050,-10,0]);
  boolean("cut","door-frame-stock","door-frame-void","door-frame");
  box("door-leaf-stock",[800,40,2030],[12040,50,0]);
  boolean("union","door-frame","door-leaf-stock","source-door");
  box("window-frame-stock",[1490,140,1190],[14000,0,0]);
  box("window-frame-void",[1390,160,1090],[14050,-10,50]);
  boolean("cut","window-frame-stock","window-frame-void","window-frame");
  box("window-mullion",[50,140,1090],[14720,0,50]);
  boolean("union","window-frame","window-mullion","source-window");
  box("sofa-seat",[1800,800,200],[16000,0,250]);
  box("sofa-back",[1800,150,500],[16000,650,400]);
  boolean("union","sofa-seat","sofa-back","sofa-shell");
  box("sofa-arm-l",[120,800,300],[16000,0,400]);
  boolean("union","sofa-shell","sofa-arm-l","sofa-one-arm");
  box("sofa-arm-r",[120,800,300],[17680,0,400]);
  boolean("union","sofa-one-arm","sofa-arm-r","sofa-two-arms");
  box("sofa-plinth",[1500,600,260],[16150,100,0]);
  boolean("union","sofa-two-arms","sofa-plinth","source-sofa");
  for(const [objectId,name] of [["source-door","문틀·문짝 890"],["source-window","이중 개방 창틀 1490"],["source-sofa","2인 소파 1800"]])commands.push({type:"rename-object",objectId,name});
  return commands;
}

