// Enemies: factory, chase behaviour, contact attack, death + drops, and the
// wave director (each wave spawns enemies at a rate that grows wave after
// wave, until its timer runs out - see docs/game-design-v2.md).
//
// Contract for other systems (no imports needed - use KAPLAY tags/events):
//   - Live enemies carry the "enemy" tag, a pos and a health() comp. Dying
//     enemies lose "enemy", so they can't be targeted while the death anim plays.
//   - Enemies have NO KAPLAY area(): they don't take part in KAPLAY's
//     collision pass at all (a dense horde made it collapse to ~3 fps), so
//     onCollide*("…", "enemy") never fires. Instead this module does its own
//     grid-based hit detection every frame:
//       * PROJECTILES: any object tagged "projectile" with a numeric `damage`
//         property hits enemies it overlaps. Optional props:
//           hitRadius  px (default: half its area() bbox, else ENEMY.defaultProjectileRadius)
//           pierce     how many enemies it can hit before being destroyed (default 1)
//         Each projectile hits a given enemy at most once. This module calls
//         enemy.hurt(damage), destroys the projectile when pierce runs out,
//         and fires on("hit", "projectile", (proj, enemy) => …) for effects.
//         Use anchor("center") on projectiles so pos is the visual center.
//       * PLAYER CONTACT: enemies overlapping the "player" hurt it. Damage is
//         scaled by player.buffs.damageTaken (defense aura) and absorbed first
//         by player.shield (regen shield) - see damagePlayer().
//       * TARGETING (docs/game-design-v2.md → "Enemy targeting"): each enemy
//         picks the player or the tower (object tagged "tower" with health();
//         the base) - focus the clearly weaker one (hp fraction), otherwise
//         split the horde (ENEMY_TARGETING), re-evaluated on a short timer
//         with stickiness. A downed player (player.down, respawn.js) isn't a
//         target and can't be hit.
//       * The tower is SOLID for enemies: they're pushed out of its body box
//         (tower.solidRect(), else its world-area box) by their full drawn
//         size, so no sprite hides behind the golem.
//       * The tower's HP DRAINS while enemies touch it (no per-hit damage):
//         every frame tower.hurt(sum of touching enemies' damage x
//         ENEMY.towerDrain.perDamage x dt). "damage-taken" { kind: "tower" }
//         reports the drained total every towerDrain.reportInterval s.
//       * A tower with awake === false (the wave-1 statue, tower.js) is
//         still solid, but is NOT a target and takes no contact damage.
//       * AURAS: objects tagged "aura" with { radius, enemySlow } slow every
//         enemy inside (speed *= enemySlow; the strongest aura wins).
//   - Each enemy also carries `type` (e.g. "zombie", "bat").
//   - on("killed", "enemy", (enemy, { pos, level, tier, type }) => ...)   every kill (HUD)
//   - on("drop",   "enemy", (enemy, { kind, pos, level, tier, type, value }) => ...)
//       only when the drop roll succeeds (xp.js spawns the gem/item)
//   - Enemies damage the player on contact by calling `player.hurt(n)` if
//     the "player" object has a health() comp.
//   - WAVES (root events, no import needed - e.g. for the cycle director):
//       getTreeRoot().trigger("enemy-start-wave", n)   start wave n (omit n = next)
//       getTreeRoot().trigger("enemy-clear")           despawn every enemy, no drops
//       getTreeRoot().trigger("enemy-end-wave")        end the running wave now
//                                                      ("cleared"; dev key, devtools.js)
//       getTreeRoot().trigger("enemy-freeze", { frozen, duration? })  freeze all
//         enemies (dev key F in devtools.js; later a rare power-up drop).
//         Frozen enemies stand still (walk anim paused) and deal no contact
//         damage; projectile hits still land. Spawning and the wave timer
//         keep going, and new enemies arrive frozen. `duration` (s) unfreezes
//         by itself (a longer freeze wins); without it the freeze lasts until
//         { frozen: false }.
//       getTreeRoot().on("enemy-freeze-changed", ({ frozen }) => …)  state changed
//       getTreeRoot().on("wave-start", (n) => …)
//       getTreeRoot().on("wave-end", ({ wave, reason, kills }) => …)
//         reason: "cleared" = the wave was survived (its timer ran out, or
//         on a boss wave the boss died). Waves can't end early otherwise.
//       On getTreeRoot().on("run-over"): the director freezes (timer stops,
//         no spawns/hits/new waves, enemies paused in place).
//         Leftover enemies vanish in a smoke puff when the wave ends - no
//         drops, not counted as kills (ENEMY_WAVES.killOnEnd).
//       On getTreeRoot().on("golem-dying") (tower.js): the wave stops without
//         a "wave-end", every enemy poufs and no further wave can start.
//   - KNOCKBACK: getTreeRoot().trigger("enemy-knockback", { x, y, radius,
//       force, damage? }) pushes every visible live enemy within `radius` of
//       (x, y) straight away from it at `force` px/s (× (1 - type
//       knockbackResist)), decaying by ENEMY.knockbackDecay. While pushed an
//       enemy doesn't chase or sweep. Optional `damage` hurts each one.
//   - External spawn triggers (for `{ trigger: "name" }` spawn conditions):
//       getTreeRoot().trigger("enemy-trigger", "bat-swarm")   // no import needed
//     or import { fireEnemyTrigger } from this file. Triggers stay on until
//     cleared with getTreeRoot().trigger("enemy-trigger-clear", "bat-swarm").

import {
  ENEMY,
  ENEMY_TYPES,
  ENEMY_LEVEL,
  ENEMY_SPAWN,
  ENEMY_WAVES,
  ENEMY_TARGETING,
  CFG,
  ENEMY_DROPS,
  ENEMY_TIERS,
} from "../config.js";
import { rectDistance, pushOutOfRect, detourAround } from "../util/solid.js";

// Every enemy and boss sheet in the pack, so a new type only needs a config entry.
const ENEMY_SHEETS = import.meta.glob(
  "../../gfx/SurvivorsStarterKit_v1.0/{Enemies,Bosses}/*.png",
  { eager: true, query: "?url", import: "default" },
);
const sheetUrl = (file) =>
  ENEMY_SHEETS[`../../gfx/SurvivorsStarterKit_v1.0/Enemies/${file}`] ??
  ENEMY_SHEETS[`../../gfx/SurvivorsStarterKit_v1.0/Bosses/${file}`];

