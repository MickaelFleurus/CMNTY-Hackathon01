// Guide arrow: during the break (the shop is available), if the golem and the
// portal home are both off-screen, an arrow at the screen edge points at the
// NEAREST of the two, so the player knows where to go.
//
//   - golem (shop): gold arrow + "SHOP" (same color as the shop circle)
//   - portal: violet arrow + "PORTAL"
//   - hidden as soon as that target is on screen (or outside the break, or
//     while the player is dead / frozen)
//
// Contract (no imports between systems):
//   - listens getTreeRoot().on("cycle-phase", { phase }) (cycle.js): only
//     shown while phase === "break"
//   - reads the objects tagged "player", "base" (base.solidRect(), tower.js)
//     and "portal" (portal.js)
import { GUIDE_ARROW as CFG } from "../config.js";

export function startGuideArrow() {
  let phase = "idle";
  getTreeRoot().on("cycle-phase", (e) => (phase = e?.phase ?? phase));

  let alpha = 0; // fades in / out
  let target = null; // { at: screen pos, kind: "shop" | "portal" }

  onUpdate(() => {
    target = pickTarget(phase);
    const goal = target ? 1 : 0;
    alpha += (goal - alpha) * Math.min(1, dt() * 8);
  });

  add([
    pos(0, 0),
    fixed(),
    z(950), // over the world and HUD, under the game-over / shop screens
    {
      draw() {
        if (!target || alpha < 0.02) return;
        drawArrow(target, alpha);
      },
    },
  ]);
}

/** Nearest destination (golem or portal) if it's off-screen, else null. */
function pickTarget(phase) {
  if (phase !== "break") return null;
  const player = get("player")[0];
  if (!player || player.down || player.frozen) return null;

  const options = [];
  const base = get("base")[0];
  const r = base?.solidRect?.();
  if (r) options.push({ world: vec2((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), kind: "shop" });
  const portal = get("portal")[0];
  if (portal) options.push({ world: portal.pos, kind: "portal" });
  if (!options.length) return null;

  let best = options[0];
  for (const o of options) if (o.world.dist(player.pos) < best.world.dist(player.pos)) best = o;

  const at = toScreen(best.world);
  const m = CFG.onScreenMargin;
  const visible = at.x > m && at.x < width() - m && at.y > m && at.y < height() - m;
  return visible ? null : { at, kind: best.kind };
}

/** Arrow at the screen edge, on the line from the screen center to the target. */
function drawArrow({ at, kind }, alpha) {
  const c = vec2(width() / 2, height() / 2);
  const dir = at.sub(c).unit();
  // where that line crosses the inset screen rectangle
  const m = CFG.edgeMargin;
  const hw = width() / 2 - m;
  const hh = height() / 2 - m;
  const t = Math.min(
    Math.abs(dir.x) > 1e-6 ? hw / Math.abs(dir.x) : Infinity,
    Math.abs(dir.y) > 1e-6 ? hh / Math.abs(dir.y) : Infinity,
  );
  const bob = Math.sin(time() * 6) * 5; // nudges toward the target
  const tip = c.add(dir.scale(t + bob));

  const [cr, cg, cb] = kind === "shop" ? CFG.shopColor : CFG.portalColor;
  const col = rgb(cr, cg, cb);
  const s = CFG.size;
  const side = vec2(-dir.y, dir.x);
  const back = tip.sub(dir.scale(s * 1.4));
  const pts = [tip, back.add(side.scale(s * 0.75)), back.sub(dir.scale(-s * 0.35)), back.sub(side.scale(s * 0.75))];

  // dark outline under the colored head, so it reads on grass and flowers
  drawPolygon({
    pts: pts.map((p) => p.add(dir.scale(2))),
    color: rgb(20, 14, 28),
    opacity: 0.6 * alpha,
  });
  drawPolygon({ pts, color: col, opacity: 0.95 * alpha });

  // label behind the arrow (toward the screen center), on a dark pill
  const label = kind === "shop" ? "SHOP" : "PORTAL";
  const w = label.length * CFG.labelSize * 0.62 + 14;
  const h = CFG.labelSize + 8;
  // far enough back that the pill never overlaps the head, whatever the angle
  const reach = s * 0.4 + Math.abs(dir.x) * (w / 2) + Math.abs(dir.y) * (h / 2) + 6;
  const labelAt = back.sub(dir.scale(reach));
  drawRect({
    pos: labelAt,
    width: w,
    height: h,
    anchor: "center",
    radius: h / 2,
    color: rgb(20, 14, 28),
    opacity: 0.7 * alpha,
  });
  drawText({
    text: label,
    size: CFG.labelSize,
    pos: labelAt,
    anchor: "center",
    color: col,
    opacity: alpha,
  });
}
