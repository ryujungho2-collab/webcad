/**
 * The 120 AutoCAD shortcut items of docs/verification/AUTOCAD-SHORTCUT-COVERAGE-2026-11-05.md,
 * each pointing at capability records. Verdicts are copied from that document (the test
 * re-parses the table and compares every row); they describe parity with the AutoCAD input,
 * which is a different question from a capability's own `support`.
 */
import type { AutocadShortcutMapping, ShortcutVerdict } from "./types";

const S: ShortcutVerdict = "same-input", D: ShortcutVerdict = "different-input", P: ShortcutVerdict = "partial", U: ShortcutVerdict = "unconfirmed";
const m = (no: number, autocadInput: string, verdict: ShortcutVerdict, capabilityIds: string[], note?: string): AutocadShortcutMapping =>
  note ? { no, autocadInput, verdict, capabilityIds, note } : { no, autocadInput, verdict, capabilityIds };

export const AUTOCAD_SHORTCUT_MAPPINGS: readonly AutocadShortcutMapping[] = Object.freeze([
  m(1, "L", S, ["draw-2d-curve"]), m(2, "PL", D, ["draw-2d-curve"]), m(3, "C", S, ["draw-2d-curve"]), m(4, "REC", D, ["draw-2d-curve"]),
  m(5, "TR", D, ["trim"]), m(6, "EX", D, ["extend"]), m(7, "F", D, ["curve-corner"], "F key is Fit view"), m(8, "O", S, ["offset"]),
  m(9, "M", S, ["move"]), m(10, "CO / CP", D, ["copy-by-points"]), m(11, "H", D, ["hatch"], "H key is Hide"), m(12, "SC", D, ["scale"]),

  m(13, "MI", D, ["pattern"]), m(14, "E", D, ["delete"], "E key is Extrude"), m(15, "U / Ctrl+Z", S, ["undo"], "U alias not routed"), m(16, "Ctrl+Y", S, ["redo"]),
  m(17, "Esc", S, ["cancel-tool"]), m(18, "Delete", S, ["delete"]), m(19, "Shift+클릭", S, ["selection"]), m(20, "왼쪽→오른쪽", S, ["selection"]),
  m(21, "오른쪽→왼쪽", S, ["selection"]), m(22, "Enter / Space", S, ["repeat-command"]), m(23, "더블클릭", U, ["double-click-edit"]), m(24, "RO", D, ["rotate"]),

  m(25, "DLI", D, ["dimension-annotation"]), m(26, "DAL", D, ["dimension-annotation"]), m(27, "DCO", P, ["continuous-dimension"]), m(28, "DBA", U, ["baseline-dimension"]),
  m(29, "DRA", D, ["dimension-annotation"]), m(30, "DDI", D, ["diameter-dimension"]), m(31, "DAN", D, ["angular-dimension"]), m(32, "D", P, ["dimension-edit"], "no named dimension-style manager"),
  m(33, "DIM", P, ["dimension-annotation", "diameter-dimension", "angular-dimension"]), m(34, "T / MT", P, ["text"]), m(35, "DT", D, ["text"]), m(36, "TEXTEDIT", D, ["text", "dimension-edit"]),

  m(37, "LA", D, ["layer-management"]), m(38, "MA", U, ["match-properties"]), m(39, "Z → Enter → E → Enter", D, ["view-navigation"]), m(40, "P", D, ["view-navigation"], "P key is Polyline"),
  m(41, "휠 회전", D, ["view-navigation"]), m(42, "휠 버튼 드래그", S, ["view-navigation"]), m(43, "Ctrl+0", P, ["panel-visibility"]), m(44, "Ctrl+9", U, ["command-line-toggle"]),
  m(45, "Ctrl+2", P, ["library-browse"]), m(46, "RE", U, ["regen"]), m(47, "Ctrl+Tab", D, ["project-tabs"]), m(48, "3DO", D, ["view-navigation"]),

  m(49, "B", D, ["block-define"]), m(50, "I", D, ["block-insert"], "I key is Measure"), m(51, "W", U, ["write-block-file"]), m(52, "X", D, ["explode"], "X key is Trim"),
  m(53, "AR", P, ["pattern"]), m(54, "Ctrl+Shift+C", P, ["base-point-clipboard"]), m(55, "Ctrl+V", P, ["base-point-clipboard"]), m(56, "Ctrl+Shift+V", U, ["paste-as-block"]),
  m(57, "PASTEORIG", P, ["base-point-clipboard"]), m(58, "Ctrl+S", P, ["save-local"]), m(59, "Ctrl+Shift+S", P, ["download-file"]), m(60, "XR", P, ["dxf-reference-import"]),

  m(61, "DI", D, ["measure-distance"]), m(62, "AA", P, ["inspect-properties"]), m(63, "LI", D, ["inspect-properties"]), m(64, "ID", P, ["point-coordinate"]),
  m(65, "PR / Ctrl+1", D, ["inspect-properties", "panel-visibility"]), m(66, "CAL", P, ["variables-expressions"]), m(67, "Ctrl+8", U, ["quick-calculator"]), m(68, "OS", D, ["snap-settings"]),
  m(69, "F3", S, ["snap-settings"]), m(70, "F8", S, ["ortho-toggle"]), m(71, "F10 / F11", P, ["tracking-dynamic-input"]), m(72, "F12", P, ["tracking-dynamic-input"]),

  m(73, "A", S, ["draw-2d-curve"]), m(74, "POL", D, ["regular-polygon"]), m(75, "EL", D, ["ellipse"]), m(76, "XL", D, ["construction-line"]),
  m(77, "SPL", D, ["spline"]), m(78, "BO", P, ["make-face"]), m(79, "S", D, ["stretch"], "S key is Scale"), m(80, "CHA", D, ["curve-corner"]),
  m(81, "J", D, ["join"]), m(82, "PE", D, ["edit-polyline"]), m(83, "BR", D, ["break-contour"]), m(84, "LEN", D, ["lengthen"]),

  m(85, "AL", P, ["arrange-align"]), m(86, "OVERKILL", P, ["duplicate-boundary-diagnosis"]), m(87, "DRAWORDER", P, ["image-draw-order"]), m(88, "HATCHEDIT", D, ["hatch"]),
  m(89, "HATCHTOBACK", U, ["general-draw-order"]), m(90, "ST", U, ["text-style"]), m(91, "MLEADER", P, ["model-note"]), m(92, "MLEADERSTYLE", U, ["leader-style"]),
  m(93, "DIMEDIT", D, ["dimension-edit"]), m(94, "DIMSPACE", U, ["dimension-spacing"]), m(95, "DIMBREAK", U, ["dimension-break"]), m(96, "DIMCENTER", U, ["center-mark"]),

  m(97, "LAYISO", U, ["layer-isolate"]), m(98, "LAYUNISO", U, ["layer-isolate"]), m(99, "LAYOFF", D, ["layer-management"]), m(100, "LAYON", P, ["layer-management"]),
  m(101, "LAYFRZ", U, ["layer-freeze"]), m(102, "LAYTHW", U, ["layer-freeze"]), m(103, "LAYMCUR", P, ["active-layer"]), m(104, "LAYCUR", D, ["move-to-layer"]),
  m(105, "BEDIT", P, ["block-update"]), m(106, "BCLOSE", U, ["block-editor-session"]), m(107, "ATTEDIT", U, ["block-attributes"]), m(108, "ATTSYNC", U, ["block-attributes"]),

  m(109, "PU", P, ["purge"]), m(110, "AUDIT", U, ["document-audit"]), m(111, "RECOVER", U, ["recover-file"]), m(112, "UNITS", P, ["units"]),
  m(113, "UCS", P, ["ucs"]), m(114, "PLAN", D, ["ucs-look-at"]), m(115, "ISOLATEOBJECTS", D, ["isolate-selection"]), m(116, "UNISOLATEOBJECTS", D, ["isolate-selection"]),
  m(117, "Ctrl+P", D, ["plot-pdf"]), m(118, "PAGESETUP", P, ["plot-pdf"]), m(119, "PREVIEW", P, ["plot-pdf"]), m(120, "EXPORTPDF", D, ["plot-pdf"]),
]);
