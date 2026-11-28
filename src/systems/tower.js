// The base IS the tower (docs/game-design-v2.md): the "base" object gets HP
// and the "tower" tag, enemies attack it once it's awake, and when it's
// destroyed the run is over. The golem auto-attacks only as the Berserker
// style (style identity, docs/game-design-v2.md); the active-offense shop
// branch upgrades that shot (each pick also repairs it).
//
// Golem awakening (docs/game-design-v2.md → "The golem awakening flow"): the
// base starts as an inert statue during wave 1. It is still solid, but
// enemies ignore it (no targeting, no contact damage), it has no HP bar and
// it doesn't shoot. It wakes up at the end of wave 1 (the first "wave-end").
// Statue look: grey (desaturated) and not animated, until its power is picked:
// the style pick screen (golem-styles.js) fires "golem-style-pick" right after
// it woke. Then its colours sweep up from its feet and its idle animation starts.
//
// Golem FX: one shader (GOLEM_FX) draws the statue grey, the rainbow swipe
// at the end of each wave ("golem-swipe" from cycle.js) and the grey/colour
// sweeps (power-on: up; death: down, the reverse).
//
// Death sequence: HP 0 → "golem-dying" (enemies pouf, the wave stops, the
// player freezes) → TOWER.deathDelay s → colour drains top to bottom
// (TOWER.powerDownTime) → "run-over" → game-over screen.
//
// Contract (no imports between systems):
//   - attaches to the object tagged "base" (base.js) once it exists: adds
//     health() + the "tower" tag → enemies.js targets it and hits it on contact
//   - base.solidRect() → { x0, y0, x1, y1 }: the golem's visible body in world
//     px (TOWER.body). Solid for enemies (enemies.js) and the player (here).
//   - listens to getTreeRoot().on("shop-pick", { quadrant: "active-offense", level, params })
//     (upgrades the Berserker's shot; never creates a shot for other styles)
//   - shots are "projectile"s with { damage } → enemies.js applies the hit
//   - base.awake: false while it's the wave-1 statue, true once awake.
//     enemies.js only targets / damages a tower with awake === true.
//   - on waking: getTreeRoot().trigger("golem-awake") (fired once, on the
//     first "wave-end"). respawn.js listens: until then, player death = run over.
//   - powered (look only): on "golem-style-pick" (fired once per life by
//     golem-styles.js right after waking), colour sweeps up the statue
//     (TOWER.powerOnTime), the idle anim starts, then
//     getTreeRoot().trigger("golem-powered") fires (once). base.powered = true.
//   - listens "golem-swipe" { duration }: rainbow band sweeps up the sprite.
//   - wave repair: on "wave-end", the golem heals TOWER.waveEndRepair (10%)
//     of its max HP (capped at max HP), with a green
//     "+N" above it, and fires getTreeRoot().trigger("golem-repaired", { amount }).
//   - on destruction: getTreeRoot().trigger("golem-dying") at once (untagged
//     "tower"), then after the death sequence
//     getTreeRoot().trigger("run-over", { reason: "tower-destroyed" }) (fired
//     once). Once the golem is awake, this is the run's ONLY lose condition.
import boltUrl from "../../gfx/SurvivorsStarterKit_v1.0/Weapons/Projectiles/Proj_Magic_Bolt.png";
import { TOWER } from "../config.js";
import { levelStat, resolveStats } from "../util/levelStat.js";
import { pushOutOfRect } from "../util/solid.js";

const QUADRANT = "active-offense";
const BOLT = "tower-bolt";
const GOLEM_FX = "golem-fx";

