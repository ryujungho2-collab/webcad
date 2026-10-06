import { CadEngine } from "../runtime/CadEngine";

/** Same T * R(XYZ) * S convention as the viewport. Caller owns the returned shape. */
export async function transformShape(shape: any, value: { translation?: number[]; rotation?: number[]; scale?: number[] }) {
  const translation = value.translation ?? [0, 0, 0], rotation = value.rotation ?? [0, 0, 0], scale = value.scale ?? [1, 1, 1];
  if (![translation, rotation, scale].every(v => v.length === 3 && v.every(Number.isFinite)) || scale.some(v => v === 0)) throw new Error("Invalid solid transform.");
  if (translation.every(v => v === 0) && rotation.every(v => v === 0) && scale.every(v => v === 1)) return shape;
  const [x,y,z] = rotation.map(v => v * Math.PI / 180);
  const a=Math.cos(x), b=Math.sin(x), c=Math.cos(y), d=Math.sin(y), e=Math.cos(z), f=Math.sin(z);
  const rows = [[c*e,-c*f,d], [a*f+b*d*e,a*e-b*d*f,-b*c], [b*f-a*d*e,b*e+a*d*f,a*c]];
  const {oc: instance} = await CadEngine.create();
  const oc = instance as unknown as Record<string, any>;
  const uniform=scale.every(v=>Math.abs(v-scale[0])<=1e-12);
  const transform = uniform?new oc.gp_Trsf_1():new oc.gp_GTrsf_1();
  let operation: any;
  try {
    if(uniform){
      transform.SetValues(...rows.flatMap((row,index)=>[...row.map(v=>v*scale[0]),translation[index]]));
      operation=new oc.BRepBuilderAPI_Transform_2(shape,transform,true);
    }else{
      for(let row=0;row<3;row++) {
        for(let column=0;column<3;column++) transform.SetValue(row+1,column+1,rows[row][column]*scale[column]);
        transform.SetValue(row+1,4,translation[row]);
      }
      transform.SetForm();
      operation=new oc.BRepBuilderAPI_GTransform_2(shape,transform,true);
    }
    if(!operation.IsDone()) throw new Error("Solid transform failed.");
    return operation.Shape();
  } finally { operation?.delete(); transform.delete(); }
}

export async function translate(
  shape: any,
  x: number,
  y: number,
  z: number
): Promise<any> {
  const engine = await CadEngine.create();
  const oc = engine.oc;

  const trsf = new oc.gp_Trsf_1();

  const vec = new oc.gp_Vec_4(x, y, z);
  trsf.SetTranslation_1(vec);

  const op = new oc.BRepBuilderAPI_Transform_2(
    shape,
    trsf,
    true
  );

  op.Build(new oc.Message_ProgressRange_1());

  if (!op.IsDone()) {
    throw new Error("Translation failed");
  }

  return op.Shape();
}

export async function rotate(
  shape: any,
  axis: [number, number, number],
  angle: number
): Promise<any> {
  const engine = await CadEngine.create();
  const oc = engine.oc;

  const trsf = new oc.gp_Trsf_1();

  const origin = new oc.gp_Pnt_3(0, 0, 0);
  const direction = new oc.gp_Dir_4(
    axis[0],
    axis[1],
    axis[2]
  );

  const rotationAxis = new oc.gp_Ax1_2(
    origin,
    direction
  );

  trsf.SetRotation_1(rotationAxis, angle);

  const op = new oc.BRepBuilderAPI_Transform_2(
    shape,
    trsf,
    true
  );

  op.Build(new oc.Message_ProgressRange_1());

  if (!op.IsDone()) {
    throw new Error("Rotation failed");
  }

  return op.Shape();
}
