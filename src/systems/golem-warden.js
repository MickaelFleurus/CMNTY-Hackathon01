// Warden golem style (docs/game-design-v2.md → "The golem awakening flow"
// → pick 1 of 3 golem styles). The crowd-control identity: a slow-field aura
// around the golem holds the horde at bay (enemies.js applies "aura"
// enemySlow, the strongest wins), plus a periodic pulse that briefly slows
// enemies inside the field much harder - the warden's "hold the line" beat.
//
// Same aura mechanism as the guardian (golem-guardian.js): an object tagged
// "aura" with { radius, enemySlow, color }, read by enemies.js every frame.
// The pulse adds a second, stronger aura object only while it holds, so the
// two multiply through the strongest-wins logic without touching enemies.js.
//
// Per-style skill tree (docs/game-design-v2.md → "Golem skill tree"): the
// shop tree UI (shop.js) sells this style's GOLEM_SKILLS.warden nodes and
// fires "golem-skill-pick" { style, id, level, params }; each pick re-resolves
// the node's params (levelStat specs at the NODE's level) on top of the style
// pick's stats and updates the live field + pulse. Different nodes may
// override the same stat - the LAST pick wins.
//
// Contract (no imports between systems):
//   - listens to getTreeRoot().on("golem-style-pick", { style, level?, params? })
//     → applies only to style "warden"; the UI side fires it (one pick per
//     life - the style can't change until you die)
//   - listens to getTreeRoot().on("golem-skill-pick", { style, id, level, params })
//     → applies only to this style's node ids (GOLEM_SKILLS.warden)
//   - centers on the object tagged "base" (does nothing until one exists)
//   - aura objects are tagged "aura" with { radius, enemySlow, color }
//     → enemies.js slows enemies inside (the strongest aura wins)
//   - the pulse fires every pulseInterval s while an enemy is inside the
//     field; fx rings are tagged "fx" (cleared by runstate.js)
//   - stops on "run-over" / "golem-dying"
import { GOLEM_WARDEN as CFG, GOLEM_SKILLS } from "../config.js";
import { resolveStats } from "../util/levelStat.js";

const STYLE = "warden";

export function startGolemWarden() {
  let over = false;
  let pulseCharge = 0; // s until the next pulse
  let pulse = null; // the stronger pulse aura, while it holds
  let pulseLeft = 0; // s of pulse remaining
  let base = null; // stats resolved from the style pick
  let overrides = {}; // skill-pick stat overrides (last wins)
  /** @type {Record<string, any>} skill picks retune stats live */
  let stats = { ...CFG };
  let field = null; // the standing aura object, once created

  getTreeRoot().on("run-over", () => (over = true));
  getTreeRoot().on("golem-dying", () => (over = true));

  getTreeRoot().on("golem-style-pick", (pick) => {
    if (over || pick?.style !== STYLE) return;
    base = resolveStats(CFG, pick.level ?? 1, pick.params);
    overrides = {};
    stats = /** @type {Record<string, any>} */ ({ ...base, ...overrides });
    field = makeField();
    startPulse();
  });

  getTreeRoot().on("golem-skill-pick", (pick) => {
    if (over || pick?.style !== STYLE) return;
    const node = (GOLEM_SKILLS[STYLE] ?? []).find((n) => n.id === pick?.id);
    if (!node) return;
    Object.assign(overrides, resolveStats(node.params, pick.level ?? 1));
    stats = /** @type {Record<string, any>} */ ({ ...base, ...overrides });
    if (field) Object.assign(field, { radius: stats.radius, enemySlow: stats.enemySlow, color: stats.color });
    if (pulse) Object.assign(pulse, { radius: stats.radius, enemySlow: CFG.pulseSlow, color: stats.color });
  });

  // The standing slow field around the golem (gray-green: it holds, it
  // doesn't hurt).
  function makeField() {
    const field = add([
      pos(0, 0),
      z(-5), // same layer as the other auras (auras.js, golem-guardian.js)
      "aura",
      { radius: stats.radius, enemySlow: stats.enemySlow, color: stats.color },
    ]);
    field.onUpdate(() => {
      const base = get("base")[0];
      if (!base || over) return field.destroy();
      field.pos = base.pos.clone();
    });
    field.onDraw(() => {
      const c = rgb(stats.color[0], stats.color[1], stats.color[2]);
      const pulseIn = 0.5 + 0.5 * Math.sin(time() * 2);
      drawCircle({ radius: stats.radius, color: c, opacity: 0.1 + 0.04 * pulseIn });
      drawCircle({
        radius: stats.radius,
        fill: false,
        outline: { width: 2, color: c, opacity: 0.5 },
      });
    });
  }

  // Periodic hard-slow pulse: every pulseInterval s with an enemy inside the
  // field, drop a second aura (pulseSlow) on top for pulseDuration s and
  // play an expanding ring.
  function startPulse() {
    pulseCharge = stats.pulseInterval;

    onUpdate(() => {
      if (over) return;
      const base = get("base")[0];
      if (!base?.exists()) return;

      if (pulse) {
        pulseLeft -= dt();
        if (pulseLeft <= 0) {
          pulse.destroy();
          pulse = null;
        }
      }

      pulseCharge -= dt();
      if (pulseCharge > 0) return;
      if (!enemyInside(base.pos, stats.radius)) return; // nothing to hold: no charge spent
      pulseCharge = stats.pulseInterval;
      pulseLeft = stats.pulseDuration;
      if (!pulse) {
        pulse = add([
          pos(base.pos.clone()),
          z(-5),
          "aura",
          { radius: stats.radius, enemySlow: CFG.pulseSlow, color: stats.color },
        ]);
      } else {
        pulse.pos = base.pos.clone();
      }
      ring(base.pos, stats.radius, stats.ringTime, stats.pulseColor);
    });

    // the pulse aura follows the golem too (repositioned on each fire above)
    onUpdate(() => {
      if (pulse && !over) {
        const base = get("base")[0];
        if (base) pulse.pos = base.pos.clone();
      }
    });
  }

  function enemyInside(at, radius) {
    return get("enemy").some(
      (e) => !e.dead && e.pos.sdist(at) <= radius * radius,
    );
  }
}

/** Expanding ring, same look as golem-shockwave / golem-berserker fx. */
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
    if (t >= ringTime) fx.destroy();
  });
}
