// The base IS the tower (docs/game-design-v2.md): the "base" object gets HP
// and the "tower" tag, enemies attack it once it's awake, and when it's
// destroyed the run is over. The active-offense shop pick makes it shoot the
// nearest enemy in range; each further pick levels it up and repairs it.
//
// Golem awakening (docs/game-design-v2.md → "The golem awakening flow"): the
// base starts as an inert statue during wave 1. It is still solid, but
// enemies ignore it (no targeting, no contact damage), it has no HP bar and
// it doesn't shoot. It wakes up at the end of wave 1 (the first "wave-end").
// Statue look: grey (desaturated) and not animated, until its power is picked:
// the first shop close after it woke (pick or skip) - later the golem style
// pick. Then it gets its colours back and starts its idle animation.
//
// Contract (no imports between systems):
//   - attaches to the object tagged "base" (base.js) once it exists: adds
//     health() + the "tower" tag → enemies.js targets it and hits it on contact
//   - base.solidRect() → { x0, y0, x1, y1 }: the golem's visible body in world
//     px (TOWER.body). Solid for enemies (enemies.js) and the player (here).
//   - listens to getTreeRoot().on("shop-pick", { quadrant: "active-offense", level, params })
//   - shots are "projectile"s with { damage } → enemies.js applies the hit
//   - base.awake: false while it's the wave-1 statue, true once awake.
//     enemies.js only targets / damages a tower with awake === true.
//   - on waking: getTreeRoot().trigger("golem-awake") (fired once, on the
//     first "wave-end"). respawn.js listens: until then, player death = run over.
//   - powered (look only): on the first "shop-close" after waking, the grey
//     statue shader is removed, the idle anim starts, and
//     getTreeRoot().trigger("golem-powered") fires (once). base.powered = true.
//   - wave repair: on "wave-end", the golem heals TOWER.waveEndRepair (half)
//     of the HP it lost since "wave-start" (capped at max HP), with a green
//     "+N" above it, and fires getTreeRoot().trigger("golem-repaired", { amount }).
//   - on destruction: getTreeRoot().trigger("run-over", { reason: "tower-destroyed" })
//     (fired once). Once the golem is awake, this is the run's ONLY lose condition.
import boltUrl from "../../gfx/SurvivorsStarterKit_v1.0/Weapons/Projectiles/Proj_Magic_Bolt.png";
import { TOWER } from "../config.js";
import { levelStat, resolveStats } from "../util/levelStat.js";
import { pushOutOfRect } from "../util/solid.js";

const QUADRANT = "active-offense";
const BOLT = "tower-bolt";
const STATUE_SHADER = "golem-statue";

// Grey statue: the art's own brightness (outline + shading survive), no hue.
const STATUE_FRAG = `
uniform float u_amount;
vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
  vec4 c = def_frag();
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  return vec4(mix(c.rgb, vec3(l), u_amount), c.a);
}
`;

export function loadTowerSprites() {
  loadSprite(BOLT, boltUrl, {
    sliceX: 4,
    anims: { fly: { from: 0, to: 3, loop: true, speed: 12 } },
  });
  loadShader(STATUE_SHADER, null, STATUE_FRAG);
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

  // Wave repair: remember the golem's HP when a wave starts; when it ends,
  // give back TOWER.waveEndRepair of what was lost during the wave.
  let hpAtWaveStart = null;
  getTreeRoot().on("wave-start", () => {
    hpAtWaveStart = tower?.exists() ? tower.hp() : null;
  });
  getTreeRoot().on("wave-end", () => {
    if (over || !tower?.exists() || hpAtWaveStart == null) return;
    const lost = hpAtWaveStart - tower.hp();
    hpAtWaveStart = null;
    const amount = Math.min(Math.round(lost * TOWER.waveEndRepair), tower.maxHP() - tower.hp());
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

  // Power picked: the first shop close after waking (pick or skip).
  // TODO: switch to the golem style pick event once that screen exists.
  getTreeRoot().on("shop-close", () => {
    if (!awake || powered || over || !tower?.exists()) return;
    powered = true;
    tower.powered = true;
    tower.unuse("shader");
    tower.animSpeed = TOWER.idleAnimSpeed; // slow, heavy idle
    getTreeRoot().trigger("golem-powered");
  });

  onUpdate(() => {
    if (!tower) {
      const base = get("base")[0];
      if (base) tower = arm(base);
      return;
    }
    if (!tower.exists()) return;

    // the player can't walk through the golem (it stays solid after the fall)
    const player = get("player")[0];
    if (player) pushOutOfRect(player, tower.solidRect(), TOWER.playerRadius);

    if (over || !awake) return; // the statue doesn't shoot

    cooldown -= dt();
    if (!shot || cooldown > 0) return;
    const from = center(tower);
    const target = nearestEnemy(from, shot.range);
    if (!target) return;
    cooldown = shot.fireInterval;
    shoot(from, target.pos, shot);
  });

  function arm(base) {
    const hp = maxHpFor(picks);
    base.use(health(hp, hp));
    // statue look: grey and frozen on its first idle frame until powered
    base.powered = powered;
    if (!powered) {
      base.use(shader(STATUE_SHADER, { u_amount: TOWER.statueGrey }));
      base.animSpeed = 0;
      base.frame = 0;
    } else {
      base.animSpeed = TOWER.idleAnimSpeed;
    }
    base.solidRect = () => solidRect(base);
    base.awake = awake;
    if (!base.has("color")) base.use(color(255, 255, 255)); // for the hurt flash
    base.tag("tower");

    let flash = null; // pending colour restore of the hurt flash
    base.onHurt(() => {
      if (over) return;
      flash?.cancel();
      base.color = rgb(255, 140, 140);
      flash = wait(0.08, () => base.exists() && !over && (base.color = rgb(255, 255, 255)));
    });

    base.onDeath(() => {
      if (over) return;
      over = true;
      flash?.cancel();
      base.color = rgb(120, 70, 70); // destroyed look (stays: the game is frozen)
      base.untag("tower"); // enemies stop targeting it
      getTreeRoot().trigger("run-over", { reason: "tower-destroyed" });
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