// v = 0 at the top of the current frame, 1 at its bottom (from the frame's
// uv rect in the atlas). Pixels above u_line get u_above greyness, below it
// u_below (grey keeps the art's brightness, so outline + shading survive).
// A rainbow band of half-width u_band rides on the line when u_rainbow > 0.
const GOLEM_FRAG = `
uniform float u_qy;
uniform float u_qh;
uniform float u_line;
uniform float u_above;
uniform float u_below;
uniform float u_rainbow;
uniform float u_band;
uniform float u_time;
vec3 hue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}
vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
  vec4 c = def_frag();
  float v = (uv.y - u_qy) / u_qh;
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 rgb = mix(c.rgb, vec3(l), v < u_line ? u_above : u_below);
  float band = u_rainbow * (1.0 - smoothstep(0.0, u_band, abs(v - u_line)));
  vec3 rb = hue(fract(v * 1.5 - u_time * 1.2)) * (0.6 + 0.7 * l);
  return vec4(mix(rgb, rb, band * 0.85), c.a);
}
`;

export function loadTowerSprites() {
  loadSprite(BOLT, boltUrl, {
    sliceX: 4,
    anims: { fly: { from: 0, to: 3, loop: true, speed: 12 } },
  });
  loadShader(GOLEM_FX, null, GOLEM_FRAG);
}