// Sheet layouts. Enemy: 6x3 cells of 16 px, rows Move(4) / Hit(2) / Death(6).
// Boss: 8x4 cells of 32 px, rows Move(4) / Attack(4) / Hit(2) / Death(8).
const LAYOUTS = {
  enemy: {
    cell: 16, cols: 6, rows: 3,
    anims: {
      move: { from: 0, to: 3, loop: true, speed: 8 },
      hit: { from: 6, to: 7, speed: 12 },
      death: { from: 12, to: 17, speed: 12 },
    },
  },
  boss: {
    cell: 32, cols: 8, rows: 4,
    anims: {
      move: { from: 0, to: 3, loop: true, speed: 6 },
      attack: { from: 8, to: 11, speed: 8 },
      hit: { from: 16, to: 17, speed: 12 },
      death: { from: 24, to: 31, speed: 12 },
    },
  },
};
const layoutOf = (type) => LAYOUTS[type.sheet ?? "enemy"];
const spritesOf = (type) => type.sprites ?? [type.sprite];

const TYPES = Object.fromEntries(ENEMY_TYPES.map((t) => [t.id, t]));
// Largest enemy hit circle: hit queries widen their grid search by this much.
const MAX_HIT_RADIUS = Math.max(...ENEMY_TYPES.map((t) => t.hitRadius));
// The drawn body is half a sheet cell × scale.
const bodyRadiusOf = (t) => (layoutOf(t).cell / 2) * t.scale;
const MAX_BODY_RADIUS = Math.max(...ENEMY_TYPES.map(bodyRadiusOf));

const TINT_SHADER = "enemy-tint";

// Recolor that keeps each pixel's brightness (so the dark outline and shading
// survive) but swaps its hue toward u_tint. Plain color() multiplies, which
// turns the green art muddy (yellow → olive, red → brown).
const TINT_FRAG = `
uniform vec3 u_tint; // KAPLAY sends Color uniforms as 0..255
uniform float u_amount;
vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
  vec4 c = def_frag();
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 hot = clamp(u_tint / 255.0 * (0.25 + 1.3 * l), 0.0, 1.0);
  return vec4(mix(c.rgb, hot, u_amount), c.a);
}
`;

// One shared uniform object per tier so KAPLAY can batch same-tier enemies.
// Built in loadEnemySprites() because rgb() only exists after kaplay() runs.
let tierUniforms = [];

export function loadEnemySprites() {
  loadShader(TINT_SHADER, null, TINT_FRAG);
  tierUniforms = ENEMY_TIERS.map((t) =>
    t.tint ? { u_tint: rgb(...t.tint), u_amount: t.amount } : null,
  );
  for (const type of ENEMY_TYPES) {
    const layout = layoutOf(type);
    spritesOf(type).forEach((file, i) => {
      const url = sheetUrl(file);
      if (!url) throw new Error(`enemy type "${type.id}": sprite ${file} not found`);
      loadSprite(`enemy-${type.id}-${i}`, url, {
        sliceX: layout.cols,
        sliceY: layout.rows,
        anims: layout.anims,
      });
    });
  }
}

/** Enemy level for a wave number (1-based). */
export function enemyLevelForWave(wave) {
  const lvl = 1 + ENEMY_LEVEL.levelsPerWave * (wave - 1);
  return Math.min(lvl, ENEMY_LEVEL.maxLevel);
}

/** Every ENEMY_WAVES.boss.every-th wave is a boss wave. */
export function isBossWave(wave) {
  const every = ENEMY_WAVES.boss?.every;
  return !!every && wave > 0 && wave % every === 0;
}

const isBossType = (type) => type.behavior?.kind === "siege";

/** Wave multiplier on spawn intervals: < 1 = faster, shrinks every wave. */
export function waveRateMult(wave) {
  const r = ENEMY_WAVES.rate;
  return Math.max(r.minMult, Math.pow(r.perWave, Math.max(0, wave - 1)));
}

/**
 * Seconds until a type's next group: its in-wave ramp (startInterval down to
 * minInterval, activeFor = s it's been spawning this wave), scaled by the
 * wave multiplier. Boss waves slow the minions down (minionRateMult).
 */
export function spawnInterval(type, wave, activeFor) {
  const sp = type.spawn;
  const ramp = Math.max(sp.minInterval, sp.startInterval - sp.intervalDecayPerSec * activeFor);
  const bossSlow = isBossWave(wave) && !isBossType(type) ? 1 / ENEMY_WAVES.boss.minionRateMult : 1;
  return ramp * waveRateMult(wave) * bossSlow;
}

/** Wave timer in seconds (boss waves have none: they end with the boss). */
export function waveDuration(wave) {
  if (isBossWave(wave)) return Infinity;
  const w = ENEMY_WAVES;
  return Math.min(w.maxDuration, w.baseDuration + w.durationPerWave * (wave - 1));
}

export function enemyStatsForLevel(type, level) {
  const n = level - 1;
  return {
    hp: Math.max(1, Math.round(type.baseHp * (1 + ENEMY_LEVEL.hpGrowth * n))),
    damage: Math.round(type.baseDamage * (1 + ENEMY_LEVEL.damageGrowth * n)),
  };
}

/** Roll a drop table once; returns a drop entry or null. */
export function rollDrop(level, table = ENEMY_DROPS) {
  const r = Math.random();
  let acc = 0;
  for (const d of table) {
    acc += Math.max(0, Math.min(d.max, d.base + d.perLevel * (level - 1)));
    if (r < acc) return d;
  }
  return null;
}

/** Color-swap tier for a given max HP (highest tier whose minHp <= hp). */
export function enemyTierForHp(hp, minHps = ENEMY_TIERS.map((t) => t.minHp)) {
  let tier = 0;
  minHps.forEach((min, i) => {
    if (hp >= min) tier = i;
  });
  return tier;
}

// Live (not dying) enemies. Kept here so hot paths never scan the whole
// object tree with get("enemy").
const live = new Set();
let waveKills = 0;
let currentWave = 0; // for the boss-defeated event
const liveByType = new Map(ENEMY_TYPES.map((t) => [t.id, 0]));

/** Number of live (not dying) enemies, optionally of one type. */
export function liveEnemyCount(typeId) {
  return typeId ? liveByType.get(typeId) ?? 0 : live.size;
}

