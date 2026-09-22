export type ScreenPoint = { x: number; y: number };
export type SelectionRect = { left: number; right: number; top: number; bottom: number };
export type SelectionDirection = "window" | "crossing";

const EPSILON = 1e-7;

function inside(point: ScreenPoint, rect: SelectionRect) {
  return point.x >= rect.left - EPSILON && point.x <= rect.right + EPSILON
    && point.y >= rect.top - EPSILON && point.y <= rect.bottom + EPSILON;
}

function orientation(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: ScreenPoint, b: ScreenPoint, point: ScreenPoint) {
  return Math.min(a.x, b.x) - EPSILON <= point.x && point.x <= Math.max(a.x, b.x) + EPSILON
    && Math.min(a.y, b.y) - EPSILON <= point.y && point.y <= Math.max(a.y, b.y) + EPSILON;
}

function segmentsIntersect(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, d: ScreenPoint) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return (Math.abs(abC) <= EPSILON && onSegment(a, b, c))
    || (Math.abs(abD) <= EPSILON && onSegment(a, b, d))
    || (Math.abs(cdA) <= EPSILON && onSegment(c, d, a))
    || (Math.abs(cdB) <= EPSILON && onSegment(c, d, b));
}

function intersectsRect(a: ScreenPoint, b: ScreenPoint, rect: SelectionRect) {
  if (inside(a, rect) || inside(b, rect)) return true;
  const corners: ScreenPoint[] = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
  return corners.some((corner, index) => segmentsIntersect(a, b, corner, corners[(index + 1) % corners.length]));
}

/**
 * CAD window semantics for projected drawing geometry. `closed` is used for
 * rectangles/circles; arcs and open polylines retain only their authored path.
 */
export function matchesSelectionWindow(
  points: readonly ScreenPoint[],
  rect: SelectionRect,
  direction: SelectionDirection,
  closed = false,
) {
  if (points.length === 0) return false;
  if (direction === "window") return points.every((point) => inside(point, rect));
  if (points.some((point) => inside(point, rect))) return true;
  if (points.length < 2) return false;
  for (let index = 1; index < points.length; index += 1) {
    if (intersectsRect(points[index - 1], points[index], rect)) return true;
  }
  return closed && intersectsRect(points[points.length - 1], points[0], rect);
}
