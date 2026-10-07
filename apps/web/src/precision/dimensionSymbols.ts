type Vec2 = [number, number];

/** Two barbs with their tip at the measured point. Direction is a unit vector. */
export function dimensionArrowhead(tip: Vec2, direction: Vec2, symbolScale = 1): [Vec2, Vec2][] {
  const back: Vec2 = [-direction[0], -direction[1]];
  const cos = Math.cos(Math.PI / 9), sin = Math.sin(Math.PI / 9);
  const left: Vec2 = [back[0] * cos - back[1] * sin, back[0] * sin + back[1] * cos];
  const right: Vec2 = [back[0] * cos + back[1] * sin, -back[0] * sin + back[1] * cos];
  return [left, right].map(v => [tip, [tip[0] + v[0] * (3 * symbolScale), tip[1] + v[1] * (3 * symbolScale)]]);
}