function markGone(enemy) {
  setTarget(enemy, null);
  if (live.delete(enemy)) liveByType.set(enemy.type, liveByType.get(enemy.type) - 1);
}

// Enemy freeze ("enemy-freeze"): read by every enemy's update. freezeLeft =
// seconds left (Infinity = until unfrozen, 0 = not frozen).
let frozen = false;
let freezeLeft = 0;
function setFrozen(on) {
  if (frozen === on) return;
  frozen = on;
  getTreeRoot().trigger("enemy-freeze-changed", { frozen });
}

// Towers and auras, refreshed once per frame by the director (few objects).
let towers = [];
let auras = [];

// ---------------------------------------------------------------------------
// Smart targeting: player vs tower
// ---------------------------------------------------------------------------

// Refreshed once per frame by refreshTargets(): where each target is, whether
// it can be attacked, and its hp fraction. counts = enemies assigned to each.
const targets = {
  player: { avail: false, x: 0, y: 0, frac: 1 },
  // solid: a tower body exists (push out / detour); avail: it's awake and
  // can be targeted and hit (the wave-1 statue is solid but not avail)
  tower: { avail: false, solid: false, x: 0, y: 0, frac: 1, obj: null },
};
const counts = { player: 0, tower: 0 };

function hpFrac(obj, fallbackMax) {
  const max = obj.maxHP?.() || fallbackMax || obj.hp();
  return max > 0 ? obj.hp() / max : 1;
}

function refreshTargets() {
  const p = getPlayer();
  const P = targets.player;
  P.avail = !!p && !p.down && typeof p.hp === "function" && p.hp() > 0;
  if (p) {
    P.x = p.pos.x;
    P.y = p.pos.y;
    if (P.avail) P.frac = hpFrac(p, CFG.player.maxHp);
  }

  const t = towers.find((o) => o.exists() && typeof o.hp === "function" && o.hp() > 0);
  const T = targets.tower;
  T.solid = !!t;
  T.avail = !!t && t.awake !== false;
  T.obj = t ?? null;
  if (t) {
    // the tower's visible body if it defines one (tower.js), else its area box
    const b = t.worldArea().bbox();
    T.rect = t.solidRect?.() ?? { x0: b.pos.x, y0: b.pos.y, x1: b.pos.x + b.width, y1: b.pos.y + b.height };
    T.x = (T.rect.x0 + T.rect.x1) / 2;
    T.y = (T.rect.y0 + T.rect.y1) / 2;
    T.frac = hpFrac(t);
  }

  counts.player = 0;
  counts.tower = 0;
  for (const e of live) if (e.target) counts[e.target] += 1;
}

/** Decide "player" | "tower" | null for one enemy (rules 1-4 of the design). */
function chooseTarget(e) {
  const P = targets.player;
  const T = targets.tower;
  if (!P.avail && !T.avail) return null;
  if (!T.avail) return "player"; // rule 3: only one left
  if (!P.avail) return "tower";

  // rule 1: focus the clearly weaker target
  const cfg = ENEMY_TARGETING;
  if (Math.abs(P.frac - T.frac) >= cfg.focusMargin) {
    return P.frac < T.frac ? "player" : "tower";
  }

  // rule 2: spread the pressure, with stickiness (rule 4)
  const total = counts.player + counts.tower;
  const share = total ? counts.tower / total : 0;
  if (e.target === "tower" && share <= cfg.towerShare + cfg.switchTolerance) return "tower";
  if (e.target === "player" && share >= cfg.towerShare - cfg.switchTolerance) return "player";
  return share < cfg.towerShare ? "tower" : "player";
}

function setTarget(e, t) {
  if (e.target === t) return;
  if (e.target) counts[e.target] -= 1;
  if (t) counts[t] += 1;
  e.target = t;
}

/** How many live enemies are going for each target (HUD/debug). */
export function targetCounts() {
  return { ...counts };
}

// get("player") walks every object in the scene; doing that once per enemy
// per frame was O(n²). Cache it and only re-query when it's gone.
let cachedPlayer = null;
function getPlayer() {
  if (!cachedPlayer || !cachedPlayer.exists()) cachedPlayer = get("player")[0] ?? null;
  return cachedPlayer;
}

/**
 * Spawn one enemy. opts.group: shared { target, nextRetarget } object for a
 * group spawned together (they pick their target as one); opts.formation:
 * this member's offset in the group's formation (kept while travelling).
 */
