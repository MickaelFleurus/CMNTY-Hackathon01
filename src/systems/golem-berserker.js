// Berserker golem style (docs/game-design-v2.md → "The golem awakening
// flow" → offense-centered: "fights mobs itself - swipes, charges, kills
// for you"). Listens for the "golem-style-pick" root event; until it fires
// with { style: "berserker" } this system does nothing. The built-in
// self-defense shock wave (golem-shockwave.js) keeps running for every
// style - the berserker adds real damage on top.
//
// Two attacks, both going through the enemies.js knockback contract (so
// hurt(), damage numbers and knockbackResist all come along for free):
//   - SWIPE: every swipeInterval s, an AOE strike centered on the golem
//     that damages and flings every enemy in radius (a damaging version of
//     the shock wave). Only fires when an enemy is actually in reach.
//   - CHARGE: every chargeInterval s, a lunge strike at the nearest enemy
//     up to chargeRange px away - the knockback lands at the strike point
//     (not the golem), so distant packs get hit too. Also skipped until a
//     target is in range, and the cooldown only starts then.
// Lifesteal (docs: "the more enemies it damages/kills, the more HP …
// regain") is parked for the golem skill tree, not built here.
//
// Contract (no imports between systems):
//   - listens: getTreeRoot().on("golem-style-pick", { style: "berserker" })
//     (one pick per life, style can't change until you die); "wave-start"
//     { n } keeps the damage scaling with the wave; stops on "run-over" /
//     "golem-dying".
//   - reads the object tagged "base": base.awake (tower.js), base.solidRect(),
//     and live enemies (tag "enemy": pos) for targeting.
//   - fires getTreeRoot().trigger("enemy-knockback", { x, y, radius, force,
//     damage }) → enemies.js damages + pushes the enemies (and fires
//     "damage-dealt" for the damage numbers).
//   - fx rings are tagged "fx" (cleared by runstate.js).
import { GOLEM_BERSERKER as CFG } from "../config.js";

export function startGolemBerserker() {
  let picked = false;
  let over = false;
  let wave = 1;
  let swipeCharge = 0; // s until the next swipe
  let chargeCharge = 0; // s until the next charge strike

  getTreeRoot().on("golem-style-pick", ({ style } = {}) => {
    if (style === "berserker") picked = true;
  });
  getTreeRoot().on("wave-start", (n) => (wave = n ?? wave));
  getTreeRoot().on("run-over", () => (over = true));
  getTreeRoot().on("golem-dying", () => (over = true));

  onUpdate(() => {
    if (over || !picked) return;
    const base = get("base")[0];
    if (!base?.awake || !base.solidRect || base.hp?.() <= 0) return;

    swipeCharge = Math.max(0, swipeCharge - dt());
    chargeCharge = Math.max(0, chargeCharge - dt());
    const r = base.solidRect();
    const at = vec2((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    const dmg = (d) => Math.round(d * (1 + CFG.damageGrowth * (wave - 1)));

    if (swipeCharge <= 0 && anyEnemyNear(at, CFG.swipeRadius)) {
      swipeCharge = CFG.swipeInterval;
      getTreeRoot().trigger("enemy-knockback", {
        x: at.x,
        y: at.y,
        radius: CFG.swipeRadius,
        force: CFG.swipeForce,
        damage: dmg(CFG.swipeDamage),
      });
      ring(at, CFG.swipeRadius, CFG.ringTime, CFG.swipeColor);
    }

    if (chargeCharge <= 0) {
      const target = nearestEnemy(at, CFG.chargeRange);
      if (target) {
        chargeCharge = CFG.chargeInterval;
        const dir = target.pos.sub(at).unit();
        const hitAt = at.add(dir.scale(Math.min(at.dist(target.pos), CFG.chargeReach)));
        getTreeRoot().trigger("enemy-knockback", {
          x: hitAt.x,
          y: hitAt.y,
          radius: CFG.chargeRadius,
          force: CFG.chargeForce,
          damage: dmg(CFG.chargeDamage),
        });
        streak(at, hitAt, CFG.ringTime, CFG.chargeColor);
        ring(hitAt, CFG.chargeRadius, CFG.ringTime, CFG.chargeColor);
      }
    }
  });
}

/** Is any live enemy within `radius` of `at`? (skips hidden waiting bats) */
function anyEnemyNear(at, radius) {
  const r2 = radius * radius;
  return get("enemy").some((e) => {
    const dx = e.pos.x - at.x;
    const dy = e.pos.y - at.y;
    return !e.dead && !e.hidden && dx * dx + dy * dy <= r2;
  });
}

/** Nearest live enemy within `range` of `at`, or null. */
function nearestEnemy(at, range) {
  let best = null;
  let bestD2 = range * range;
  for (const e of get("enemy")) {
    if (e.dead || e.hidden) continue;
    const dx = e.pos.x - at.x;
    const dy = e.pos.y - at.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      best = e;
      bestD2 = d2;
    }
  }
  return best;
}

/** Expanding, fading ring from `at` out to `radius` (like golem-shockwave). */
function ring(at, radius, ringTime, color) {
  const [cr, cg, cb] = color;
  let t = 0;
  const fx = add([
    pos(at),
    z(4), // over walkers (z 0), under the golem (z 5) and flying bats (z 7)
    "fx",
    {
      draw() {
        const k = Math.min(1, t / ringTime);
        const ease = 1 - (1 - k) * (1 - k); // fast out, slows near the edge
        const rad = 30 + (radius - 30) * ease;
        const fade = 1 - k;
        drawCircle({ pos: vec2(0), radius: rad, color: rgb(cr, cg, cb), opacity: 0.18 * fade * fade });
        drawCircle({
          pos: vec2(0),
          radius: rad,
          fill: false,
          outline: { width: 7 * fade + 1, color: rgb(cr, cg, cb) },
          opacity: 0.9 * fade,
        });
      },
    },
  ]);
  fx.onUpdate(() => {
    t += dt();
    if (t >= ringTime) destroy(fx);
  });
}

/** Fading line from the golem to the charge strike point. */
function streak(from, to, ringTime, color) {
  const [cr, cg, cb] = color;
  let t = 0;
  const fx = add([
    pos(from),
    z(4),
    "fx",
    {
      draw() {
        const fade = 1 - Math.min(1, t / ringTime);
        drawLine({
          p1: vec2(0),
          p2: to.sub(from),
          width: 10 * fade + 1,
          color: rgb(cr, cg, cb),
          opacity: 0.7 * fade,
        });
      },
    },
  ]);
  fx.onUpdate(() => {
    t += dt();
    if (t >= ringTime) destroy(fx);
  });
}