export function startTower() {
  let tower = null; // the base, once armed
  let picks = 0; // active-offense pick level (0 = doesn't shoot)
  let params = {};
  let shot = null; // shooting stats, null until picked
  let cooldown = 0;
  let over = false;
  let awake = false; // wave 1: inert statue
  let powered = false; // statue look (grey, still) until its power is picked
  // running golem FX: { kind: "rainbow" | "power-on" | "power-down", t, duration, done }
  let fx = null;
  const playFx = (kind, duration, done) => (fx = { kind, t: 0, duration, done });

  const maxHpFor = (p) => Math.round(levelStat(params.hp ?? TOWER.hp, p + 1));

  getTreeRoot().on("shop-pick", (pick) => {
    if (pick?.quadrant !== QUADRANT) return;
    picks = pick.level ?? picks + 1;
    params = pick.params ?? {};
    shot = resolveStats(TOWER, picks, params);
    if (tower) {
      tower.setMaxHP(maxHpFor(picks));
      tower.setHP(tower.maxHP()); // level-up repairs it
    }
  });

  // Style identity gate (docs/game-design-v2.md: the golem fights for you
  // ONLY as the Berserker style - the generic active-offense branch upgrades
  // that shot; it must not create one from nothing for other styles).
  let style = null; // "guardian" | "berserker" | "warden" | null (statue)
  getTreeRoot().on("golem-style-pick", ({ style: s } = {}) => (style = s));
  getTreeRoot().on("run-over", () => (style = null));

  // Wave repair: when a wave ends, give back TOWER.waveEndRepair of the
  // golem's max HP (only what's missing, never above max).
  getTreeRoot().on("wave-end", () => {
    if (over || !tower?.exists()) return;
    const amount = Math.min(
      Math.round(tower.maxHP() * TOWER.waveEndRepair),
      Math.floor(tower.maxHP() - tower.hp()),
    );
    if (amount <= 0) return;
    tower.setHP(tower.hp() + amount);
    repairText(tower, amount);
    getTreeRoot().trigger("golem-repaired", { amount });
  });

  // The golem wakes up when wave 1 ends (cleared or timed out). A run-over
  // stops waves, so this can't fire after the run has ended.
  getTreeRoot().on("wave-end", () => {
    if (awake || over) return;
    awake = true;
    if (tower) tower.awake = true;
    getTreeRoot().trigger("golem-awake");
  });

  // Power picked: the style pick screen (golem-styles.js) fires
  // "golem-style-pick" right after waking; the shop-close path is gone.
  let powering = false;
  getTreeRoot().on("golem-style-pick", () => {
    if (!awake || powered || powering || over || !tower?.exists()) return;
    powering = true;
    tower.animSpeed = TOWER.idleAnimSpeed; // slow, heavy idle
    playFx("power-on", TOWER.powerOnTime, () => {
      powered = true;
      tower.powered = true;
      getTreeRoot().trigger("golem-powered");
    });
  });

  // Wave end flourish (cycle.js): a rainbow band sweeps up the golem.
  getTreeRoot().on("golem-swipe", ({ duration } = {}) => {
    if (over || !tower?.exists()) return;
    playFx("rainbow", duration ?? 0.8);
  });

  /** Shader uniforms for the current look + running FX (read every frame). */
  function fxUniforms() {
    const statue = TOWER.statueGrey;
    const g = powered ? 0 : statue;
    let line = -1, above = g, below = g, rainbow = 0;
    if (fx) {
      const k = Math.min(1, fx.t / fx.duration);
      const bw = TOWER.swipeBand;
      const travel = 1 + 2 * bw; // start and end fully off the sprite
      rainbow = 1;
      if (fx.kind === "power-down") {
        line = -bw + travel * k; // top → bottom: grey above the line
        above = statue;
        below = 0;
      } else {
        line = 1 + bw - travel * k; // bottom → top
        if (fx.kind === "power-on") {
          above = statue; // not reached yet: still grey
          below = 0;
        }
      }
    }
    const q = tower ? frameQuad(tower) : { y: 0, h: 1 };
    return {
      u_qy: q.y, u_qh: q.h, u_line: line, u_above: above, u_below: below,
      u_rainbow: rainbow, u_band: TOWER.swipeBand, u_time: time(),
    };
  }

  onUpdate(() => {
    if (!tower) {
      const base = get("base")[0];
      if (base) tower = arm(base);
      return;
    }
    if (!tower.exists()) return;

    if (fx) {
      fx.t += dt();
      if (fx.t >= fx.duration) {
        const done = fx.done;
        fx = null;
        done?.();
      }
    }

    // the player can't walk through the golem (it stays solid after the fall)
    const player = get("player")[0];
    if (player) pushOutOfRect(player, tower.solidRect(), TOWER.playerRadius);

    if (over || !awake) return; // the statue doesn't shoot

    cooldown -= dt();
    // The golem auto-attacks only as a Berserker (style identity); other
    // styles never gain a shot, no matter how many shot picks were bought.
    if (!shot || style !== "berserker" || cooldown > 0) return;
    const from = center(tower);
    const target = nearestEnemy(from, shot.range);
    if (!target) return;
    cooldown = shot.fireInterval;
    shoot(from, target.pos, shot);
  });

  function arm(base) {
    const hp = maxHpFor(picks);
    base.use(health(hp, hp));
    // golem FX shader (statue grey, swipes); frozen on its first idle frame
    // until powered
    base.powered = powered;
    base.use(shader(GOLEM_FX, fxUniforms));
    if (!powered) {
      base.animSpeed = 0;
      base.frame = 0;
    } else {
      base.animSpeed = TOWER.idleAnimSpeed;
    }
    base.solidRect = () => solidRect(base);
    base.awake = awake;
    if (!base.has("color")) base.use(color(255, 255, 255)); // for the hurt flash
    base.tag("tower");

    // Drain flash: the golem's HP drains smoothly while enemies touch it
    // (enemies.js). Measure the actual loss rate (smoothed HP/s) and pulse a
    // faint red tint, faster the faster it drains (TOWER.drainFlash).
    let lastHp = base.hp();
    let rate = 0; // smoothed HP lost per second
    let phase = 0; // pulse cycles done (fraction = where in the pulse); 0 = idle
    let hz = 0; // current pulse speed (kept while a last pulse fades out)
    base.onUpdate(() => {
      if (over || dt() === 0) return;
      const lost = Math.max(0, lastHp - base.hp()); // repairs / level-ups don't count
      lastHp = base.hp();
      rate += (lost / dt() - rate) * (1 - Math.exp(-6 * dt()));
      const f = TOWER.drainFlash;
      const draining = rate >= 0.3;
      if (draining) hz = Math.min(f.maxHz, f.minHz + f.hzPerHp * rate);
      else if (phase === 0) {
        base.color = rgb(255, 255, 255); // idle
        return;
      }
      const before = phase;
      phase += dt() * hz;
      // drain over: let the current pulse fade all the way out, then stop
      if (!draining && Math.floor(phase) > Math.floor(before)) {
        phase = 0;
        base.color = rgb(255, 255, 255);
        return;
      }
      const pulse = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2); // 0 → 1 → 0
      const cut = Math.round(f.strength * pulse);
      base.color = rgb(255, 255 - cut, 255 - cut);
    });

    // Death sequence: enemies pouf + everything stops ("golem-dying"), a
    // silence, then the colour drains top to bottom (the reverse of the
    // power-on), then the run is over.
    base.onDeath(() => {
      if (over) return;
      over = true;
      base.color = rgb(255, 255, 255);
      base.animSpeed = 0; // the golem goes still
      base.untag("tower"); // enemies stop targeting it
      getTreeRoot().trigger("golem-dying");
      wait(TOWER.deathDelay, () => {
        playFx("power-down", TOWER.powerDownTime, () => {
          powered = false; // stays a grey statue behind the game-over screen
          base.powered = false;
          getTreeRoot().trigger("run-over", { reason: "tower-destroyed" });
        });
      });
    });

    // HP bar above the base (separate object so the base's scale doesn't apply)
    add([
      pos(0, 0),
      z(50),
      {
        draw() {
          if (!base.exists() || !base.awake) return; // no HP bar on the statue
          const r = base.solidRect(); // sits just above the golem's head
          const w = Math.max(60, (r.x1 - r.x0) * 0.8);
          const x = (r.x0 + r.x1) / 2 - w / 2;
          const y = r.y0 - 10;
          const ratio = Math.max(0, base.hp() / base.maxHP());
          drawRect({ pos: vec2(x - 1, y - 1), width: w + 2, height: 8, color: rgb(34, 24, 48) });
          drawRect({
            pos: vec2(x, y),
            width: w * ratio,
            height: 6,
            color: ratio > 0.3 ? rgb(110, 220, 120) : rgb(240, 80, 70),
          });
        },
      },
    ]);

    return base;
  }
}