export function spawnEnemy(p, level = 1, typeId = ENEMY_TYPES[0].id, opts = {}) {
  const type = TYPES[typeId];
  if (!type) throw new Error(`unknown enemy type "${typeId}"`);
  const stats = enemyStatsForLevel(type, level);
  const tier = enemyTierForHp(stats.hp, type.tierMinHp);
  const { xpMult } = ENEMY_TIERS[tier];
  const uniforms = tierUniforms[tier];

  const enemy = add([
    sprite(`enemy-${type.id}-${opts.variant ?? 0}`, { anim: "move" }),
    pos(p),
    anchor("center"),
    scale(type.scale),
    z(type.behavior?.kind === "sweep" ? 7 : 0), // flyers draw over the golem (z 5)
    health(stats.hp, stats.hp), // max HP set too (HP bars, hp fractions)
    ...(uniforms ? [shader(TINT_SHADER, uniforms)] : []),
    "enemy",
    {
      type: type.id,
      speed: type.speed,
      hitRadius: type.hitRadius,
      bodyRadius: bodyRadiusOf(type), // half the drawn sprite
      name: (spritesOf(type)[opts.variant ?? 0] ?? "").replace(/^(Boss|Enemy)_|\.png$/g, "").replace(/_/g, " "),
      provokedUntil: 0, // siege bosses: chase the player until then
      drops: type.drops ?? ENEMY_DROPS,
      level,
      tier,
      xpMult,
      damage: stats.damage,
      attackTimer: 0,
      target: null, // "player" | "tower" | null (smart targeting)
      retargetIn: rand(0, ENEMY_TARGETING.retargetJitter),
      group: opts.group ?? null, // shared target decision for a spawned group
      formation: opts.formation ?? vec2(0), // offset in the group's formation
      behavior: type.behavior?.kind ?? "chase",
      dead: false,
      // Each enemy aims at its own point near the player, so an overlapping
      // horde fans out a little instead of stacking on one pixel.
      chaseOffset: Vec2.fromAngle(rand(360)).scale(rand(0, ENEMY.chaseOffset)),
      knock: null, // knockback velocity (px/s), see knockback()
    },
  ]);

  enemy.onUpdate(() => {
    if (enemy.dead) return;
    if (frozen) {
      // stand still; keep a hit / death anim readable, pause the walk cycle
      if (enemy.curAnim() === "move") enemy.animSpeed = 0;
      return;
    }
    enemy.attackTimer = Math.max(0, enemy.attackTimer - dt());

    const player = getPlayer();
    if (!player) return;

    // Recycle stragglers (no drop) only when far from BOTH targets, so
    // enemies walking to the tower survive while the player is elsewhere.
    const playerDist = player.pos.dist(enemy.pos);
    const T = targets.tower;
    const towerDist = T.avail ? Math.hypot(T.x - enemy.pos.x, T.y - enemy.pos.y) : Infinity;
    if (Math.min(playerDist, towerDist) > ENEMY.despawnDistance) {
      destroy(enemy);
      return;
    }

    // Being knocked back: slide with the push, no chasing until it fades.
    if (enemy.knock) {
      enemy.move(enemy.knock);
      enemy.knock = enemy.knock.scale(Math.exp(-ENEMY.knockbackDecay * dt()));
      if (enemy.knock.len() < ENEMY.knockbackStop) enemy.knock = null;
      if (enemy.behavior !== "sweep" && targets.tower.solid) {
        pushOutOfRect(enemy, targets.tower.rect, enemy.bodyRadius);
      }
      return;
    }

    // Sweepers (bats) ignore targets: they fly across the screen and back.
    if (enemy.behavior === "sweep") {
      sweep(enemy);
      return;
    }

    // Re-evaluate the target on a short timer, or right away if it's gone.
    // A group decides once for all its members (they attack together).
    if (enemy.behavior === "siege") {
      // siege boss: the tower, unless the player provoked it recently
      const provoked = time() < enemy.provokedUntil && targets.player.avail;
      setTarget(enemy, provoked ? "player" : targets.tower.avail ? "tower" : targets.player.avail ? "player" : null);
    } else if (enemy.group) {
      const g = enemy.group;
      if (time() >= g.nextRetarget || !(g.target && targets[g.target].avail)) {
        g.target = chooseTarget(g);
        g.nextRetarget =
          time() + ENEMY_TARGETING.retargetInterval + rand(0, ENEMY_TARGETING.retargetJitter);
      }
      setTarget(enemy, g.target);
    } else {
      enemy.retargetIn -= dt();
      if (enemy.retargetIn <= 0 || !(enemy.target && targets[enemy.target].avail)) {
        setTarget(enemy, chooseTarget(enemy));
        enemy.retargetIn =
          ENEMY_TARGETING.retargetInterval + rand(0, ENEMY_TARGETING.retargetJitter);
      }
    }
    const tgt = enemy.target && targets[enemy.target];
    if (!tgt) return; // nothing to attack (player respawning, no tower)
    const goal = vec2(tgt.x - enemy.pos.x, tgt.y - enemy.pos.y);

    const speed = enemy.speed * auraSlowAt(enemy.pos.x, enemy.pos.y);
    // Keep the group formation while far; close up near the target.
    const hold = Math.min(1, goal.len() / ENEMY.formationHoldDistance);
    let toTarget = goal.add(enemy.chaseOffset).add(enemy.formation.scale(hold));
    // Go around the solid golem instead of pushing into it (unless the golem
    // IS the target: then walking up to it is the point).
    if (enemy.target !== "tower" && targets.tower.solid) {
      const corner = detourAround(enemy.pos, enemy.pos.add(toTarget), targets.tower.rect, enemy.bodyRadius);
      if (corner) toTarget = vec2(corner.x - enemy.pos.x, corner.y - enemy.pos.y);
    }
    const dist = toTarget.len();
    // Stop on arrival instead of jittering back and forth over the point.
    const stepSpeed = dist > 1 && dt() > 0 ? Math.min(speed, dist / dt()) : 0;
    if (stepSpeed > 0) enemy.move(toTarget.scale(stepSpeed / dist));
    enemy.flipX = goal.x < 0; // art faces right (always face the target)
    updateMoveAnimSpeed(enemy, stepSpeed);

    // The tower is solid: never let an enemy (sprite) overlap it.
    if (targets.tower.solid) pushOutOfRect(enemy, targets.tower.rect, enemy.bodyRadius);
  });

  enemy.onHurt(() => {
    if (enemy.dead || enemy.hp() <= 0) return;
    enemy.animSpeed = 1;
    enemy.play("hit");
  });

  enemy.onAnimEnd((anim) => {
    if ((anim === "hit" || anim === "attack") && !enemy.dead) enemy.play("move");
    if (anim === "death") destroy(enemy);
  });

  // Bosses: HP bar + name above the sprite (drawn in its local, scaled space).
  if (type.hpBar) {
    const cell = layoutOf(type).cell;
    enemy.onDraw(() => {
      if (enemy.dead) return;
      const w = cell * 0.9;
      const y = -cell / 2 - 3;
      const ratio = Math.max(0, enemy.hp() / enemy.maxHP());
      drawRect({ pos: vec2(-w / 2 - 0.5, y - 0.5), width: w + 1, height: 2.6, color: rgb(34, 24, 48) });
      drawRect({ pos: vec2(-w / 2, y), width: w * ratio, height: 1.6, color: rgb(230, 60, 70) });
      drawText({ text: enemy.name, size: 4.5, pos: vec2(0, y - 2), anchor: "bot", color: rgb(255, 235, 235) });
    });
  }

  enemy.onDeath(() => killEnemy(enemy));
  enemy.onDestroy(() => markGone(enemy));
  live.add(enemy);
  liveByType.set(type.id, liveByType.get(type.id) + 1);

  return enemy;
}

