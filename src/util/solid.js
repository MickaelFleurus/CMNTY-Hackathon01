// Solid rectangles (the golem base): keep a circular body out of a rect.
// Shared by enemies.js (enemies) and tower.js (player).

/** Distance from (x, y) to rect r (0 inside), plus the closest point. */
export function rectDistance(x, y, r) {
  const cx = Math.max(r.x0, Math.min(x, r.x1));
  const cy = Math.max(r.y0, Math.min(y, r.y1));
  return { d: Math.hypot(x - cx, y - cy), cx, cy };
}

/** Push obj (a circle of `radius` around obj.pos) out of rect r, in place. */
export function pushOutOfRect(obj, r, radius) {
  const { x, y } = obj.pos;
  // fast reject: clearly outside the rect expanded by the body
  if (x < r.x0 - radius || x > r.x1 + radius || y < r.y0 - radius || y > r.y1 + radius) return;
  if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) {
    // center inside: exit through the nearest edge, body just touching it
    const left = x - r.x0;
    const right = r.x1 - x;
    const top = y - r.y0;
    const bottom = r.y1 - y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) obj.pos.x = r.x0 - radius;
    else if (m === right) obj.pos.x = r.x1 + radius;
    else if (m === top) obj.pos.y = r.y0 - radius;
    else obj.pos.y = r.y1 + radius;
    return;
  }
  const { d, cx, cy } = rectDistance(x, y, r);
  if (d >= radius || d === 0) return;
  const k = radius / d; // push along the normal from the closest point
  obj.pos.x = cx + (x - cx) * k;
  obj.pos.y = cy + (y - cy) * k;
}
