import { CadEngine } from "../runtime/CadEngine";

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