function killEnemy(enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  markGone(enemy);

  const info = {
    pos: enemy.pos.clone(),
    level: enemy.level,
    tier: enemy.tier,
    type: enemy.type,
  };
  enemy.trigger("killed", info);
  waveKills += 1;

  const type = TYPES[enemy.type];
  if (type.rewardCoins) {
    // bosses: a burst of coin drops on top of their normal drop (base.js spawns them)
    for (let i = 0; i < type.rewardCoins; i++) {
      const at = info.pos.add(rand(-30, 30), rand(-30, 30));
      enemy.trigger("drop", { ...info, pos: at, kind: "coin", value: 0 });
    }
  }
  if (isBossType(type)) {
    getTreeRoot().trigger("boss-defeated", { wave: currentWave, type: enemy.type, name: enemy.name, pos: info.pos });
  }

  const drop = rollDrop(enemy.level, enemy.drops);
  if (drop) {
    enemy.trigger("drop", {
      ...info,
      kind: drop.kind,
      value: Math.round(drop.value * enemy.level * enemy.xpMult),
    });
  }

  playDeath(enemy);
}

/** Take an enemy out of play and play its death anim (destroyed at the end). */
// ---------------------------------------------------------------------------
// Sweep behavior (bats): fly straight across the screen, leave it, wait, come
// back. The group shares one sweep state (a virtual center moving in a straight
// line); each member flies to center + its formation offset.
// While they wait off-screen before turning back, they're HIDDEN and out of
// play: no "enemy" tag (weapons / the tower don't aim at them) and out of the
// hit grid (no projectile hits, no contact damage).
// ---------------------------------------------------------------------------

function aimSweep(s, cfg) {
  const c = getCamPos();
  const aim = c.add(rand(-cfg.aimSpread, cfg.aimSpread), rand(-cfg.aimSpread, cfg.aimSpread));
  s.dir = aim.sub(s.center).unit();
  s.phase = "pass";
}

/** Past the screen edge (by margin) and still moving away from it? */
function leftScreen(s, margin) {
  const c = getCamPos();
  const dx = s.center.x - c.x;
  const dy = s.center.y - c.y;
  const out = Math.abs(dx) > width() / 2 + margin || Math.abs(dy) > height() / 2 + margin;
  return out && dx * s.dir.x + dy * s.dir.y > 0;
}

function sweep(enemy) {
  const type = TYPES[enemy.type];
  const cfg = type.behavior;
  const holder = enemy.group ?? enemy;
  setTarget(enemy, null); // not attacking the player or the tower

  // shared state, advanced once per frame per group (time() is frozen while
  // paused, so the sweep pauses too)
  if (!holder.sweep) {
    holder.sweep = { center: enemy.pos.sub(enemy.formation), dir: null, phase: "pass", wait: 0, t: -1 };
    aimSweep(holder.sweep, cfg);
  }
  const s = holder.sweep;
  if (s.t !== time()) {
    s.t = time();
    if (s.phase === "pass") {
      s.center = s.center.add(s.dir.scale(enemy.speed * dt()));
      const margin = cfg.exitMargin + (type.spawn.group?.radius ?? 0);
      if (leftScreen(s, margin)) {
        s.phase = "wait";
        s.wait = cfg.returnDelay;
      }
    } else {
      s.wait -= dt();
      if (s.wait <= 0) aimSweep(s, cfg); // come back across the screen
    }
  }

  // hidden + out of play while waiting to turn back (see the section header)
  const away = s.phase === "wait";
  if (!!enemy.hidden !== away) {
    enemy.hidden = away;
    if (away) enemy.untag("enemy");
    else enemy.tag("enemy");
  }

  // fly to my slot in the formation (a little faster than the center, so
  // members slowed by an aura catch up)
  const to = s.center.add(enemy.formation).sub(enemy.pos);
  const d = to.len();
  const speed = enemy.speed * 1.5 * auraSlowAt(enemy.pos.x, enemy.pos.y);
  const step = d > 1 && dt() > 0 ? Math.min(speed, d / dt()) : 0;
  if (step > 0) enemy.move(to.scale(step / d));
  enemy.flipX = s.dir.x < 0;
  updateMoveAnimSpeed(enemy, s.phase === "pass" ? enemy.speed : step);
}

/** Swing animation on a hit, for sheets that have one (bosses). */
function playAttack(e) {
  if (e.dead || e.curAnim() === "attack") return;
  if (layoutOf(TYPES[e.type]).anims.attack) {
    e.animSpeed = 1;
    e.play("attack");
  }
}

/** Move-anim speed follows the actual movement speed (ENEMY.anim). */
function updateMoveAnimSpeed(enemy, moveSpeed) {
  if (dt() === 0) return;
  if (enemy.curAnim() !== "move") {
    enemy.animSpeed = 1; // hit/death play at their authored speed
    return;
  }
  const a = ENEMY.anim;
  const goal = Math.min(a.max, Math.max(a.idle, moveSpeed / a.refSpeed));
  enemy.animSpeed += (goal - enemy.animSpeed) * (1 - Math.exp(-a.easeRate * dt()));
}

function playDeath(enemy) {
  // Out of play: no more targeting / hits while the death anim runs.
  enemy.untag("enemy");
  enemy.tag("enemy-dying");
  enemy.animSpeed = 1;
  enemy.play("death");
}

/**
 * Every enemy (live or mid-death) vanishes in a puff of smoke: no "killed"
 * or "drop" events (no XP, doesn't count as a player kill).
 */
export function killAllEnemies() {
  for (const e of [...live, ...get("enemy-dying")]) {
    e.dead = true;
    markGone(e);
    if (!e.hidden) pouf(e.pos, e.bodyRadius ?? 16); // hidden bats are off-screen
    destroy(e);
  }
}

/** A little cloud of smoke that swells and fades where an enemy vanished. */
function pouf(at, size) {
  const puffs = Array.from({ length: 5 }, (_, i) => ({
    dir: Vec2.fromAngle(i * 72 + rand(-20, 20)),
    r: size * rand(0.35, 0.55),
  }));
  let t = 0;
  const fx = add([
    pos(at.x, at.y),
    z(8),
    "fx",
    {
      draw() {
        const k = Math.min(1, t / ENEMY_WAVES.poufTime);
        const spread = size * (0.2 + 0.6 * k);
        for (const p of puffs) {
          drawCircle({
            pos: p.dir.scale(spread),
            radius: p.r * (0.6 + 0.7 * k),
            color: rgb(236, 236, 244),
            opacity: 0.85 * (1 - k),
          });
        }
      },
    },
  ]);
  fx.onUpdate(() => {
    t += dt();
    if (t >= ENEMY_WAVES.poufTime) destroy(fx);
  });
}

