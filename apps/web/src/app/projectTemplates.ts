import {deserializeDocument,serializeDocument,type CadDocument} from "@agent-webcad/cad-document";
export const PROJECT_TEMPLATES=[
  {id:"residential-plan",title:"Residential plan starter",description:"6 × 4 m outline and a partition · millimetres",tag:"Architecture · 2D"},
  {id:"mechanical-plate",title:"Mechanical plate starter",description:"120 × 80 mm plate outline with two circular holes",tag:"Mechanical · 2D"},
] as const;
/** First-party examples, created as detached documents; never dispatch into an open editor. */
export function projectTemplate(id:string):CadDocument{
  if(!PROJECT_TEMPLATES.some(t=>t.id===id))throw Error("Unknown project template.");
  const document:CadDocument={id:`template-${id}`,revision:0,objects:{},features:{},rootObjects:[],rootLayers:["layer-default"],layers:{"layer-default":{id:"layer-default",name:"Default",visible:true,locked:false,objectIds:[]}}};
  function drawing(key:string,name:string,kind:string,params:Record<string,unknown>){
    document.objects[key]={id:key,name,geometryId:`geometry-${key}`,layerId:"layer-default",visible:true};
    document.features[`feature-${key}`]={id:`feature-${key}`,type:"drawing",inputs:[],output:key,params:{kind,workPlane:"XY",...params}};
    document.rootObjects.push(key);document.layers["layer-default"].objectIds.push(key);
  }
  if(id==="residential-plan"){
    drawing("outline","Room outline · 6000 × 4000 mm","rectangle",{points:[[0,0,0],[6000,0,0],[6000,4000,0],[0,4000,0]],closed:true});
    drawing("partition","Partition reference · 2500 mm","line",{points:[[2500,0,0],[2500,2800,0]]});
  }else{
    drawing("outline","Plate outline · 120 × 80 mm","rectangle",{points:[[0,0,0],[120,0,0],[120,80,0],[0,80,0]],closed:true});
    drawing("hole-left","Left hole · Ø24 mm","circle",{center:[30,40,0],radius:12});drawing("hole-right","Right hole · Ø24 mm","circle",{center:[90,40,0],radius:12});
  }
  return deserializeDocument(serializeDocument(document));
}
