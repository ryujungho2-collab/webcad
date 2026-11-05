import {createMeshCube,createPolygonMesh,meshTriangles,type EditableMesh} from "@agent-webcad/cad-document";
export function trianglePrism(width=10,depth=10,height=10):EditableMesh{const mesh=createMeshCube(10);mesh.vertices.forEach(v=>v.position=[v.position[0]*width/10,v.position[1]*depth/10,v.position[2]*height/10]);return mesh;}
export function squareTube():EditableMesh{
 const points=[[0,0],[10,0],[10,10],[0,10],[3,3],[7,3],[7,7],[3,7]],vertices=[...points.map(p=>[...p,0]),...points.map(p=>[...p,5])].map((p,i)=>({id:`v${i}`,position:p as [number,number,number]})),faces:{id:string;vertices:string[]}[]=[];
 const face=(ids:number[])=>faces.push({id:`f${faces.length}`,vertices:ids.map(i=>`v${i}`)});
 for(let i=0;i<4;i++){const j=(i+1)%4;face([i,4+i,4+j,j]);face([8+i,8+j,12+j,12+i]);face([i,j,8+j,8+i]);face([4+i,12+i,12+j,4+j]);}
 return {version:2,vertices,faces,edit:{enabled:false,mode:"face",ids:[]}};
}
export function triangulateFixture(mesh:EditableMesh):EditableMesh{return {version:2,vertices:structuredClone(mesh.vertices),faces:meshTriangles(mesh).map((t,i)=>({id:`t${i}`,vertices:t.vertices})),edit:{enabled:false,mode:"face",ids:[]}};}

export function noisyReconstructionCube():EditableMesh{
 const mesh=createPolygonMesh(10),top=mesh.faces.find(f=>f.vertices.every(id=>mesh.vertices.find(v=>v.id===id)!.position[2]===10))!;mesh.faces=mesh.faces.filter(f=>f!==top);mesh.vertices.push({id:"noise",position:[.00001,.00001,10.000001]});top.vertices.forEach((id,i)=>mesh.faces.push({id:"noise"+i,vertices:[id,top.vertices[(i+1)%4],"noise"]}));return mesh;
}
