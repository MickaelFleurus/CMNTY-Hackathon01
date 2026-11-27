// Central tuning constants. Each system owns its own namespaced section —
// append yours below, don't edit other sections without a note in your PR.

// ---------------------------------------------------------------------------
// Enemies (owner: Mickael — src/systems/enemies.js)
// ---------------------------------------------------------------------------
// Shared by every enemy type.
export const ENEMY = {
  // Soft spacing, not real collisions: enemies may overlap, they're just
  // nudged apart. PERF: keep radius >= ~16. Below that the horde packs into
  // a few collision cells and KAPLAY's broadphase collapses (3-6 fps at 300).
  separationRadius: 18, // px — enemies closer than this get nudged apart
  separationStiffness: 0.6, // 0..1 share of the overlap resolved per pass
  separationPasses: 2, // relaxation passes per frame (more = firmer crowd, more CPU)

  // Contact attack: damage applied to the player while touching, at most
  // once per cooldown per enemy.
  attackCooldown: 0.8, // seconds

  // Despawn enemies that drift this far from the player (they get respawned
  // at the edge by the director, keeping the horde around you).
  despawnDistance: 1600,
};

// Enemy types. Each has its own stats, spawn schedule and spawn condition.
//
//   sprite      file in gfx/SurvivorsStarterKit_v1.0/Enemies/ (all 16x16 sheets)
//   baseHp / baseDamage   stats at enemy level 1 (scaled by ENEMY_LEVEL)
//   speed       px/s chase speed
//   tierMinHp   optional per-type HP thresholds for ENEMY_TIERS colors
//   drops       optional per-type drop table (defaults to ENEMY_DROPS)
//   spawn:
//     startInterval / minInterval / intervalDecayPerSec
//                 seconds between spawn ticks; the ramp starts when the type
//                 first becomes active, not at t=0
//     batch, batchPerLevel   enemies per tick = batch + floor(batchPerLevel*(lvl-1))
//     cluster     px; if set, a batch spawns together around one edge point (swarm)
//     maxAlive    per-type cap (the global ENEMY_SPAWN.maxAlive still applies)
//     when        spawn condition, checked every frame (omit = always):
//       { after: s }  /  { before: s }          elapsed survival time
//       { playerStat: "level", min, max }       reads player.level or player.level()
//       { trigger: "name" }                     set by an external event, see enemies.js
//       { all: [...] } / { any: [...] } / { not: cond }
export const ENEMY_TYPES = [
  {
    id: "zombie",
    sprite: "Enemy_Zombie.png",
    scale: 2,
    baseHp: 3,
    baseDamage: 5,
    speed: 70,
    spawn: {
      startInterval: 1.2,
      minInterval: 0.15,
      intervalDecayPerSec: 0.004,
      batch: 1,
      batchPerLevel: 0.5,
      maxAlive: 300,
    },
  },
  {
    // Fast, fragile swarmer: arrives in flocks, weak hits, drops less often.
    id: "bat",
    sprite: "Enemy_Bat.png",
    scale: 2,
    baseHp: 1,
    baseDamage: 2,
    speed: 135,
    tierMinHp: [0, 2, 4, 7, 10],
    drops: [
      { kind: "xp-blue", base: 0.25, perLevel: 0, max: 0.25, value: 1 },
      { kind: "xp-green", base: 0.03, perLevel: 0.005, max: 0.1, value: 3 },
    ],
    spawn: {
      startInterval: 7,
      minInterval: 2.5,
      intervalDecayPerSec: 0.01,
      batch: 5,
      batchPerLevel: 0.3,
      cluster: 50,
      maxAlive: 120,
      // After 45s, or as soon as the player reaches level 3, or when another
      // system fires the "bat-swarm" trigger (e.g. a night event).
      when: {
        any: [
          { after: 45 },
          { playerStat: "level", min: 3 },
          { trigger: "bat-swarm" },
        ],
      },
    },
  },
];

// Enemy level rises over time. An enemy keeps the level it spawned with.
export const ENEMY_LEVEL = {
  secondsPerLevel: 30, // +1 enemy level every 30s of survival
  maxLevel: 50,
  hpGrowth: 0.35, // hp = baseHp * (1 + hpGrowth * (level - 1))
  damageGrowth: 0.2, // damage = baseDamage * (1 + damageGrowth * (level - 1))
};

// Color-swap tiers: picked from the enemy's max HP when it spawns. The
// highest tier whose minHp <= hp wins. Hotter color = tougher enemy, and its
// XP drops are multiplied by xpMult (on top of the per-level XP scaling).
// tint = target hue (RGB), amount = 0..1 how strongly the art is recolored.
// minHp below is the default (tuned for zombies: tier 2 ≈ 1:30, tier 3 ≈ 4:30,
// tier 4 ≈ 8:30, tier 5 ≈ 13:00); a type can override it with tierMinHp.
export const ENEMY_TIERS = [
  { minHp: 0, tint: null, amount: 0, xpMult: 1 }, // base art
  { minHp: 6, tint: [255, 220, 60], amount: 0.75, xpMult: 1.5 }, // yellow
  { minHp: 12, tint: [255, 140, 30], amount: 0.8, xpMult: 2 }, // orange
  { minHp: 20, tint: [255, 50, 40], amount: 0.85, xpMult: 3 }, // red
  { minHp: 30, tint: [255, 245, 220], amount: 0.9, xpMult: 5 }, // white-hot
];

// Spawn director (global): per-type schedules live in ENEMY_TYPES.
export const ENEMY_SPAWN = {
  maxAlive: 300, // hard cap on live enemies of all types (perf)
  edgeMargin: 48, // px beyond the screen edge to spawn at
};

// Default drop table (types can override with `drops`), rolled once per kill. Entries are checked in order with a
// single random roll, so at most ONE drop per enemy; whatever probability is
// left over means "no drop". chance(level) = min(max, base + perLevel*(level-1)).
// Listeners get { kind, pos, level, tier, type, value } via on("drop", "enemy", ...).
export const ENEMY_DROPS = [
  { kind: "xp-blue", base: 0.45, perLevel: -0.01, max: 0.45, value: 1 },
  { kind: "xp-green", base: 0.08, perLevel: 0.01, max: 0.25, value: 3 },
  { kind: "xp-red", base: 0.0, perLevel: 0.005, max: 0.1, value: 10 },
  { kind: "heart", base: 0.01, perLevel: 0.0, max: 0.01, value: 0 },
];
