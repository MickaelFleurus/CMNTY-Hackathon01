// Minimap (docs/game-design-v2.md → "Minimap / compass"): a small map in the
// top-left corner, centered on the player, so you always know where the golem
// is and where the horde comes from.
//
//   - player     white dot in the middle, inside a faint frame = what the
//                screen shows right now
//   - golem      gold diamond; red and pulsing while it's losing HP. When it's
//                further than the map shows, the diamond sticks to the map's
//                edge in its direction, so the map doubles as a compass.
//   - enemies    small red dots, bosses bigger (dots outside the map are skipped)
//   - portal     violet dot (during the break, portal.js)
//   - bonus      yellow dot for a rare bonus drop on the ground (bonus.js)
//   - chests     brown squares, golem chests pulsing gold stars (chests.js);
//                stuck to the map edge when far. Hidden treasures never show.
//
// Hidden while the run is over. Tuning in MINIMAP (config.js).
//
// Contract (no imports between systems): reads objects tagged "player",
// "base" (base.solidRect(), base.awake, hp()), "enemy" (behavior "siege" =
// boss, dead), "portal", "bonus", "chest" (golemChest, opened). Listens "run-over".
import { MINIMAP as CFG } from "../config.js";

export function startMinimap() {
  let over = false;
  getTreeRoot().on("run-over", () => (over = true));

  // golem "under attack" = it lost HP in the last CFG.attackedFor s
  let lastHp = null;
  let sinceHit = Infinity;
  let clock = 0;
  onUpdate(() => {
    const d = dt();
    clock += d;
    sinceHit += d;
    const b = get("base")[0];
    if (!b?.hp || !b.awake) {
      lastHp = null;
      return;
    }
    const hp = b.hp();
    if (lastHp !== null && hp < lastHp - 1e-6) sinceHit = 0;
    lastHp = hp;
  });

  add([
    pos(0, 0),
    fixed(),
    z(905),
    {
      draw() {
        const p = get("player")[0];
        if (!p || over) return;
        const { x, y, size, range } = CFG;
        const half = size / 2;
        const c = vec2(x + half, y + half); // map center on screen = the player
        const k = half / range; // world px -> map px
        const toMap = (w) => c.add(w.sub(p.pos).scale(k));
        const inside = (m) => Math.abs(m.x - c.x) <= half - 3 && Math.abs(m.y - c.y) <= half - 3;

        // frame
        drawRect({ pos: vec2(x - 3, y - 3), width: size + 6, height: size + 6, radius: 10, color: rgb(20, 14, 28), opacity: 0.85 });
        drawRect({ pos: vec2(x, y), width: size, height: size, radius: 8, color: rgb(34, 52, 40), opacity: 0.85 });
        // what's on screen right now, as a faint frame around the player
        const vw = Math.min(size - 4, width() * k);
        const vh = Math.min(size - 4, height() * k);
        drawRect({ pos: c, width: vw, height: vh, anchor: "center", fill: false, outline: { width: 1, color: rgb(255, 255, 255) }, opacity: 0.25 });

        // enemies (cheap: one tiny rect each, skipped when off the map)
        for (const e of get("enemy")) {
          if (e.dead) continue;
          const m = toMap(e.pos);
          if (!inside(m)) continue;
          const boss = e.behavior === "siege";
          const s = boss ? 6 : 3;
          drawRect({ pos: m, width: s, height: s, anchor: "center", color: boss ? rgb(255, 90, 200) : rgb(235, 70, 60) });
        }

        // portal and bonus drops
        for (const o of get("portal")) {
          const m = toMap(o.pos);
          if (inside(m)) drawCircle({ pos: m, radius: 4, color: rgb(190, 140, 255) });
        }
        for (const o of get("bonus")) {
          const m = toMap(o.pos);
          if (inside(m)) drawCircle({ pos: m, radius: 3.5, color: rgb(255, 230, 90) });
        }

        // chests (chests.js): shown even when far, stuck to the edge like the
        // golem, so they work as a compass too. Hidden treasures never show.
        for (const o of get("chest")) {
          if (o.opened) continue;
          let m = toMap(o.pos);
          const far = !inside(m);
          if (far) m = clampToEdge(c, m, half - 6);
          if (o.golemChest) {
            const s = 6 + 1.5 * Math.sin(clock * 6);
            drawStar(m, s + 1.5, rgb(20, 14, 28));
            drawStar(m, s, rgb(255, 215, 120));
          } else {
            const s = far ? 6 : 7;
            drawRect({ pos: m, width: s + 2, height: s + 2, anchor: "center", color: rgb(20, 14, 28) });
            drawRect({ pos: m, width: s, height: s, anchor: "center", color: rgb(200, 140, 70) });
          }
        }

        // golem: gold diamond, clamped to the edge when far (compass)
        const b = get("base")[0];
        if (b) {
          const r = b.solidRect?.();
          const world = r ? vec2((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2) : b.pos;
          let m = toMap(world);
          const far = !inside(m);
          if (far) m = clampToEdge(c, m, half - 8);
          const attacked = b.awake && sinceHit < CFG.attackedFor;
          const pulse = attacked ? 0.5 + 0.5 * Math.sin(clock * Math.PI * 2 * CFG.pulseHz) : 0;
          const s = CFG.golemSize * (1 + 0.35 * pulse) * (far ? 0.85 : 1);
          const col = attacked ? rgb(255, 80 + 60 * (1 - pulse), 60) : rgb(255, 210, 90);
          drawDiamond(m, s + 2, rgb(20, 14, 28));
          drawDiamond(m, s, col);
        }

        // player
        drawCircle({ pos: c, radius: 4.5, color: rgb(20, 14, 28) });
        drawCircle({ pos: c, radius: 3.5, color: rgb(255, 255, 255) });
      },
    },
  ]);
}

/** Point on the map's square edge (inset by `half`) from the center toward m. */
function clampToEdge(c, m, half) {
  const d = m.sub(c);
  const t = half / Math.max(Math.abs(d.x), Math.abs(d.y), 1e-6);
  return c.add(d.scale(Math.min(1, t)));
}

function drawDiamond(at, s, col) {
  drawPolygon({ pts: [at.add(0, -s), at.add(s, 0), at.add(0, s), at.add(-s, 0)], color: col });
}

function drawStar(at, s, col) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? s : s * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(at.add(Math.cos(a) * r, Math.sin(a) * r));
  }
  drawPolygon({ pts, color: col });
}