// ---------------------------------------------------------------------------
// Spatial grid + hit detection (replaces KAPLAY collisions for enemies)
// ---------------------------------------------------------------------------

// Rebuilt once per frame from the live set. Keyed by packed cell coords.
const grid = new Map();
const cellKey = (cx, cy) => cx * 65536 + cy;

function buildGrid() {
  const c = ENEMY.gridCell;
  grid.clear();
  for (const e of live) {
    if (e.hidden) continue; // bats waiting off-screen: can't hit or be hit
    const key = cellKey(Math.floor(e.pos.x / c), Math.floor(e.pos.y / c));
    let cell = grid.get(key);
    if (!cell) grid.set(key, (cell = []));
    cell.push(e);
  }
}

/**
 * Call fn(enemy) for every live enemy whose center might be within `radius`
 * of (x, y) (cell-level filter - callers do the exact distance check).
 * Return true from fn to stop early.
 */
function forEachEnemyNear(x, y, radius, fn) {
  const c = ENEMY.gridCell;
  const x0 = Math.floor((x - radius) / c), x1 = Math.floor((x + radius) / c);
  const y0 = Math.floor((y - radius) / c), y1 = Math.floor((y + radius) / c);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const cell = grid.get(cellKey(cx, cy));
      if (!cell) continue;
      for (const e of cell) if (fn(e)) return;
    }
  }
}

/** Center + radius of an object for hit tests (area bbox if it has one). */
function hitCircle(obj, fallbackRadius) {
  if (obj.hitRadius !== undefined) return { x: obj.pos.x, y: obj.pos.y, r: obj.hitRadius };
  if (obj.has("area")) {
    const b = obj.worldArea().bbox();
    return { x: b.pos.x + b.width / 2, y: b.pos.y + b.height / 2, r: Math.min(b.width, b.height) / 2 };
  }
  return { x: obj.pos.x, y: obj.pos.y, r: fallbackRadius };
}

function overlaps(e, x, y, r) {
  const dx = e.pos.x - x;
  const dy = e.pos.y - y;
  const rr = r + e.hitRadius;
  return dx * dx + dy * dy < rr * rr;
}

function resolveProjectileHits() {
  for (const proj of get("projectile")) {
    if (typeof proj.damage !== "number") continue;
    const { x, y, r } = hitCircle(proj, ENEMY.defaultProjectileRadius);
    proj.hitEnemies ??= new Set();
    proj.pierce ??= 1;
    forEachEnemyNear(x, y, r + MAX_HIT_RADIUS, (e) => {
      if (e.dead || proj.hitEnemies.has(e) || !overlaps(e, x, y, r)) return false;
      proj.hitEnemies.add(e);
      e.hurt(proj.damage);
      getTreeRoot().trigger("damage-dealt", { pos: e.pos, amount: proj.damage });
      // a siege boss hit by the PLAYER (not the tower) turns on the player
      if (e.behavior === "siege" && proj.source !== "tower") {
        e.provokedUntil = time() + (TYPES[e.type].behavior.provokeDuration ?? 5);
      }
      proj.trigger("hit", e);
      proj.pierce -= 1;
      if (proj.pierce <= 0) {
        destroy(proj);
        return true; // stop: projectile used up
      }
      return false;
    });
  }
}

/** Speed multiplier from the strongest "aura" covering (x, y). */
function auraSlowAt(x, y) {
  let mult = 1;
  for (const a of auras) {
    if (a.enemySlow === undefined || a.enemySlow >= mult) continue;
    const p = a.worldPos();
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy <= a.radius * a.radius) mult = a.enemySlow;
  }
  return mult;
}

/**
 * Enemy hit on the player: scaled by the defense aura (player.buffs.damageTaken)
 * and absorbed first by the regen shield (player.shield).
 */
function damagePlayer(player, amount) {
  let dmg = amount * (player.buffs?.damageTaken ?? 1);
  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, dmg);
    player.shield -= absorbed;
    dmg -= absorbed;
  }
  if (dmg > 0) {
    player.hurt(Math.max(1, Math.round(dmg)));
    getTreeRoot().trigger("damage-taken", { kind: "player", pos: player.pos, amount: Math.max(1, Math.round(dmg)) });
  }
}

/** Enemies touching `target` hit it (per-enemy attack cooldown). */
function resolveContact(target, fallbackRadius, onHit) {
  const { x, y, r } = hitCircle(target, fallbackRadius);
  forEachEnemyNear(x, y, r + MAX_HIT_RADIUS, (e) => {
    if (e.dead || e.attackTimer > 0 || !overlaps(e, x, y, r)) return false;
    onHit(e.damage);
    playAttack(e);
    e.attackTimer = ENEMY.attackCooldown;
    return false;
  });
}

function resolvePlayerContact() {
  const player = getPlayer();
  if (!player || typeof player.hurt !== "function" || player.down) return;
  resolveContact(player, ENEMY.defaultPlayerRadius, (dmg) => damagePlayer(player, dmg));
}

// Drained but not yet reported ("damage-taken"), and time since the last report.
let towerDrainPending = 0;
let towerDrainClock = 0;

function resolveTowerContact() {
  const T = targets.tower;
  const t = T.obj;
  if (!T.avail || !t || typeof t.hurt !== "function") return;
  const r = T.rect;
  const reach = Math.hypot(r.x1 - r.x0, r.y1 - r.y0) / 2 + MAX_BODY_RADIUS + ENEMY.towerContactSlack;
  // Drain rate = the weight of everything touching it (count x strength).
  let weight = 0;
  forEachEnemyNear(T.x, T.y, reach, (e) => {
    // sweepers (bats) don't target the tower but drain it while flying over it
    if (e.dead) return false;
    if (rectDistance(e.pos.x, e.pos.y, r).d > e.bodyRadius + ENEMY.towerContactSlack) return false;
    weight += e.damage;
    if (e.attackTimer <= 0) {
      playAttack(e); // visual only: swing every attackCooldown
      e.attackTimer = ENEMY.attackCooldown;
    }
    return false;
  });

  const cfg = ENEMY.towerDrain;
  const drain = weight * cfg.perDamage * dt();
  if (drain > 0) {
    towerDrainPending += drain;
    t.hurt(drain);
  }
  towerDrainClock += dt();
  if (towerDrainClock >= cfg.reportInterval) {
    towerDrainClock = 0;
    if (towerDrainPending >= 0.5) {
      getTreeRoot().trigger("damage-taken", { kind: "tower", pos: t.pos, amount: Math.round(towerDrainPending) });
    }
    towerDrainPending = 0;
  }
}