/** The golem's visible body in world px: its area box minus TOWER.body insets. */
function solidRect(base) {
  const b = base.worldArea().bbox();
  const { cell, left, top, right, bottom } = TOWER.body;
  const sx = b.width / cell;
  const sy = b.height / cell;
  return {
    x0: b.pos.x + left * sx,
    y0: b.pos.y + top * sy,
    x1: b.pos.x + b.width - right * sx,
    y1: b.pos.y + b.height - bottom * sy,
  };
}

/** The current frame's uv rect in the sprite atlas ({ y, h } used by the shader). */
function frameQuad(base) {
  const frames = getSprite(base.sprite)?.data?.frames;
  return frames?.[base.frame] ?? { y: 0, h: 1 };
}

/** Green "+N" rising above the golem's head after a wave repair. */
function repairText(base, amount) {
  const r = base.solidRect();
  const t = add([
    text(`+${amount}`, { size: 20 }),
    pos((r.x0 + r.x1) / 2, r.y0 - 24),
    anchor("center"),
    color(90, 230, 110),
    opacity(1),
    z(60),
    lifespan(1.2, { fade: 0.6 }),
    "fx", // short-lived effect (cleared when the run is over)
  ]);
  t.onUpdate(() => t.move(0, -30));
}

/** Visual center of the base (its anchor is "bot"). */
function center(obj) {
  const b = obj.worldArea().bbox();
  return vec2(b.pos.x + b.width / 2, b.pos.y + b.height / 2);
}

function nearestEnemy(from, range) {
  let best = null;
  let bestD = range * range;
  for (const e of get("enemy")) {
    const dx = e.pos.x - from.x;
    const dy = e.pos.y - from.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function shoot(from, to, stats) {
  const dir = to.sub(from).unit();
  add([
    sprite(BOLT, { anim: "fly" }),
    scale(2),
    pos(from),
    anchor("center"),
    rotate(dir.angle()),
    move(dir, stats.projectileSpeed),
    offscreen({ destroy: true }),
    opacity(1), // required by lifespan()
    lifespan(stats.range / stats.projectileSpeed + 0.2),
    z(6),
    "projectile",
    // source "tower": these shots don't provoke a siege boss (only the player's do)
    { damage: stats.damage, hitRadius: 8, source: "tower" },
  ]);
}
