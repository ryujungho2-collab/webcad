const paths: Record<string, string> = {
  New: "M12 4v16M4 12h16", Open: "M3 19V6h7l2 3h9l-3 10H3Z M3 19l4-7h14",
  Save: "M4 3h13l3 3v15H4Z M8 3v6h8V3 M8 21v-8h8v8",
  Undo: "M8 5 3 10l5 5 M3 10h11a6 6 0 0 1 6 6v3",
  Redo: "m16 5 5 5-5 5 M21 10H10a6 6 0 0 0-6 6v3",
  Box: "m12 2 9 5v10l-9 5-9-5V7Z m-9 5 9 5 9-5 M12 12v10",
  Duplicate: "M8 8h13v13H8Z M16 8V3H3v13h5",
  Delete: "M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
  Move: "M12 2v20M2 12h20 m-13-7 3-3 3 3 m-6 14 3 3 3-3 M5 9l-3 3 3 3 m14-6 3 3-3 3",
  Rotate: "M20 10a8 8 0 1 0-1 8 M20 3v7h-7",
  Scale: "M3 14v7h7 M14 3h7v7 M3 21l7-7 M21 3l-7 7",
  Fit: "M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M8 8h8v8H8Z",
  Selection: "M3 8V3h5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M12 8v8 M8 12h8",
  Grid: "M3 3h18v18H3Z M3 9h18 M3 15h18 M9 3v18 M15 3v18",
  Hide: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M3 3l18 18",
  Isolate: "M3 8V3h5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M12 8l4 4-4 4-4-4Z",
  "Show All": "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0",
};

export function ToolIcon({ name, fallback }: { name: string; fallback: string }) {
  const path = paths[name];
  return path ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg> : <>{fallback}</>;
}
