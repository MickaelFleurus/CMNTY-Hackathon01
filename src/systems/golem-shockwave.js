// Golem self-defense shock wave (docs/game-design-v2.md → "The golem
// awakening flow" → built-in knockback). Once the golem is awake it sends a
// circular shock wave (at most every GOLEM_SHOCKWAVE.cooldown s) that flings nearby
// enemies away, so a ring of enemies can't pin it down and kill it in
// seconds. It works whatever the shop picks (the active-offense "attack mode"
// is separate, in tower.js).
//
// When it fires (enemies "in contact" = touching the golem's body, the same
// reach enemies.js uses for contact damage):
//   - idle: nothing until at least GOLEM_SHOCKWAVE.minContact (3) enemies
//     are in contact → it fires and turns active;
//   - active: each time the `cooldown` is over it checks again: at least one enemy still in
//     contact → fires again; none → back to idle (needs minContact again).
//   The check is made when the wave is ready, not in between: right after a
//   wave the push itself clears the contact for a moment.
//
// Contract (no imports between systems):
//   - reads the object tagged "base": base.awake (tower.js), base.solidRect(),
//     and live enemies (tag "enemy": pos, bodyRadius) for the contact count
//   - fires getTreeRoot().trigger("enemy-knockback", { x, y, radius, force,
//     damage }) → enemies.js pushes the enemies
//   - fires getTreeRoot().trigger("golem-shockwave", { x, y, radius }) for
//     anyone who wants to react (sound, screen shake…)
//   - stops on "run-over"; the ring is tagged "fx" (cleared by runstate.js)
import { GOLEM_SHOCKWAVE as CFG, ENEMY } from "../config.js";
import { rectDistance } from "../util/solid.js";

export function startGolemShockwave() {
  let charge = 0; // s until the next wave can fire
  let active = false; // swarmed: keeps firing while anything is in contact
  let over = false;
  getTreeRoot().on("run-over", () => (over = true));
  getTreeRoot().on("golem-dying", () => (over = true));

  onUpdate(() => {
    if (over) return;
    const base = get("base")[0];
    if (!base?.awake || !base.solidRect || base.hp?.() <= 0) return;

    charge = Math.max(0, charge - dt());
    if (charge > 0) return;

    const r = base.solidRect();
    const touching = contactCount(r);
    if (touching < (active ? 1 : CFG.minContact)) {
      active = false; // nobody left on it (or not swarmed yet): wait, charged
      return;
    }

    active = true;
    charge = CFG.cooldown;
    const at = vec2((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
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

/** Enemies touching the golem's body (enemies.js contact-damage reach). */
function contactCount(rect) {
  let n = 0;
  for (const e of get("enemy")) {
    const reach = (e.bodyRadius ?? 16) + ENEMY.towerContactSlack;
    if (rectDistance(e.pos.x, e.pos.y, rect).d <= reach) n += 1;
  }
  return n;
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
