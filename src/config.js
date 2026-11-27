// Central tuning constants. Each system owns its own namespaced section —
// append yours below, don't edit other sections without a note in your PR.

// ---------------------------------------------------------------------------
// Enemies (owner: Mickael — src/systems/enemies.js)
// ---------------------------------------------------------------------------
// Shared by every enemy type.
export const ENEMY = {
  // Enemies are NOT in KAPLAY's collision system; enemies.js does its own
  // grid-based hit tests (projectiles + player contact). See enemies.js header.
  gridCell: 32, // px, spatial grid cell for hit tests
  defaultProjectileRadius: 6, // px, for projectiles with no hitRadius / area
  defaultPlayerRadius: 12, // px, if the player has no area()

  // Each enemy chases a random point within this many px of the player, so
  // the overlapping horde fans out a bit instead of stacking on one pixel.
  chaseOffset: 18,

  // Optional soft spacing between enemies. 0 = off (enemies overlap freely).
  // Try ~16-22 for a spread-out crowd; costs a little CPU.
  separationRadius: 0,
  separationStiffness: 0.6, // 0..1 share of the overlap resolved per pass
  separationPasses: 2, // relaxation passes per frame

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
//   hitRadius   px, hit circle for projectiles / player contact
//   baseHp / baseDamage   stats at enemy level 1 (scaled by ENEMY_LEVEL)
//   speed       px/s chase speed
//   tierMinHp   optional per-type HP thresholds for ENEMY_TIERS colors
//   drops       optional per-type drop table (defaults to ENEMY_DROPS)
//   spawn:
//     count       { base, perWave }: how many this type spawns in total in a
//                 wave (its budget) = base + floor(perWave * (wave - 1))
//     startInterval / minInterval / intervalDecayPerSec
//                 seconds between spawn ticks within a wave; the ramp restarts
//                 each wave, from when the type becomes active
//     batch, batchPerLevel   enemies per tick = batch + floor(batchPerLevel*(lvl-1))
//     cluster     px; if set, a batch spawns together around one edge point (swarm)
//     maxAlive    per-type cap (the global ENEMY_SPAWN.maxAlive still applies)
//     when        spawn condition, checked every frame (omit = every wave):
//       { fromWave: n } / { untilWave: n }      wave number
//       { after: s }  /  { before: s }          seconds since the wave started
//       { playerStat: "level", min, max }       reads player.level or player.level()
//       { trigger: "name" }                     set by an external event, see enemies.js
//       { all: [...] } / { any: [...] } / { not: cond }
export const ENEMY_TYPES = [
  {
    id: "zombie",
    sprite: "Enemy_Zombie.png",
    scale: 2,
    hitRadius: 11, // px, body hit circle (sprite is 32px drawn)
    baseHp: 3,
    baseDamage: 5,
    speed: 70,
    spawn: {
      count: { base: 40, perWave: 15 },
      startInterval: 1.2,
      minInterval: 0.15,
      intervalDecayPerSec: 0.004,
      batch: 1,
      batchPerLevel: 0.5,
      maxAlive: 175, // per-type caps sum to ENEMY_SPAWN.maxAlive so late types are never starved
    },
  },
  {
    // Fast, fragile swarmer: arrives in flocks, weak hits, drops less often.
    id: "bat",
    sprite: "Enemy_Bat.png",
    scale: 2,
    hitRadius: 9,
    baseHp: 1,
    baseDamage: 2,
    speed: 135,
    tierMinHp: [0, 2, 4, 7, 10],
    drops: [
      { kind: "xp-blue", base: 0.25, perLevel: 0, max: 0.25, value: 1 },
      { kind: "xp-green", base: 0.03, perLevel: 0.005, max: 0.1, value: 3 },
    ],
    spawn: {
      count: { base: 15, perWave: 8 },
      startInterval: 7,
      minInterval: 2.5,
      intervalDecayPerSec: 0.01,
      batch: 5,
      batchPerLevel: 0.3,
      cluster: 50,
      maxAlive: 100,
      // From wave 2, or as soon as the player reaches level 3, or when another
      // system fires the "bat-swarm" trigger (e.g. a night event).
      when: {
        any: [
          { fromWave: 2 },
          { playerStat: "level", min: 3 },
          { trigger: "bat-swarm" },
        ],
      },
    },
  },
  {
    // Slow, tough tank: rare, hits hard, rewarding to kill.
    id: "golem",
    sprite: "Enemy_Crystal_Golem.png",
    scale: 3, // bigger than the rest (48px)
    hitRadius: 16,
    baseHp: 15,
    baseDamage: 12,
    speed: 40,
    // HP 15 → 41 (lvl 6) → 73 (lvl 12) → 115 (lvl 20) → 167 (lvl 30)
    tierMinHp: [0, 40, 70, 110, 160],
    drops: [
      { kind: "xp-green", base: 0.5, perLevel: 0, max: 0.5, value: 3 },
      { kind: "xp-red", base: 0.15, perLevel: 0.005, max: 0.3, value: 10 },
      { kind: "heart", base: 0.05, perLevel: 0, max: 0.05, value: 0 },
    ],
    spawn: {
      count: { base: 2, perWave: 1 },
      startInterval: 12,
      minInterval: 5,
      intervalDecayPerSec: 0.02,
      batch: 1,
      batchPerLevel: 0.1,
      maxAlive: 25,
      // From wave 3, or once the player reaches level 5.
      when: { any: [{ fromWave: 3 }, { playerStat: "level", min: 5 }] },
    },
  },
];

// Waves: each wave spawns every active type's budget (ENEMY_TYPES[].spawn.count)
// and ends when it's cleared (all spawned + all killed) or its timer runs out.
export const ENEMY_WAVES = {
  baseDuration: 60, // s, wave 1 timer
  durationPerWave: 10, // s added per wave
  maxDuration: 150, // s
  minClearTime: 3, // s, a wave can't count as cleared before this
};

// Enemy level comes from the wave number. An enemy keeps its spawn level.
export const ENEMY_LEVEL = {
  levelsPerWave: 2, // wave n enemies are level 1 + 2*(n-1)
  maxLevel: 50,
  hpGrowth: 0.35, // hp = baseHp * (1 + hpGrowth * (level - 1))
  damageGrowth: 0.2, // damage = baseDamage * (1 + damageGrowth * (level - 1))
};

// Color-swap tiers: picked from the enemy's max HP when it spawns. The
// highest tier whose minHp <= hp wins. Hotter color = tougher enemy, and its
// XP drops are multiplied by xpMult (on top of the per-level XP scaling).
// tint = target hue (RGB), amount = 0..1 how strongly the art is recolored.
// minHp below is the default (tuned for zombies: yellow from wave 3, orange
// wave 6, red wave 10, white-hot wave 15); a type can override it with tierMinHp.
export const ENEMY_TIERS = [
  { minHp: 0, tint: null, amount: 0, xpMult: 1 }, // base art
  { minHp: 6, tint: [255, 220, 60], amount: 0.75, xpMult: 1.5 }, // yellow
  { minHp: 12, tint: [255, 140, 30], amount: 0.8, xpMult: 2 }, // orange
  { minHp: 20, tint: [255, 50, 40], amount: 0.85, xpMult: 3 }, // red
  { minHp: 30, tint: [255, 245, 220], amount: 0.9, xpMult: 5 }, // white-hot
];

// Spawn director (global): per-type schedules live in ENEMY_TYPES.
export const ENEMY_SPAWN = {
  // Hard cap on live enemies of all types (perf). Keep the per-type
  // ENEMY_TYPES[].spawn.maxAlive values summing to this (175 + 100 + 25), or
  // the first type to fill up starves the ones that unlock later.
  maxAlive: 300,
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

// ---------------------------------------------------------------------------
// Player + weapon + map (owner: Akram — src/systems/{player,weapons,map}.js)
// ---------------------------------------------------------------------------
export const CFG = {
  viewport: { width: 1280, height: 720 },

  player: {
    speed: 220, // px/s
    maxHp: 100,
    scale: 2, // sprite scale (16px art -> 32px on screen)
  },

  weapon: {
    fireInterval: 1.0, // seconds between pistol shots
    projectileSpeed: 480, // px/s
    damage: 10,
    range: 360, // px — acquire nearest enemy within this distance
  },

  map: {
    // "infinite" gray zone: tiles are repositioned around the camera each frame
    tileSize: 16, // source art is 16px; scaled by map.tileScale below
    tileScale: 3, // 16px art -> 48px on screen
    gridW: 30, // tiles across the visible band
    gridH: 18, // tiles down the visible band
  },

  joystick: {
    baseRadius: 60,
    knobRadius: 28,
    maxDrag: 56, // px from base center at which knob reads full input
  },
};

// ---------------------------------------------------------------------------
// Camera + grid background (owner: Mickael — src/systems/{camera,background}.js)
// ---------------------------------------------------------------------------
export const CAMERA = {
  // How fast the camera catches up with its target (1/s, frame-rate
  // independent exponential smoothing). Higher = tighter follow.
  followRate: 10,
  // Look ahead of the player in the direction they're moving, so there's
  // more room to see what you're walking into.
  lookahead: 70, // px
  // How fast the lookahead swings to a new direction (1/s). Low = the small,
  // smooth drift when the player changes direction.
  lookaheadRate: 3,
};

export const GRID_BG = {
  color: [222, 226, 233], // light page
  cell: 32, // px between minor lines
  minorColor: [205, 210, 219],
  majorEvery: 5, // every Nth line is a major line (160px blocks)
  majorColor: [184, 191, 203],
  lineWidth: 1, // px (major lines are drawn 2px)
};
