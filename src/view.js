// Convert a screen position into the unzoomed, orientation-correct pit.
export function toPitPoint(x, y, { vw, vh, w, h, angle }, zoom) {
  const th = angle * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
  const dx = x - vw / 2, dy = y - vh / 2;
  return [(dx * c - dy * s) / zoom + w / 2, (dx * s + dy * c) / zoom + h / 2];
}