// Optional soft spacing (ENEMY.separationRadius > 0). Off by default: enemies
// overlap freely. Cheap either way since it only touches neighbouring cells.
function separateEnemies() {
  const r = ENEMY.separationRadius;
  if (!r) return;
  const r2 = r * r;
  const stiffness = ENEMY.separationStiffness;
  for (let pass = 0; pass < ENEMY.separationPasses; pass++) {
    for (const e of live) {
      forEachEnemyNear(e.pos.x, e.pos.y, r, (o) => {
        if (o.id <= e.id) return false; // each pair once
        let dx = e.pos.x - o.pos.x;
        let dy = e.pos.y - o.pos.y;
        let d2 = dx * dx + dy * dy;
        if (d2 >= r2) return false;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2);
        const k = (0.5 * stiffness * (r - d)) / d;
        e.pos.x += dx * k; e.pos.y += dy * k;
        o.pos.x -= dx * k; o.pos.y -= dy * k;
        return false;
      });
    }
  }
}

/** Random point just outside the current camera view. */
function edgeSpawnPoint(extra = 0) {
  const c = getCamPos();
  const hw = width() / 2 + ENEMY_SPAWN.edgeMargin + extra;
  const hh = height() / 2 + ENEMY_SPAWN.edgeMargin + extra;
  switch (randi(4)) {
    case 0: return vec2(c.x + rand(-hw, hw), c.y - hh); // top
    case 1: return vec2(c.x + rand(-hw, hw), c.y + hh); // bottom
    case 2: return vec2(c.x - hw, c.y + rand(-hh, hh)); // left
    default: return vec2(c.x + hw, c.y + rand(-hh, hh)); // right
  }
}

// ---------------------------------------------------------------------------
// Spawn conditions
// ---------------------------------------------------------------------------

const activeTriggers = new Set();

/** Turn on a named spawn trigger (same as the "enemy-trigger" root event). */
export function fireEnemyTrigger(name) {
  activeTriggers.add(name);
}

/** Turn a named spawn trigger back off. */
export function clearEnemyTrigger(name) {
  activeTriggers.delete(name);
}

function readPlayerStat(name) {
  const player = getPlayer();
  if (!player) return undefined;
  const v = player[name];
  return typeof v === "function" ? v.call(player) : v;
}

/**
 * Evaluate a spawn condition from ENEMY_TYPES[].spawn.when.
 * ctx = { wave, waveTime } (waveTime = seconds since the wave started).
 */
export function checkSpawnCondition(cond, ctx) {
  if (!cond) return true;
  if (cond.all) return cond.all.every((c) => checkSpawnCondition(c, ctx));
  if (cond.any) return cond.any.some((c) => checkSpawnCondition(c, ctx));
  if (cond.not) return !checkSpawnCondition(cond.not, ctx);
  if (cond.fromWave !== undefined) return ctx.wave >= cond.fromWave;
  if (cond.untilWave !== undefined) return ctx.wave <= cond.untilWave;
  if (cond.bossWave !== undefined) return isBossWave(ctx.wave) === cond.bossWave;
  if (cond.after !== undefined) return ctx.waveTime >= cond.after;
  if (cond.before !== undefined) return ctx.waveTime < cond.before;
  if (cond.trigger) return activeTriggers.has(cond.trigger);
  if (cond.playerStat) {
    const v = readPlayerStat(cond.playerStat);
    if (typeof v !== "number") return false; // stat not available (yet)
    return v >= (cond.min ?? -Infinity) && v <= (cond.max ?? Infinity);
  }
  throw new Error(`unknown enemy spawn condition: ${JSON.stringify(cond)}`);
}

// ---------------------------------------------------------------------------
// Director
// ---------------------------------------------------------------------------

/** Spawns up to `count` enemies (fewer if a cap is hit); returns how many. */
/**
 * Formation offsets for n members inside a disc of `radius`, at least
 * `spacing` apart (best effort: relaxes spacing if the disc is too crowded).
 */
function formationOffsets(n, radius, spacing) {
  if (radius <= 0 || n <= 1) return Array.from({ length: n }, () => vec2(0));
  const pts = [];
  let minD = spacing;
  for (let i = 0; i < n; i++) {
    let placed = null;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const cand = Vec2.fromAngle(rand(360)).scale(radius * Math.sqrt(Math.random()));
      if (pts.every((q) => q.dist(cand) >= minD)) placed = cand;
    }
    if (!placed) {
      minD *= 0.8; // too crowded: loosen and retry this member
      i--;
      continue;
    }
    pts.push(placed);
  }
  return pts;
}

/**
 * Send one group of this type (its attack pattern, ENEMY_TYPES[].spawn.group)
 * from a single edge point. Returns how many enemies were spawned.
 */
function spawnGroup(type, level) {
  const g = type.spawn.group ?? { min: 1, max: 1, radius: 0, spacing: 0 };
  const room = Math.min(
    ENEMY_SPAWN.maxAlive - live.size,
    (type.spawn.maxAlive ?? Infinity) - liveEnemyCount(type.id),
  );
  const n = Math.max(0, Math.min(randi(g.min, g.max + 1), room));
  if (n === 0) return 0;
  const base = get("base")[0];
  const center =
    type.spawn.at === "base" && base
      ? base.pos.add(Vec2.fromAngle(rand(360)).scale(type.spawn.distance ?? 400))
      : edgeSpawnPoint(g.radius); // whole group starts off-screen
  const shared = { target: null, nextRetarget: 0 };
  // rotating art (bosses): one sheet per boss wave
  const variant = (Math.max(1, Math.round(currentWave / (ENEMY_WAVES.boss?.every || 1))) - 1) % spritesOf(type).length;
  for (const off of formationOffsets(n, g.radius, g.spacing)) {
    spawnEnemy(center.add(off), level, type.id, {
      group: n > 1 ? shared : null,
      formation: off,
      variant: spritesOf(type).length > 1 ? variant : 0,
    });
  }
  return n;
}

