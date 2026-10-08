import type { AppShellProps } from "../app/AppShell";
import { interactionTools, interactionToolReason } from "./interactionTools";
import { cadDocument } from "../state/cadDocument";

export type PaletteCommand = {
  id: string;
  label: string;
  category: string;
  keywords: string;
  shortcut?: string;
  disabledReason?: string;
  run: () => void;
};

export function searchPaletteCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return commands.filter((command) => {
    const text = `${command.label} ${command.category} ${command.keywords}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** UI actions share the shell's callbacks and capability gates. Geometry
 * mutations continue through dispatchCadCommand, including its Undo boundary. */
export function createPaletteCommands(
  props: AppShellProps,
  panels: { toggleExplorer: () => void; toggleProperties: () => void },
): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  function add(id: string, label: string, category: string, keywords: string, run: () => void, disabledReason?: string, shortcut?: string) {
    commands.push({ id, label, category, keywords, run, disabledReason, shortcut });
  }
  const createReason = !props.canCreateBox ? "Unlock the active layer first." : undefined;
  const solidReason = props.activeSketchId ? "Finish the active sketch first." : createReason;
  const transformReason = !props.canTransform ? "Select editable objects." : undefined;
  const trimReason = !props.canTrim ? "Select one editable drawing boundary. Sketch geometry requires Edit Sketch." : undefined;
  const viewReason = props.workspaceMode === "2d" ? "Switch to the 3D workspace first." : undefined;
  const sketchOwner = Object.values(cadDocument.features).find(f=>props.selectedObjectIds.includes(f.output)&&f.params.sketchId)?.params.sketchId;
  for(const tool of interactionTools) {
    const run = () => { if(tool.id === "curve-workflow") props.onCurveWorkflow?.(); else if(tool.id === "edit-sketch" && sketchOwner) props.onEditSketch?.(String(sketchOwner)); else if(tool.id === "construction") props.onConstruction?.(); else if(tool.id === "angular-dimension") props.onAngularDimension?.(); else if(tool.id.startsWith("pattern-")) props.onPattern?.(tool.id.slice(8) as "linear"|"radial"|"mirror"); };
    const reason = interactionToolReason(tool.id,cadDocument,props.selectedObjectIds,props.activeSketchId,props.selectedLayerId);
    add(tool.id,tool.label,"Workflow",`${tool.hint} 관계 재연결 스케치 작도 패턴`,run,reason);
  }

  add("new", "New document", "File", "새 문서", props.onNew, undefined, "Ctrl N");
  add("open", "Open document…", "File", "열기 파일", props.onOpen, undefined, "Ctrl O");
  add("save", "Save document", "File", "저장", props.onSave, undefined, "Ctrl S");
  add("save-as", "Save document as…", "File", "다른 이름 저장 내보내기 json", props.onSaveAs, undefined, "Ctrl Shift S");
  add("export-stl", "Export visible solids (.stl)", "File", "내보내기 stl 3d 프린트 3d print", () => props.onExportStl?.());
  add("export-step", "Export visible solids (.step)", "File", "내보내기 step 스텝 외주 가공 제조", () => props.onExportStep?.());
  add("export-svg", "Export active plane drawings (.svg)", "File", "내보내기 svg 도면 2d 벡터 drawing", () => props.onExportSvg?.());
  add("export-dxf", "Export drawings (.dxf)", "File", "내보내기 dxf 도면 캐드 호환", () => props.onExportDxf?.());
  add("import-dxf", "Import drawings (.dxf)", "File", "가져오기 불러오기 dxf 캐드 호환", () => props.onImportDxf?.());
  add("plot", "Plot active plane to PDF", "File", "플롯 출력 인쇄 pdf 축척 도면", () => props.onPlot?.());
  add("dimension", "Dimension selection", "Annotate", "치수 dimension 측정", () => props.onDimension?.(), props.canDimension ? undefined : "Select a line or circle to dimension.");
  add("undo", "Undo", "Edit", "실행 취소 되돌리기", props.onUndo, props.canUndo ? undefined : "No operation to undo.", "Ctrl Z");
  add("redo", "Redo", "Edit", "다시 실행", props.onRedo, props.canRedo ? undefined : "No operation to redo.", "Ctrl Y");
  add("duplicate", "Duplicate selection", "Edit", "복제 복사", props.onDuplicate, props.canDuplicate ? undefined : "Select editable objects. Sketch geometry requires Edit Sketch.", "Ctrl D");
  add("delete", "Delete selection", "Edit", "삭제 지우기", props.onDelete, props.canDelete ? undefined : "Select editable objects.", "Delete");

  add("object-select", "Object selection", "Selection", "객체 선택", () => props.onDirectSelectMode(false));
  add("direct-select", "Direct selection", "Selection", "직접 선택 정점 모서리 면 vertex edge face", () => props.onDirectSelectMode(true), undefined, "F2");
  add("sketch", props.activeSketchId ? "Finish sketch" : "Create sketch", "Sketch", "스케치 시작 종료", () => props.onToggleSketch?.(), !props.onToggleSketch ? "Sketch editing unavailable." : props.activeSketchId ? undefined : createReason);
  for (const [tool, label, keywords, shortcut] of [
    ["line", "Line", "선 직선", "L"], ["polyline", "Polyline", "폴리선 연속선", "P"],
    ["rectangle", "Rectangle", "사각형", "R"], ["circle", "Circle", "원", "C"], ["arc", "Arc", "호", "A"],
  ] as const) add(`draw-${tool}`, `Draw ${label.toLowerCase()}`, "Draw", keywords, () => props.onDrawingTool(tool), createReason, shortcut || undefined);

  add("box", "Create box", "Model", "박스 상자 직육면체", props.onCreateBox, solidReason);
  for (const [primitive, keywords] of [["cylinder", "원기둥"], ["sphere", "구"], ["cone", "원뿔"], ["torus", "도넛 토러스"]] as const)
    add(primitive, `Create ${primitive}`, "Model", keywords, () => props.onCreatePrimitive(primitive), solidReason);
  add("extrude", "Extrude profile · 10 mm", "Model", "돌출 단면", props.onExtrude, props.activeSketchId ? "Finish the active sketch first." : !props.canExtrude ? "Select a supported closed profile." : undefined, "E");
  add("sweep", "Sweep profile along path", "Model", "스윕 경로 돌출 파이프", () => props.onSweep?.(), props.activeSketchId ? "Finish the active sketch first." : props.canSweep ? undefined : "Select one closed profile plus one open path.");
  add("loft", "Loft profiles", "Model", "로프트 단면 연결", () => props.onLoft?.(), props.activeSketchId ? "Finish the active sketch first." : props.canLoft ? undefined : "Select two or more closed profiles.");
  const buildReason = props.activeSketchId ? "Finish the active sketch first." : props.canBuild ? undefined : "Select one closed straight-edge loop on XY.";
  add("build-house", "Generate house from plan", "Build", "주택 집 짓기 건축", () => props.onBuildHouse?.(), buildReason);
  add("build-apartment", "Generate apartment block from plan", "Build", "아파트 건축 빌딩", () => props.onBuildApartment?.(), buildReason);
  add("revolve", "Revolve profile · 360°", "Model", "회전 솔리드 단면", props.onRevolve, props.activeSketchId ? "Finish the active sketch first." : !props.canRevolve ? "Select a supported closed profile." : undefined);
  for (const [mode, label, keywords] of [["translate", "Move", "이동"], ["rotate", "Rotate", "회전"], ["scale", "Scale", "크기 배율 축척"]] as const)
    add(mode, `${label} selection`, "Modify", keywords, () => props.onTransformMode(mode), transformReason);
  if (props.workspaceMode === "2d") for (const [mode, label, shortcut] of [["move", "Move by points", "M / G"], ["copy", "Copy by points", "Shift C"], ["rotate", "Rotate about point", "Shift R"]] as const)
    add(`points-${mode}`, label, "Modify", "기준점 대상점 중심 정밀 이동 복사 회전", () => props.onPointTransform?.(mode), transformReason ?? (!props.onPointTransform ? "Point commands unavailable." : undefined), shortcut);
  add("offset", "Offset drawing", "Modify", "옵셋 오프셋 간격 평행 복사", props.onOffset, trimReason, "O");
  for (const [mode, label, keywords] of [["trim", "Trim drawing", "자르기 트림"], ["extend", "Extend drawing", "연장 늘리기"]] as const)
    add(mode, label, "Modify", keywords, () => props.onLineEditTool?.(mode), trimReason ?? (!props.onLineEditTool ? "Drawing edits unavailable." : undefined));
  for (const [mode, label, keywords] of [
    ["left", "Align left", "왼쪽 정렬"], ["center-x", "Align horizontal centers", "가로 중심 정렬"], ["right", "Align right", "오른쪽 정렬"],
    ["top", "Align top", "위 정렬"], ["center-y", "Align vertical centers", "세로 중심 정렬"], ["bottom", "Align bottom", "아래 정렬"],
  ] as const) add(`align-${mode}`, label, "Arrange", keywords, () => props.onAlign?.(mode), props.canArrange && props.onAlign ? undefined : "Select at least two editable standalone objects.");
  for (const [axis, keywords] of [["horizontal", "가로 간격 분배"], ["vertical", "세로 간격 분배"]] as const)
    add(`distribute-${axis}`, `Distribute ${axis}`, "Arrange", keywords, () => props.onDistribute?.(axis), props.canDistribute && props.onDistribute ? undefined : "Select at least three editable standalone objects.");

  add("measure", "Measure distance", "Inspect", "측정 거리 길이", props.onMeasurementTool, undefined, "I");
  add("variables", "Document variables and expressions", "Inspect", "변수 수식 파라미터 parameter binding",()=>props.onChangeActivity("variables"));
  add("fit-all", "Fit all geometry", "View", "전체 보기 맞춤", () => props.onViewAction("fit-all"));
  add("fit-selection", "Fit selection", "View", "선택 보기 맞춤", () => props.onViewAction("fit-selection"), props.selectedObjectIds.length ? undefined : "Select objects to frame.");
  for (const [action, keywords] of [["top", "위 평면도"], ["front", "앞 정면도"], ["right", "오른쪽 측면도"], ["isometric", "등각 투상"]] as const)
    add(`view-${action}`, `${action[0].toUpperCase() + action.slice(1)} view`, "View", keywords, () => props.onViewAction(action), viewReason);
  for (const mode of ["2d", "3d"] as const)
    add(`workspace-${mode}`, `${mode.toUpperCase()} workspace`, "View", mode === "2d" ? "도면 작업공간" : "입체 모델 작업공간", () => props.onWorkspaceMode(mode));
  add("projection", "Toggle perspective / orthographic", "View", "원근 직교 투영", props.onToggleProjection, viewReason);
  add("hide", "Hide selection", "View", "숨기기", props.onHide, props.selectedObjectId ? undefined : "Select objects to hide.");
  add("isolate", props.isolationActive ? "Exit isolation" : "Isolate selection", "View", "격리 선택만 보기", props.onIsolate, props.selectedObjectId || props.isolationActive ? undefined : "Select objects to isolate.");
  add("show-all", "Show all objects", "View", "모두 표시 숨김 해제", props.onShowAll);
  add("grid", "Toggle grid", "Precision", "격자 그리드", props.onToggleGrid);
  add("snap", "Toggle object snap", "Precision", "스냅", props.onToggleSnap, undefined, "F3");
  add("ortho", "Toggle ortho", "Precision", "직교 수평 수직", props.onToggleOrtho, undefined, "F8");
  add("work-plane", "Cycle work plane · XY / XZ / YZ", "Precision", "작업 평면", props.onCycleWorkPlane, props.activeSketchId ? "Finish the active sketch before changing its plane." : undefined);
  add("explorer", "Toggle Explorer panel", "Panels", "탐색기 모델 트리 패널", panels.toggleExplorer);
  add("properties", "Toggle Properties panel", "Panels", "속성 인스펙터 패널", panels.toggleProperties);
  for (const [mode, label, keywords] of [["join", "Join contours", "결합 연결 다중선 호"], ["explode", "Explode contours", "분해 해체 다중선 사각형"], ["break", "Break contour", "분할 끊기 개구부 구간 제거"]] as const)
    add(`contour-${mode}`, label, "Modify", keywords, () => props.onContour?.(mode), props.canContour?.[mode] && props.onContour ? undefined : mode === "join" ? "Select at least two standalone open drawing curves." : mode === "explode" ? "Select standalone polylines or rectangles." : "Select one standalone drawing curve.");
  for (const [mode, label, keywords] of [["polyline", "Edit polyline", "pedit 정점 추가 삭제 열기 닫기 다중선"], ["lengthen", "Lengthen", "len 길이 전체 증감 비율 끝점"], ["stretch", "Stretch", "str 늘이기 교차 영역 끝점 정점 이동"]] as const)
    add(`contour-${mode}`, label, "Modify", keywords, () => props.onContour?.(mode), props.canContour?.[mode] && props.onContour ? undefined : mode === "polyline" ? "Select one standalone polyline or rectangle." : mode === "lengthen" ? "Select one open standalone line, arc or polyline." : "Select standalone drawings on one work plane.");
  return commands;
}
