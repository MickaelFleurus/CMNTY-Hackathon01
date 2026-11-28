// Golem self-defense shock wave (docs/game-design-v2.md → "The golem
// awakening flow" → built-in knockback). Once the golem is awake it sends a
// circular shock wave every GOLEM_SHOCKWAVE.interval s that flings nearby
// enemies away, so a ring of enemies can't pin it down and kill it in
// seconds. It works whatever the shop picks (the active-offense "attack mode"
// is separate, in tower.js).
//
// The wave only fires when at least one enemy is within the radius; otherwise
// it stays charged and goes off as soon as one comes close.
//
// Contract (no imports between systems):
//   - reads the object tagged "base": base.awake (tower.js), base.solidRect()
//   - fires getTreeRoot().trigger("enemy-knockback", { x, y, radius, force,
//     damage }) → enemies.js pushes the enemies
//   - fires getTreeRoot().trigger("golem-shockwave", { x, y, radius }) for
//     anyone who wants to react (sound, screen shake…)
//   - stops on "run-over"; the ring is tagged "fx" (cleared by runstate.js)
import { GOLEM_SHOCKWAVE as CFG } from "../config.js";

export function startGolemShockwave() {
  let charge = CFG.interval; // s until the next wave can fire
  let over = false;
  getTreeRoot().on("run-over", () => (over = true));

  onUpdate(() => {
    if (over) return;
    const base = get("base")[0];
    if (!base?.awake || !base.solidRect || base.hp?.() <= 0) return;

    charge = Math.max(0, charge - dt());
    if (charge > 0) return;

    const r = base.solidRect();
    const at = vec2((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    if (!enemyWithin(at, CFG.radius)) return; // stay charged

    charge = CFG.interval;
    getTreeRoot().trigger("enemy-knockback", {
      x: at.x,
      y: at.y,
      radius: CFG.radius,
      force: CFG.force,
      damage: CFG.damage,
    });
    getTreeRoot().trigger("golem-shockwave", { x: at.x, y: at.y, radius: CFG.radius });
    ring(at, 0);
    ring(at, 0.08); // a second, thinner echo right behind the first
  });
}

function enemyWithin(at, radius) {
  const r2 = radius * radius;
  for (const e of get("enemy")) {
    const dx = e.pos.x - at.x;
    const dy = e.pos.y - at.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

/** Expanding, fading ring from the golem's center out to the wave radius. */
function ring(at, delay) {
  const [cr, cg, cb] = CFG.color;
  let t = -delay;
  const fx = add([
    pos(at),
    z(4), // over walkers (z 0), under the golem (z 5) and flying bats (z 7)
    "fx",
    {
      draw() {
        if (t < 0) return;
        const k = Math.min(1, t / CFG.ringTime);
        const ease = 1 - (1 - k) * (1 - k); // fast out, slows near the edge
        const radius = 30 + (CFG.radius - 30) * ease;
        const fade = 1 - k;
        // soft filled flash, strongest at the start
        drawCircle({ pos: vec2(0), radius, color: rgb(cr, cg, cb), opacity: 0.18 * fade * fade });
        // the wave front
        drawCircle({
          pos: vec2(0),
          radius,
          fill: false,
          outline: { width: (delay ? 3 : 7) * fade + 1, color: rgb(cr, cg, cb) },
          opacity: 0.9 * fade,
        });
      },
    },
  ]);
  fx.onUpdate(() => {
    t += dt();
    if (t >= CFG.ringTime) destroy(fx);
  });
}
