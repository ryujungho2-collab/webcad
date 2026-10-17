/** Displayed shortcuts describe implemented routing, not future reservations. */
export const COMMAND_SHORTCUTS: Record<string, string> = {
  "object-select": "V", "direct-select": "F2",
  "draw-line": "L", "draw-polyline": "P", "draw-rectangle": "R", "draw-circle": "C", "draw-arc": "A", "add-text": "T",
  "points-move": "M / G", "points-copy": "Shift+C", "points-rotate": "Shift+R",
  translate: "M / G", rotate: "Shift+R", scale: "S", offset: "O", trim: "X", extend: "Shift+X",
  measure: "I", extrude: "E", hide: "H", "fit-context": "F",
  "view-top": "1", "view-front": "2", "view-right": "3", "view-isometric": "0", projection: "5",
  snap: "F3", ortho: "F8", redo: "Ctrl+Y / Ctrl+Shift+Z",
};

export const NAVIGATION_SHORTCUTS = [
  { id: "wheel-pan", label: "Move view vertically · 화면 상하 이동", shortcut: "Wheel", description: "Scroll the wheel. Trackpad horizontal scrolling also moves the view sideways.", keywords: "위 아래 상하 세로 스크롤 이동 휠 pan scroll" },
  { id: "wheel-horizontal", label: "Move view horizontally · 화면 좌우 이동", shortcut: "Shift+Wheel", description: "Hold Shift and scroll the wheel.", keywords: "좌우 가로 이동 휠 pan scroll" },
  { id: "wheel-zoom", label: "Zoom at cursor · 마우스 중심 확대·축소", shortcut: "Ctrl+Wheel", description: "Hold Ctrl (Cmd on Mac) and scroll. The point under the cursor stays fixed.", keywords: "확대 축소 줌 마우스 포커스 zoom cursor" },
  { id: "wheel-rotate", label: "Rotate view · 화면 회전", shortcut: "Alt+Wheel", description: "Rotate the 2D screen or orbit the 3D model. Object geometry stays unchanged.", keywords: "화면 회전 뷰 rotate orbit" },
  { id: "middle-pan", label: "Drag to pan · 화면 이동", shortcut: "Middle drag", description: "Drag with the middle mouse button.", keywords: "화면 이동 휠 버튼 드래그 pan" },
  { id: "middle-orbit", label: "Orbit in 3D · 3D 자유 회전", shortcut: "Shift+Middle drag", description: "Hold Shift and drag the middle mouse button in the 3D workspace.", keywords: "입체 3d 자유 회전 orbit" },
  { id: "tab-context", label: "Next field or grip · 다음 입력·편집점", shortcut: "Tab / Shift+Tab", description: "Move focus forward/back. In drawing tools, switch precision inputs or release a lock; in Direct mode, Tab enters the grips.", keywords: "탭 tab 포커스 정점 편집점 입력 길이 각도" },
  { id: "tab-browser", label: "Next / previous browser tab · 브라우저 탭 전환", shortcut: "Ctrl+Tab / Ctrl+Shift+Tab", description: "Reserved for the browser. The app currently edits one document and does not override document tab switching.", keywords: "컨트롤 탭 문서 브라우저 전환 tab document browser" },
  { id: "repeat-command", label: "Repeat last command · 마지막 명령 반복", shortcut: "Enter / Space", description: "Repeat from an idle canvas. During a tool, Enter confirms input; Space currently repeats and is not a hand-tool shortcut.", keywords: "반복 명령 재실행 엔터 스페이스 repeat" },
  { id: "cancel-tool", label: "Cancel / exit · 취소·종료", shortcut: "Esc", description: "Clear current input, step back, or exit the tool. The behavior follows the active operation.", keywords: "취소 종료 탈출 escape" },
  { id: "command-search", label: "Search commands and shortcuts · 기능·단축키 검색", shortcut: "Ctrl+K", description: "Open this command palette from the canvas. Use the Shortcuts view for keyboard and mouse controls.", keywords: "기능 명령 단축키 도움말 검색 help shortcuts" },
];
