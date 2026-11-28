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
//
// Per-style skill tree (docs/game-design-v2.md → "Golem skill tree"): the
// shop tree UI (shop.js) sells this style's GOLEM_SKILLS.berserker nodes and
// fires "golem-skill-pick" { style, id, level, params }; each pick re-resolves
// the node's params (levelStat specs at the NODE's level) on top of the style
// pick's stats. Different nodes may override the same stat - the LAST pick
// wins. "berserker-lifesteal" adds Blood Feast: each swipe heals the golem
// lifesteal hp per enemy hit (we count the enemies the swipe reaches).
//
// Contract (no imports between systems):
//   - listens: getTreeRoot().on("golem-style-pick", { style: "berserker" })
//     (one pick per life, style can't change until you die); "wave-start"
//     { n } keeps the damage scaling with the wave; stops on "run-over" /
//     "golem-dying".
//   - listens: getTreeRoot().on("golem-skill-pick", { style, id, level,
//     params }) → applies only to this style's node ids (GOLEM_SKILLS.berserker)
//   - reads the object tagged "base": base.awake (tower.js), base.solidRect(),
//     and live enemies (tag "enemy": pos) for targeting.
//   - fires getTreeRoot().trigger("enemy-knockback", { x, y, radius, force,
//     damage }) → enemies.js damages + pushes the enemies (and fires
//     "damage-dealt" for the damage numbers).
//   - fx rings are tagged "fx" (cleared by runstate.js).
import { GOLEM_BERSERKER as CFG, GOLEM_SKILLS } from "../config.js";
import { resolveStats } from "../util/levelStat.js";

const STYLE = "berserker";

export function startGolemBerserker() {
  let picked = false;
  let over = false;
  let wave = 1;
  let swipeCharge = 0; // s until the next swipe
  let chargeCharge = 0; // s until the next charge strike
  let base = null; // stats resolved from the style pick
  let overrides = {}; // skill-pick stat overrides (last wins)
  /** @type {Record<string, any>} skill picks may add keys (lifesteal) */
  let stats = { ...CFG }; // { ...base, ...overrides } - the attack loop reads this
  let lifesteal = 0; // hp per enemy hit by a swipe (Blood Feast node)

  getTreeRoot().on("golem-style-pick", ({ style, level, params } = {}) => {
    if (style !== "berserker") return;
    picked = true;
    base = resolveStats(CFG, level ?? 1, params);
    overrides = {};
    stats = /** @type {Record<string, any>} */ ({ ...base, ...overrides });
  });
  getTreeRoot().on("golem-skill-pick", (pick) => {
    if (!picked || over || pick?.style !== STYLE) return;
    const node = (GOLEM_SKILLS[STYLE] ?? []).find((n) => n.id === pick?.id);
    if (!node) return;
    Object.assign(overrides, resolveStats(node.params, pick.level ?? 1));
    stats = /** @type {Record<string, any>} */ ({ ...base, ...overrides });
    if (pick.id === "berserker-lifesteal") {
      lifesteal = stats.lifesteal ?? 0;
    }
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

    if (swipeCharge <= 0 && anyEnemyNear(at, stats.swipeRadius)) {
      swipeCharge = stats.swipeInterval;
      const hits = enemiesIn(at, stats.swipeRadius);
      getTreeRoot().trigger("enemy-knockback", {
        x: at.x,
        y: at.y,
        radius: stats.swipeRadius,
        force: stats.swipeForce,
        damage: dmg(stats.swipeDamage),
      });
      ring(at, stats.swipeRadius, CFG.ringTime, stats.swipeColor);
      if (lifesteal > 0 && hits.length) healGolem(lifesteal * hits.length);
    }

    if (chargeCharge <= 0) {
      const target = nearestEnemy(at, stats.chargeRange);
      if (target) {
        chargeCharge = CFG.chargeInterval;
        const dir = target.pos.sub(at).unit();
        const hitAt = at.add(dir.scale(Math.min(at.dist(target.pos), stats.chargeReach)));
        getTreeRoot().trigger("enemy-knockback", {
          x: hitAt.x,
          y: hitAt.y,
          radius: stats.chargeRadius,
          force: stats.chargeForce,
          damage: dmg(stats.chargeDamage),
        });
        streak(at, hitAt, CFG.ringTime, stats.chargeColor);
        ring(hitAt, stats.chargeRadius, CFG.ringTime, stats.chargeColor);
      }
    }
  });

  /** Heal the golem n hp (capped at its max), with a small green +n. */
  function healGolem(n) {
    const golem = get("tower")[0];
    if (!golem?.exists?.() || golem.hp?.() === undefined) return;
    const amount = Math.min(n, golem.maxHP() - golem.hp());
    if (amount <= 0) return;
    golem.setHP(golem.hp() + amount);
    getTreeRoot().trigger("golem-lifesteal", { amount: Math.round(amount) });
  }
}

/** Live enemies within `radius` of `at` (skips hidden waiting bats). */
function enemiesIn(at, radius) {
  const r2 = radius * radius;
  return get("enemy").filter((e) => {
    if (e.dead || e.hidden) return false;
    const dx = e.pos.x - at.x;
    const dy = e.pos.y - at.y;
    return dx * dx + dy * dy <= r2;
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