/** Push every visible live enemy within radius of (x, y) away from it. */
function knockback({ x, y, radius, force, damage = 0 } = {}) {
  if (![x, y, radius, force].every(Number.isFinite)) return;
  const r2 = radius * radius;
  for (const e of [...live]) {
    if (e.dead || e.hidden) continue; // hidden = bats waiting off-screen
    const dx = e.pos.x - x;
    const dy = e.pos.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const push = force * (1 - (TYPES[e.type].knockbackResist ?? 0));
    if (push > 0) {
      const dir = d2 > 0.01 ? vec2(dx, dy).unit() : Vec2.fromAngle(rand(360));
      e.knock = dir.scale(push);
    }
    if (damage > 0) {
      e.hurt(damage);
      getTreeRoot().trigger("damage-dealt", { pos: e.pos, amount: damage });
    }
  }
}

/** Remove every enemy (live or dying) without kills or drops. */
export function clearEnemies() {
  for (const e of [...live]) destroy(e);
  for (const e of get("enemy-dying")) destroy(e);
}

/**
 * Start the enemy system for a game scene. Nothing spawns until a wave is
 * started (startWave(n) or the "enemy-start-wave" root event).
 *
 * Returns a controller for HUD/debug/cycle director:
 *   startWave(n?), clear(), wave(), inWave(), timeLeft(), level(),
 *   alive(type?), activeTypes()
 */
export function startEnemyDirector() {
  live.clear();
  for (const t of ENEMY_TYPES) liveByType.set(t.id, 0);
  activeTriggers.clear();
  cachedPlayer = null;

  let wave = 0; // last started wave number
  let inWave = false;
  let waveTime = 0;
  let duration = 0;

  // Per-type schedule, reset every wave. activeFor = seconds this type has
  // been spawning this wave, so its interval ramp starts when it appears.
  const schedules = ENEMY_TYPES.map((type) => ({
    type, active: false, activeFor: 0, untilNext: 0, spawned: 0,
  }));

  const root = getTreeRoot();

  function startWave(n = wave + 1) {
    if (over || golemDown) return; // the run is over (or ending): no more waves
    wave = n;
    inWave = true;
    waveTime = 0;
    waveKills = 0;
    currentWave = n;
    duration = waveDuration(n);
    for (const s of schedules) {
      Object.assign(s, { active: false, activeFor: 0, untilNext: 0, spawned: 0 });
    }
    root.trigger("wave-start", n);
    if (isBossWave(n)) root.trigger("boss-wave", { wave: n });
  }

  function endWave(reason) {
    inWave = false;
    for (const s of schedules) s.active = false;
    if (ENEMY_WAVES.killOnEnd) killAllEnemies();
    root.trigger("wave-end", { wave, reason, kills: waveKills, boss: isBossWave(wave) });
    // warn a wave ahead so the player can shop with intent
    if (isBossWave(wave + 1)) root.trigger("boss-incoming", { wave: wave + 1 });
  }

  root.on("enemy-trigger", fireEnemyTrigger);
  root.on("enemy-trigger-clear", clearEnemyTrigger);
  root.on("enemy-start-wave", (n) => startWave(n ?? wave + 1));
  root.on("enemy-freeze", ({ frozen: on, duration } = {}) => {
    if (!on) {
      freezeLeft = 0;
      setFrozen(false);
      return;
    }
    freezeLeft = Math.max(freezeLeft, Number.isFinite(duration) ? duration : Infinity);
    setFrozen(true);
  });
  root.on("enemy-end-wave", () => {
    if (inWave && !over && !golemDown) endWave("cleared");
  });
  root.on("enemy-clear", clearEnemies);

  // Run over (tower destroyed, or player died in wave 1): everything enemy-side stops where it is.
  // The wave timer freezes at its current value, nothing spawns, enemies
  // (and their animations) freeze in place, no more hits or contact damage,
  // and no further wave can start. wave-end is NOT fired.
  let over = false;
  root.on("enemy-knockback", (k) => !over && knockback(k));
  // The golem fell (tower.js plays its death before "run-over"): stop the
  // wave without a "wave-end" and pouf everything.
  let golemDown = false;
  root.on("golem-dying", () => {
    golemDown = true;
    inWave = false;
    for (const s of schedules) s.active = false;
    killAllEnemies();
  });
  root.on("run-over", () => {
    over = true;
    for (const e of [...live, ...get("enemy-dying")]) e.paused = true;
  });

  onUpdate(() => {
    if (over) return;
    towers = get("tower");
    auras = get("aura");
    refreshTargets();
    buildGrid();
    separateEnemies();
    resolveProjectileHits();
    if (frozen) {
      // frozen enemies can be hit but don't hurt anyone; spawns + timer go on
      freezeLeft -= dt();
      if (freezeLeft <= 0) {
        freezeLeft = 0;
        setFrozen(false);
      }
    } else {
      resolvePlayerContact();
      resolveTowerContact();
    }
    if (!inWave) return;

    waveTime += dt();
    const level = enemyLevelForWave(wave);
    const ctx = { wave, waveTime };

    for (const s of schedules) {
      const sp = s.type.spawn;
      s.active = checkSpawnCondition(sp.when, ctx);
      if (!s.active) continue;
      if (sp.once) {
        // one group per wave (the boss); retried every frame if there's no room
        if (s.spawned === 0) s.spawned += spawnGroup(s.type, level);
        continue;
      }

      s.activeFor += dt();
      s.untilNext -= dt();
      if (s.untilNext > 0) continue;

      s.untilNext = spawnInterval(s.type, wave, s.activeFor);
      s.spawned += spawnGroup(s.type, level);
    }

    // Boss wave: no timer, it ends as soon as the boss is down (minions die
    // with it). Other waves: survived when the timer runs out.
    const bossDown = isBossWave(wave) && schedules.some(
      (s) => isBossType(s.type) && s.spawned > 0 && liveEnemyCount(s.type.id) === 0,
    );
    if (bossDown || waveTime >= duration) endWave("cleared");
  });

  return {
    startWave,
    clear: clearEnemies,
    wave: () => wave,
    inWave: () => inWave,
    isOver: () => over,
    isBossWave: () => isBossWave(wave),
    timeLeft: () => (inWave ? Math.max(0, duration - waveTime) : 0),
    level: () => enemyLevelForWave(Math.max(1, wave)),
    alive: liveEnemyCount,
    activeTypes: () => schedules.filter((s) => s.active).map((s) => s.type.id),
  };
}
