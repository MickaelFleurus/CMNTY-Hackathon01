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

/** Does the segment (ax,ay)→(bx,by) pass through rect r? (Liang–Barsky) */
export function segmentHitsRect(ax, ay, bx, by, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const clip = (p, q) => {
    if (p === 0) return q >= 0; // parallel: inside this slab?
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, ax - r.x0) && clip(dx, r.x1 - ax) &&
    clip(-dy, ay - r.y0) && clip(dy, r.y1 - ay) && t0 < t1
  );
}

/** p, or the nearest point on r's border if p is inside r. */
function outsideOf(p, r) {
  if (p.x <= r.x0 || p.x >= r.x1 || p.y <= r.y0 || p.y >= r.y1) return p;
  const m = Math.min(p.x - r.x0, r.x1 - p.x, p.y - r.y0, r.y1 - p.y);
  if (m === p.x - r.x0) return { x: r.x0, y: p.y };
  if (m === r.x1 - p.x) return { x: r.x1, y: p.y };
  if (m === p.y - r.y0) return { x: p.x, y: r.y0 };
  return { x: p.x, y: r.y1 };
}

const grow = (r, d) => ({ x0: r.x0 - d, y0: r.y0 - d, x1: r.x1 + d, y1: r.y1 + d });

/**
 * Steering around a solid rect: if the straight line from `from` to `to`
 * crosses r (for a body of `radius`), return the next waypoint (a corner of r,
 * padded by the body) on the shortest path around it, else null (go straight).
 *
 * Shortest path on a tiny graph: from, to, and r's 4 padded corners. Corners
 * are linked along r's edges; `from`/`to` link to any corner (or each other)
 * they can see without crossing r. Dijkstra over 6 nodes.
 */
export function detourAround(from, to, r, radius) {
  const block = grow(r, radius - 1); // the body touching r still counts as clear
  const clear = (a, b) => !segmentHitsRect(a.x, a.y, b.x, b.y, block);
  // A destination inside the blocked area (e.g. the player hugging the golem
  // with a smaller body) can't be reached: aim for the nearest point just
  // outside it instead.
  to = outsideOf(to, grow(r, radius + 1));
  if (clear(from, to)) return null;

  const c = grow(r, radius + 3);
  // 0 TL, 1 TR, 2 BR, 3 BL (perimeter order), 4 from, 5 to
  const nodes = [
    { x: c.x0, y: c.y0 }, { x: c.x1, y: c.y0 }, { x: c.x1, y: c.y1 }, { x: c.x0, y: c.y1 },
    from, to,
  ];
  const d = (i, j) => Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
  const edges = (i) => {
    const out = [];
    if (i < 4) out.push((i + 1) % 4, (i + 3) % 4); // along the rect's edges
    for (const j of [0, 1, 2, 3, 4, 5]) {
      if (j === i || (i < 4 && j < 4)) continue;
      if (clear(nodes[i], nodes[j])) out.push(j);
    }
    return out;
  };

  const dist = [Infinity, Infinity, Infinity, Infinity, 0, Infinity];
  const prev = [-1, -1, -1, -1, -1, -1];
  const done = new Set();
  while (done.size < 6) {
    let u = -1;
    for (let i = 0; i < 6; i++) if (!done.has(i) && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done.add(u);
    if (u === 5) break;
    for (const v of edges(u)) {
      const alt = dist[u] + d(u, v);
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }
  if (prev[5] < 0) return null; // no path (shouldn't happen): go straight

  // first waypoint on the path that we haven't reached yet
  const path = [];
  for (let v = 5; v !== 4; v = prev[v]) path.unshift(v);
  for (const v of path) if (v === 5 || d(4, v) > 4) return v === 5 ? null : nodes[v];
  return null;
}
