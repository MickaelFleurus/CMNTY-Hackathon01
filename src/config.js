// Central tuning constants. Each system owns its own namespaced section —
// append yours below, don't edit other sections without a note in your PR.

// ---------------------------------------------------------------------------
// Enemies (owner: Mickael — src/systems/enemies.js)
// ---------------------------------------------------------------------------
export const ENEMY = {
  sprite: "zombie",
  scale: 2, // 16px art drawn at 32px
  speed: 70, // px/s chase speed (constant for now; level scales HP + damage)
  separationForce: 60, // px/s push away from overlapping enemies

  // Base stats at enemy level 1
  baseHp: 3,
  baseDamage: 5,

  // Contact attack: damage applied to the player while touching, at most
  // once per cooldown per enemy.
  attackCooldown: 0.8, // seconds

  // Despawn enemies that drift this far from the player (they get respawned
  // at the edge by the director, keeping the horde around you).
  despawnDistance: 1600,
};

// Enemy level rises over time. An enemy keeps the level it spawned with.
export const ENEMY_LEVEL = {
  secondsPerLevel: 30, // +1 enemy level every 30s of survival
  maxLevel: 50,
  hpGrowth: 0.35, // hp = baseHp * (1 + hpGrowth * (level - 1))
  damageGrowth: 0.2, // damage = baseDamage * (1 + damageGrowth * (level - 1))
};

// Spawn director: spawns just outside the visible screen, faster over time.
export const ENEMY_SPAWN = {
  startInterval: 1.2, // seconds between spawns at t=0
  minInterval: 0.15, // floor for the spawn interval
  intervalDecayPerSec: 0.004, // interval shrinks by this many seconds per second survived
  batchPerLevel: 0.5, // extra enemies per spawn tick per enemy level (floored)
  maxAlive: 300, // hard cap on live enemies
  edgeMargin: 48, // px beyond the screen edge to spawn at
};

// Drop table, rolled once per kill. Entries are checked in order with a
// single random roll, so at most ONE drop per enemy; whatever probability is
// left over means "no drop". chance(level) = min(max, base + perLevel*(level-1)).
// Listeners get { kind, pos, level, value } via on("drop", "enemy", ...).
export const ENEMY_DROPS = [
  { kind: "xp-blue", base: 0.45, perLevel: -0.01, max: 0.45, value: 1 },
  { kind: "xp-green", base: 0.08, perLevel: 0.01, max: 0.25, value: 3 },
  { kind: "xp-red", base: 0.0, perLevel: 0.005, max: 0.1, value: 10 },
  { kind: "heart", base: 0.01, perLevel: 0.0, max: 0.01, value: 0 },
];
