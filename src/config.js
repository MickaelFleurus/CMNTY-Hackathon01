// Central tuning constants. Each system owns its own namespaced section -
// append yours below, don't edit other sections without a note in your PR.

// ---------------------------------------------------------------------------
// Enemies (owner: Mickael - src/systems/enemies.js)
// ---------------------------------------------------------------------------
// Shared by every enemy type.
export const ENEMY = {
  // Enemies are NOT in KAPLAY's collision system; enemies.js does its own
  // grid-based hit tests (projectiles + player contact). See enemies.js header.
  gridCell: 32, // px, spatial grid cell for hit tests
  defaultProjectileRadius: 6, // px, for projectiles with no hitRadius / area
  defaultPlayerRadius: 12, // px, if the player has no area()
  // The tower (base) is solid for enemies: they're pushed out of its box so
  // none can hide behind the golem sprite. They attack it from the edge, when
  // their body is within this many px of the box.
  towerContactSlack: 4, // px
  // The golem isn't hit per attack: its HP DRAINS smoothly while enemies
  // touch it, in STEPS. Each touching enemy is worth some "points"
  // (ENEMY_TYPES[].pressure: zombie/bat 1, crystal golem 4, boss 8 → 12,
  // + perTier per color tier). Points 1-3 = step 1, 4-7 = step 2, 8-11 =
  // step 3… (one more step every pointsPerStep); drain = step x hpPerStep
  // HP/s. No enemy on it = no drain. The drained total is reported every
  // reportInterval s (damage numbers).
  towerDrain: { pointsPerStep: 4, hpPerStep: 2, reportInterval: 0.5 },

  // Each enemy chases a random point within this many px of the player, so
  // the overlapping horde fans out a bit instead of stacking on one pixel.
  chaseOffset: 18,
  // Groups keep their formation while farther than this from their target,
  // then close up linearly so every member reaches it (and can hit).
  formationHoldDistance: 220, // px

  // Move-animation speed follows how fast the enemy actually moves:
  // animSpeed = actual speed / refSpeed, clamped to [idle, max], eased.
  // So bats flap faster than zombies, golems lumber, enemies slowed by an aura
  // animate slower, and enemies standing still (attacking) idle gently.
  anim: {
    refSpeed: 70, // px/s that plays the art at its normal 8 fps (zombie speed)
    idle: 0.35, // multiplier when standing still
    max: 2.2,
    easeRate: 8, // 1/s, how fast it adapts
  },

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

  // Knockback ("enemy-knockback" event): the push speed decays by this rate
  // per second (travel ≈ force / knockbackDecay px); the enemy doesn't chase
  // until its push speed drops below knockbackStop px/s. A type can resist
  // with knockbackResist (0 = full push, 1 = immovable).
  knockbackDecay: 5,
  knockbackStop: 40,
};

// Enemy types. Each has its own stats, spawn schedule and spawn condition.
//
//   sprite      file in gfx/SurvivorsStarterKit_v1.0/Enemies/ (all 16x16 sheets)
//   hitRadius   px, hit circle for projectiles / player contact
//   baseHp / baseDamage   stats at enemy level 1 (scaled by ENEMY_LEVEL)
//   speed       px/s chase speed
//   tierMinHp   optional per-type HP thresholds for ENEMY_TIERS colors
//   drops       optional per-type drop table (defaults to ENEMY_DROPS)
//   spawn:      no per-wave budget: a type keeps sending groups at its rate
//               until the wave timer runs out (ENEMY_WAVES.rate)
//     startInterval / minInterval / intervalDecayPerSec
//                 seconds between GROUP spawns within a wave; the ramp restarts
//                 each wave, from when the type becomes active. The result is
//                 then multiplied by the wave multiplier (ENEMY_WAVES.rate), so
//                 every wave spawns faster than the last.
//     once        spawn a single group per wave (the boss), as soon as active
//   sheet       optional "boss": 32 px cells, rows Move/Attack/Hit/Death (default:
//               16 px enemy sheet, rows Move/Hit/Death)
//   sprites     optional list of sheets to rotate through (one per boss wave)
//   hpBar       draw an HP bar + name above it
//   rewardCoins extra coin drops on death (bosses)
//   behavior    optional; default: chase a target (player or tower).
//               { kind: "siege", provokeDuration }: attacks the tower and
//               ignores the player, until the PLAYER damages it: then it
//               chases the player for provokeDuration s (tower shots don't
//               provoke it).
//               { kind: "sweep", returnDelay, aimSpread, exitMargin }: fly
//               straight across the screen (aimed within aimSpread px of its
//               center), leave it by exitMargin px, wait returnDelay s, then
//               sweep back. Ignores player/tower as targets and flies over the
//               golem (no collision), but hurts the player and the tower it
//               touches on the way.
//     group       attack pattern: each spawn tick sends ONE group of
//                 min..max enemies (random) from one edge point, laid out in a
//                 formation of `radius` px with at least `spacing` px between
//                 members. The group keeps its formation while travelling,
//                 closes up near its target (ENEMY.formationHoldDistance), and
//                 shares one target (player or tower).
//     maxAlive    per-type cap (the global ENEMY_SPAWN.maxAlive still applies)
//     at          optional "base": spawn `distance` px from the base instead of
//                 at the screen edge
//     when        spawn condition, checked every frame (omit = every wave):
//       { fromWave: n } / { untilWave: n }      wave number
//       { bossWave: true | false }              wave is (not) a boss wave
//       { after: s }  /  { before: s }          seconds since the wave started
//       { playerStat: "level", min, max }       reads player.level or player.level()
//       { trigger: "name" }                     set by an external event, see enemies.js
//       { all: [...] } / { any: [...] } / { not: cond }
// Rare bonus drop (docs/game-design-v2.md → "Rare bonus drops", bonus.js):
// checked FIRST in each drop table below, so when it hits it REPLACES the
// normal drop (still one drop per kill). Which bonus it is: BONUS_DROPS.
const BONUS_DROP_ROW = { kind: "bonus", base: 0.005, perLevel: 0, max: 0.005, value: 0 };

export const ENEMY_TYPES = [
  {
    id: "zombie",
    pressure: { base: 1, perTier: 1 }, // golem drain points (yellow 2, orange 3…)
    sprite: "Enemy_Zombie.png",
    scale: 2,
    hitRadius: 11, // px, body hit circle (sprite is 32px drawn)
    baseHp: 3,
    baseDamage: 5,
    speed: 70,
    spawn: {
      startInterval: 6,
      minInterval: 2,
      intervalDecayPerSec: 0.03,
      // groups of 3-6, fairly spaced out
      group: { min: 3, max: 6, radius: 90, spacing: 40 },
      maxAlive: 175, // per-type caps sum to ENEMY_SPAWN.maxAlive so late types are never starved
    },
  },
  {
    // Fast, fragile swarmer: arrives in flocks, weak hits, drops less often.
    id: "bat",
    pressure: { base: 1, perTier: 1 },
    sprite: "Enemy_Bat.png",
    scale: 2,
    hitRadius: 9,
    baseHp: 1,
    baseDamage: 2,
    speed: 135,
    tierMinHp: [0, 2, 4, 7, 10],
    // Swarms sweep across the screen and come back; they don't target anyone.
    behavior: { kind: "sweep", returnDelay: 3, aimSpread: 160, exitMargin: 60 },
    drops: [
      BONUS_DROP_ROW,
      { kind: "xp-blue", base: 0.25, perLevel: 0, max: 0.25, value: 1 },
      { kind: "xp-green", base: 0.03, perLevel: 0.005, max: 0.1, value: 3 },
      { kind: "coin", base: 0.2, perLevel: 0, max: 0.2, value: 0 },
    ],
    spawn: {
      startInterval: 9,
      minInterval: 4,
      intervalDecayPerSec: 0.02,
      // one big, tightly packed swarm of 9-14
      group: { min: 9, max: 14, radius: 30, spacing: 10 },
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
    knockbackResist: 0.5, // heavy: pushed half as far
    pressure: { base: 4, perTier: 1 },
    hitRadius: 16,
    baseHp: 45, // a lot of HP: 15x a zombie
    baseDamage: 12,
    speed: 40,
    // HP 45 → 108 (wave 3) → 202 (wave 6) → 344 (wave 10) → 501 (wave 15)
    tierMinHp: [0, 120, 210, 330, 480],
    drops: [
      BONUS_DROP_ROW,
      { kind: "xp-green", base: 0.5, perLevel: 0, max: 0.5, value: 3 },
      { kind: "xp-red", base: 0.15, perLevel: 0.005, max: 0.3, value: 10 },
      { kind: "heart", base: 0.05, perLevel: 0, max: 0.05, value: 0 },
      { kind: "coin", base: 0.25, perLevel: 0, max: 0.25, value: 0 },
    ],
    spawn: {
      startInterval: 12,
      minInterval: 5,
      intervalDecayPerSec: 0.02,
      // always alone
      group: { min: 1, max: 1, radius: 0, spacing: 0 },
      maxAlive: 25,
      // From wave 3, or once the player reaches level 5.
      when: { any: [{ fromWave: 3 }, { playerStat: "level", min: 5 }] },
    },
  },
  {
    // Boss (every ENEMY_WAVES.boss.every waves): a siege boss that spawns near
    // the base, attacks it and ignores the player until provoked.
    id: "boss",
    sheet: "boss",
    knockbackResist: 0.75, // barely moves
    pressure: { base: 8, fromSecondBoss: 12 }, // golem drain points
    sprites: [
      "Boss_Slime_King.png",
      "Boss_Vampire_Lord.png",
      "Boss_Reaper.png",
      "Boss_Demon_Lord.png",
      "Boss_Treant.png",
    ],
    scale: 3, // 32 px art -> 96 px
    hitRadius: 36,
    baseHp: 150, // 360 at wave 3, 675 at wave 6, 1050 at wave 9
    baseDamage: 8, // 14 per hit at wave 3
    speed: 45,
    tierMinHp: [0, Infinity, Infinity, Infinity, Infinity], // keep the boss art
    hpBar: true,
    behavior: { kind: "siege", provokeDuration: 5 },
    drops: [{ kind: "xp-purple", base: 1, perLevel: 0, max: 1, value: 25 }],
    rewardCoins: 15, // extra coin drops on death
    spawn: {
      once: true, // one boss, right at the start of the wave
      group: { min: 1, max: 1, radius: 0, spacing: 0 },
      maxAlive: 1,
      at: "base",
      distance: 420, // px from the base
      when: { bossWave: true },
    },
  },
];

// Waves: every active type spawns groups at its rate until the wave timer runs
// out (the wave is then survived: "wave-end" reason "cleared"). No budget, so
// killing everything doesn't end a wave early.
export const ENEMY_WAVES = {
  baseDuration: 60, // s, wave 1 timer
  durationPerWave: 10, // s added per wave
  maxDuration: 150, // s

  // Spawn rate ramp across waves: every type's spawn interval is multiplied
  // by perWave^(wave-1), never below minMult. 0.88 → wave 2 spawns ~14%
  // faster than wave 1, wave 5 ~1.7x, wave 9 ~2.8x, wave 12+ 4x (the floor).
  // Per-type maxAlive caps (and ENEMY_SPAWN.maxAlive) still apply on top.
  rate: { perWave: 0.88, minMult: 0.25 },

  // Every `every`-th wave is a boss wave: ENEMY_TYPES with when { bossWave }
  // spawn, the other types spawn at minionRateMult of their usual rate, and
  // there's no timer: the wave ends when the boss is defeated (leftover
  // minions die with it).
  boss: { every: 3, minionRateMult: 0.5 },
  // When a wave ends (or the golem falls), remaining enemies vanish in a puff
  // of smoke ("pouf": no drops, not counted as kills). false = they keep
  // chasing until "enemy-clear".
  killOnEnd: true,
  poufTime: 0.4, // s, the smoke puff left where each enemy vanished
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

// Default drop table (types can override with `drops`), rolled once per kill.
// A kill gives AT MOST ONE thing: XP, a heart, coins, or nothing. "coin"
// drops are spawned by base.js, which sets the amount (SHOP.coins); their
// `value` here is unused. Entries are checked in order with a
// single random roll, so at most ONE drop per enemy; whatever probability is
// left over means "no drop". chance(level) = min(max, base + perLevel*(level-1)).
// Listeners get { kind, pos, level, tier, type, value } via on("drop", "enemy", ...).
export const ENEMY_DROPS = [
  BONUS_DROP_ROW,
  { kind: "xp-blue", base: 0.45, perLevel: -0.01, max: 0.45, value: 1 },
  { kind: "xp-green", base: 0.08, perLevel: 0.01, max: 0.25, value: 3 },
  { kind: "xp-red", base: 0.0, perLevel: 0.005, max: 0.1, value: 10 },
  { kind: "heart", base: 0.01, perLevel: 0.0, max: 0.01, value: 0 },
  { kind: "coin", base: 0.35, perLevel: 0, max: 0.35, value: 0 },
];

// ---------------------------------------------------------------------------
// Player + weapon + map (owner: Akram - src/systems/{player,weapons,map}.js)
// ---------------------------------------------------------------------------

// Design resolution. Desktop keeps the widescreen 1280x720 letterbox; phones
// held upright get a 720x1280 swap so the game fills the tall screen instead
// of letterboxing a tiny widescreen strip. Read once before kaplay() init
// (src/main.js) - it must stay fixed for the whole run, kaplay sizes its
// canvas from it at boot.
function pickViewport() {
  const portrait =
    typeof window !== "undefined" &&
    window.innerWidth < window.innerHeight &&
    window.innerWidth < 900; // narrow enough to be phone-like
  return portrait
    ? { width: 720, height: 1280, portrait: true }
    : { width: 1280, height: 720, portrait: false };
}

export const CFG = {
  viewport: pickViewport(),

  player: {
    speed: 220, // px/s
    maxHp: 60, // was 100: more fragile, so positioning matters
    // After an enemy hit the player can't be hit again for this long, and
    // blinks (src/systems/invuln.js). Stops a crowd from landing every hit
    // in the same instant.
    invulnTime: 1.0, // s
    respawnInvulnTime: 2.0, // s of protection right after a respawn
    invulnBlinkHz: 10, // blinks per second while invulnerable
    scale: 2, // sprite scale (16px art -> 32px on screen)
    // Draw layer: above every world object (ground -10, auras -5, enemies 0,
    // coins 4, base 5, portal/projectiles 6) so the player is never hidden,
    // below overlays (HP bars / shield 50, floating text 60, UI 100).
    z: 40,
  },

  // Pistol (src/systems/weapons.js, card "weapon-pistol"): shoots the nearest
  // enemy. Every level: +damagePerLevel. Path: Lv2 +1 bullet → Lv3 faster
  // fire → Lv4 +1 bullet → Lv5 faster fire.
  weapon: {
    fireInterval: 1.0, // seconds between pistol shots
    projectileSpeed: 480, // px/s
    damage: 10,
    damagePerLevel: 3,
    range: 360, // px - acquire nearest enemy within this distance
    spread: 0.2, // radians between bullets of one shot (Lv2+)
    fasterFire: 0.8, // fire interval x this at Lv3 and again at Lv5
  },

  map: {
    // "infinite" gray zone: tiles are repositioned around the camera each frame
    tileSize: 16, // source art is 16px; scaled by map.tileScale below
    tileScale: 3, // 16px art -> 48px on screen
    gridW: 30, // tiles across the visible band
    gridH: 18, // tiles down the visible band
    // Decor from row 1 of Tiles_Grass (flowers, rock, mushroom; the green
    // blob is never used). Picked per world tile, so a spot never changes.
    decor: {
      flowerChance: 0.015, // sporadic lone flowers, per tile
      rockChance: 0.012,
      mushroomChance: 0.008,
      // Circular flower clusters: the world is cut into cells of clusterCell
      // tiles; each holds a cluster with clusterChance, radius in tiles
      // between clusterRadius[0] and [1]. Flower density falls from
      // clusterDensity[0] at the center to [1] at the edge.
      clusterCell: 12,
      clusterChance: 0.4,
      clusterRadius: [1.6, 3.4],
      clusterDensity: [0.9, 0.35],
    },
  },

  joystick: {
    baseRadius: 60,
    knobRadius: 28,
    maxDrag: 56, // px from base center at which knob reads full input
  },
};

// ---------------------------------------------------------------------------
// Camera (owner: Mickael - src/systems/camera.js)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Base + shop + portal (owner: Akram - src/systems/{base,shop,portal}.js)
// ---------------------------------------------------------------------------
export const SHOP = {
  // Where the base sits (world px). makePlayer() spawns at the same spot.
  home: { x: 640, y: 360 },
  spriteScale: 4, // 32px boss art -> 128px structure

  coins: {
    perKill: 1, // coins granted per enemy kill
    perLevelBonus: 0.25, // extra coins per enemy level (floored)
    // px at which coins fly to the player: barely more than collectRadius at
    // the start (you walk onto them); each Magnet card adds UPGRADE.magnetBonus
    magnetRadius: 32,
    collectRadius: 24, // px at which a coin is collected
    flySpeed: 420, // px/s while flying to the player
    lifetime: 30, // s before an uncollected coin vanishes
  },

  // The four shop options (2x2 grid, one pick per cycle - see
  // docs/game-design-v2.md). The shop only SELLS: on purchase it fires
  // "shop-pick" with { id, quadrant, level, params } and the effect systems
  // (auras/regen/tower - tasks-v2 #3) apply them. params are opaque data.
  // Skip the shop without buying (the next wave starts as after a pick).
  skipKeys: ["e", "escape"],

  // Golem upgrade price (docs/game-design-v2.md → "Upgrade cost"): ONE shared
  // counter for every branch, cost = baseCost × costGrowth ^ upgradesOwned.
  // (The per-option baseCost / costGrowth below are no longer used.)
  upgradeCost: { baseCost: 10, costGrowth: 1.5 },
  // Skill tree screen layout (shop.js), screen px
  tree: { colWidth: 250, colGap: 26, headerY: 124, nodesTop: 260, nodesBottom: 580, nodeRadius: 16, skipY: 650 },

  options: [
    {
      id: "armor-aura",
      quadrant: "passive-defense",
      name: "Armor Aura",
      icon: "icon-armor",
      desc: "Protective aura around the base.\nUpgrades grow its range.",
      baseCost: 10,
      costGrowth: 1.6,
      maxLevel: 8,
      params: { stat: "armor", amountPerLevel: 1, baseRange: 120, rangePerLevel: 60 },
    },
    {
      id: "might-aura",
      quadrant: "passive-offense",
      name: "Might Aura",
      icon: "icon-might",
      desc: "Your hits hit harder near base.\nUpgrades grow its range.",
      baseCost: 12,
      costGrowth: 1.6,
      maxLevel: 8,
      params: { stat: "might", amountPerLevel: 0.15, baseRange: 120, rangePerLevel: 60 },
    },
    {
      id: "regen-beacon",
      quadrant: "active-defense",
      name: "Regen Beacon",
      icon: "icon-regen",
      desc: "Heals you every few seconds\nwhile you're in range.",
      baseCost: 15,
      costGrowth: 1.7,
      maxLevel: 8,
      params: { hpPerTick: 4, interval: 3, baseRange: 160, rangePerLevel: 40 },
    },
    {
      // NOTE: the golem now fights for itself only as the Berserker STYLE
      // (golem awakening, docs/game-design-v2.md - style identity beats the
      // generic branch). This node stays for shot UPGRADES; picking it
      // doesn't make the golem attack from nothing - the golem only fires
      // while a Berserker pick exists (tower.js: shot requires picks > 0
      // AND style === "berserker"), otherwise a shot pick here only powers
      // the existing knockback swipe (dmg bump / smaller radius).
      id: "turret",
      quadrant: "active-offense",
      name: "Battle Rhythm",
      icon: "icon-lightning",
      desc: "Berserker golem:\nswipes hit harder and\nrecover faster.",
      baseCost: 20,
      costGrowth: 1.8,
      maxLevel: 8,
      params: { damage: 8, damagePerLevel: 4, interval: 1.2, range: 260 },
    },
  ],

  portal: {
    offset: 90, // px to the player's right where the portal appears
    enterRadius: 28, // px - walk this close to enter
    scale: 2.5,
  },
};

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

// ---------------------------------------------------------------------------
// Base effects from shop picks (owner: Mickael - src/systems/{auras,regen,tower}.js)
// Stats: plain number, or { base, perLevel, min?, max? } scaled by pick level.
// A shop pick's `params` can override any key (see docs/tasks-v2.md).
// ---------------------------------------------------------------------------

// Passive auras around the base. Radius grows each level ("passives scale
// reach"): eventually the player doesn't need to camp home.
export const AURA = {
  "passive-defense": {
    radius: { base: 150, perLevel: 60 }, // px
    damageTaken: { base: 0.8, perLevel: -0.05, min: 0.5 }, // player dmg taken x
    enemySlow: { base: 0.7, perLevel: -0.05, min: 0.4 }, // enemy speed x inside
    color: [90, 170, 255],
  },
  "passive-offense": {
    radius: { base: 150, perLevel: 60 },
    damageMult: { base: 1.3, perLevel: 0.15 }, // player weapon damage x
    attackSpeedMult: { base: 1.2, perLevel: 0.1 }, // player fire rate x
    color: [255, 130, 60],
  },
};

// Active defense: the base heals the player while in range, every `interval`
// seconds. From shieldFromLevel, each heal also grants a damage shield.
export const REGEN = {
  range: { base: 170, perLevel: 20 }, // px from the base
  interval: { base: 2, perLevel: -0.2, min: 0.8 }, // s between heals
  heal: { base: 5, perLevel: 3 }, // hp per tick
  shieldFromLevel: 2,
  shield: { base: 0, perLevel: 6 }, // hp absorbed (lvl 2: 6, lvl 3: 12…)
  shieldDuration: 3, // s
};

// The base IS the tower (docs/game-design-v2.md): it always has HP; from the
// end of wave 1 (golem awake, tower.js) enemies
// attack it, and when it's destroyed the run is over ("run-over"). The
// active-offense pick makes it shoot; each further pick levels it up.
// HP uses the tower level = picks + 1 (unpicked base: 200 hp, 1 pick: 275…);
// shooting stats use the pick level (no shooting before the first pick).
export const TOWER = {
  // Solid body = the golem's VISIBLE pixels (measured on its idle frames:
  // x 1-30, y 3-31 of the 32 px cell), in art px; scaled with the sprite.
  // Enemies and the player can't overlap it; the HP bar sits just above it.
  body: { cell: 32, left: 1, top: 3, right: 1, bottom: 0 },
  idleAnimSpeed: 0.4, // x the golem's authored 8 fps idle (a slow, heavy breathe)
  playerRadius: 12, // px, the player's body when pushed out of the base
  hp: { base: 200, perLevel: 75 },
  range: { base: 320, perLevel: 30 }, // px, shooting range
  fireInterval: { base: 0.8, perLevel: -0.08, min: 0.3 }, // s
  damage: { base: 12, perLevel: 6 },
  projectileSpeed: 420, // px/s
  // When a wave ends, the golem gets back this fraction of its MAX HP
  // (200 max → +20). Never above its max HP.
  waveEndRepair: 0.1,
  // Faint red pulse while its HP drains: pulse speed follows the drain rate
  // (minHz + hzPerHp x HP/s, capped at maxHz: 2 HP/s → 3 Hz, 6 → 4 Hz,
  // 10 → 5 Hz); at the peak of a pulse the golem's green/blue are lowered by
  // `strength` (0-255): faint but visible. When the drain stops, the current
  // pulse finishes its fade-out before the tint goes away.
  drainFlash: { minHz: 2.5, hzPerHp: 0.25, maxHz: 7, strength: 85 },

  // Golem FX (one shader on the golem sprite, see tower.js):
  statueGrey: 1, // 0..1 how grey the sleeping statue is (1 = fully desaturated)
  swipeBand: 0.22, // rainbow band thickness, as a fraction of the sprite height
  powerOnTime: 1.0, // s, colour sweeps up the statue (first shop close)
  // Golem death: enemies pouf, deathDelay s of silence, then the colour drains
  // from top to bottom (powerDownTime s), then the game-over screen.
  deathDelay: 2.5,
  powerDownTime: 1.4,
};

// Guide arrow (guide-arrow.js): during the break, points at the nearest of
// the golem (shop) and the portal when it's off-screen.
export const GUIDE_ARROW = {
  onScreenMargin: 40, // px: a target this far inside the screen counts as visible
  edgeMargin: 80, // px from the screen edge where the arrow sits (clear of the HUD)
  size: 28, // px, arrow head size
  labelSize: 18, // px
  shopColor: [255, 214, 120], // same gold as the shop circle (CYCLE.shopCircleColor)
  portalColor: [190, 140, 255],
};

// Golem self-defense (docs/game-design-v2.md → "The golem awakening flow"):
// once awake, the golem sends shock waves that fling nearby enemies away,
// whatever the shop picks (golem-shockwave.js). It starts once minContact
// enemies touch the golem, then fires again each time its `cooldown` is over,
// for as long as at least one enemy is still touching it at that moment.
export const GOLEM_SHOCKWAVE = {
  // Playtest (wave 5 horde, player dead, everything on the golem): golem
  // survived ~2x longer with a 3 s cooldown than with no shock wave; 3 s
  // felt too frequent in play, so 6 s.
  minContact: 3, // enemies touching the golem before the first wave
  windup: 1.5, // s those enemies must stay in contact before the first wave
  cooldown: 6, // s, minimum time between two waves (also the repeat while swarmed)
  radius: 170, // px from the golem's center (its body is ~120 px wide)
  force: 1200, // px/s initial push (≈ 240 px travel with ENEMY.knockbackDecay 5)
  damage: 0, // optional damage per wave (0 = pure push)
  ringTime: 0.45, // s, ring animation length
  color: [150, 220, 255], // ring color (the golem's crystal blue)
};

// Berserker golem style (docs/game-design-v2.md → "The golem awakening
// flow" → Berserker: offense-centered, "fights mobs itself - swipes,
// charges, kills for you"). Picked via the "golem-style-pick" event, run
// by golem-berserker.js: a damaging AOE swipe around the golem and a ranged
// charge strike at the nearest pack, both through the enemies.js
// "enemy-knockback" contract (damage + knockback). The built-in
// self-defense shock wave (GOLEM_SHOCKWAVE) still runs on top of it.
export const GOLEM_BERSERKER = {
  // Swipe: damaging knockback wave centered on the golem.
  swipeInterval: 2.5, // s between swipes (fire only when an enemy is in reach)
  swipeRadius: 190, // px from the golem's center (a bit past GOLEM_SHOCKWAVE.radius)
  swipeForce: 900, // px/s initial push (less than the pure-defense shock wave)
  swipeDamage: 10, // damage per swipe at wave 1 (scales with swipeDamageGrowth)
  swipeColor: [255, 120, 90], // ring color (berserker red)
  // Charge: strike at the nearest enemy up to chargeRange px away - the
  // knockback lands at the strike point, so distant packs get hit too.
  chargeInterval: 5, // s between charge strikes
  chargeRange: 420, // px, how far the golem will look for a strike target
  chargeReach: 240, // px, the strike point at most this far from the golem
  chargeRadius: 110, // px, AOE radius around the strike point
  chargeForce: 1100, // px/s initial push
  chargeDamage: 16, // damage per strike at wave 1
  chargeColor: [255, 180, 60], // streak + ring color (berserker amber)
  // Damage scaling: like the enemy side (ENEMY_LEVEL.hpGrowth with 2 levels
  // per wave), the golem's output has to keep pace with enemy HP or the
  // style falls off. damage = base x (1 + damageGrowth x (wave - 1)).
  damageGrowth: 0.35,
  ringTime: 0.45, // s, ring/streak animation length (as GOLEM_SHOCKWAVE)
};

// Smart enemy targeting (docs/game-design-v2.md → "Enemy targeting").
// Enemies pick between the player and the base/tower:
//   1. focus the clearly weaker one (lower hp / maxHp by at least focusMargin)
//   2. otherwise split: keep about towerShare of the horde on the tower
//   3. only one available (player respawning) → everyone goes for it
//   4. re-evaluate every retargetInterval (+ random jitter), with stickiness
export const ENEMY_TARGETING = {
  retargetInterval: 0.75, // s between re-evaluations per enemy
  retargetJitter: 0.5, // s random extra, so enemies don't all switch at once
  focusMargin: 0.25, // hp-fraction gap that counts as "clearly weaker"
  towerShare: 0.5, // fraction of attackers that should be on the tower
  switchTolerance: 0.15, // stickiness: only switch when a side is this far over its share
};

// Player death → respawn at the base after a timer (the tower is the only
// lose condition). The timer is a ladder: each death moves one step up,
// each wave cleared / boss defeated moves one step down (never below 0).
export const RESPAWN = {
  steps: [3, 5, 8, 12, 18], // s
  // Where the player appears: px below the golem's anchor (its feet), clear
  // of its solid body. Used for the run start (player.js) and every respawn.
  belowBase: 40,
};

// ---------------------------------------------------------------------------
// XP, pickups, level up, HUD (owner: chippe - src/systems/{xp,upgrades,hud}.js)
// ---------------------------------------------------------------------------
export const XP = {
  firstLevel: 5, // xp needed to reach level 2
  levelStep: 5, // extra xp needed per level after that
  // px; pickups inside this fly to the player. Barely more than
  // collectRadius at the start; each Magnet card adds UPGRADE.magnetBonus
  pickupRadius: 30,
  collectRadius: 20, // px; pickups this close are collected
  magnetSpeed: 420, // px/s when a pickup flies to the player
  pickupScale: 3, // sprite scale (16px art)
  pickupLifetime: 60, // s before an uncollected pickup despawns
  heartHeal: 20, // hp restored by a "heart" drop
  // Magnet bonus ("magnet-all"): every pickup flies in, nearest first
  homingStagger: 0.03, // s between two pickups starting
  homingMaxDelay: 1.2, // s, the last ones start no later than this
  homingLift: 0.15, // s of lift-off before flying
  homingLiftSpeed: 120, // px/s upward during the lift
  homingAccel: 1600, // px/s² once flying
  homingMaxSpeed: 1400, // px/s
};

// Drop kind (from enemies.js "drop" event) -> pickup sprite file
// *_fixed.png: the pack's "bob up" frames had their top pixel row clipped
// (scripts/fix-pickup-sprites.mjs restores it; see docs/assets.md).
export const PICKUP_SPRITES = {
  "xp-blue": "Pickup_XP_Blue_fixed.png",
  "xp-green": "Pickup_XP_Green_fixed.png",
  "xp-red": "Pickup_XP_Red_fixed.png",
  "xp-purple": "Pickup_XP_Purple_Big.png", // not affected
  heart: "Pickup_Heart_fixed.png",
};

export const UPGRADE = {
  choices: 3, // cards shown per level up
  magnetBonus: 40, // px added per Magnet level to the XP AND coin magnet radius
  maxHpPerLevel: 20, // max hp added (and healed) per Max HP level
  moveSpeedPerLevel: 0.1, // +10% move speed per level
  mightPerLevel: 0.15, // +15% weapon damage per level
  cooldownPerLevel: 0.1, // +10% fire rate per level
};

// Knife weapon unlocked by the "weapon-knife" upgrade (src/systems/knife.js)
// Every level: +damagePerLevel. Path alternates: Lv2 +1 knife → Lv3 +1
// pierce → Lv4 +1 knife → Lv5 +1 pierce (Lv1: 1 knife, pierce 1).
export const KNIFE = {
  interval: 1.2, // s between volleys
  damage: 8,
  damagePerLevel: 3,
  speed: 560, // px/s
  lifetime: 0.9, // s
  spread: 0.18, // radians between knives in one volley
};

// Plank (src/systems/plank.js): the STARTER weapon (every run begins with it
// at level 1; its card "weapon-plank" levels it up). A long poke in front of
// the player that hits along its whole length. ART PLACEHOLDER: drawn as the
// knife sprite, recolored bright pink and stretched, until a real plank
// sprite exists (see docs/assets.md → "Placeholder art to replace").
// Every level: +damagePerLevel. Path alternates: Lv2 +length → Lv3 a chained
// poke the other way → Lv4 +length → Lv5 another chained poke (the other way
// again).
export const PLANK = {
  interval: 1.5, // s between attacks (slow starter; the Cooldown card speeds it up)
  startCountdown: 3, // s: "3, 2, 1, GO!" under the player before the run's first poke
  damage: 12,
  damagePerLevel: 4,
  length: 110, // px, the plank itself
  lengthBonus: 40, // px added at Lv2 and again at Lv4
  chainDelay: 0.16, // s between the chained pokes of one attack
  thrust: 26, // px it slides out and back during a poke
  pokeTime: 0.2, // s the poke stays out
  hitRadius: 16, // px, hit circles spaced along the plank
  thickness: 3, // y scale of the stretched knife sprite
  tint: [255, 70, 200], // bright pink = placeholder art
};

// Axe (src/systems/axe.js, card "weapon-axe"): thrown up in an arc, falls
// through the horde. Every level: +damagePerLevel. Path: Lv2 +1 axe → Lv3
// thrown to both sides → Lv4 +1 axe → Lv5 +1 axe.
export const AXE = {
  interval: 2.2, // s between throws
  damage: 14,
  damagePerLevel: 4,
  pierce: 5, // enemies hit before it's spent
  launchUp: 560, // px/s initial upward speed
  launchSide: 170, // px/s sideways (toward its side; axes on one side fan out)
  gravity: 1150, // px/s²
  lifetime: 1.5, // s
  spin: 720, // deg/s
  hitRadius: 14, // px
  scale: 2.5,
};

// Boomerang (src/systems/boom-stick.js, card "weapon-boomerang"): flies out to
// the nearest enemy (or the facing side), slows down, comes back to the
// player; it can hit the same enemies again on the way back.
// Every level: +damagePerLevel. Path alternates: Lv2 +1 boomerang → Lv3
// +range → Lv4 +1 boomerang → Lv5 +range.
export const BOOMERANG = {
  interval: 1.8, // s between throws
  damage: 9,
  damagePerLevel: 3,
  pierce: 3, // hits per pass (out, then back)
  range: 280, // px it flies out
  rangeBonus: 90, // px added at Lv3 and again at Lv5
  aimRange: 420, // px: aims at the nearest enemy within this, else the facing side
  outTime: 0.55, // s to reach full range (eases out)
  returnSpeed: 520, // px/s on the way back
  spread: 0.5, // radians between boomerangs (Lv2+)
  maxLifetime: 4, // s safety cap
  hitRadius: 13, // px
  scale: 2.5,
};

export const HUD = {
  margin: 16,
  textSize: 22,
  xpBarHeight: 10,
  hpBarWidth: 40, // px, drawn under the player
  hpBarHeight: 5,
  hpBarOffset: 22, // px below the player's center
  orb: { x: 70, y: 70, r: 46 }, // HP orb: center x from the left, y from the BOTTOM, radius
  slot: { size: 48, gap: 8, weaponSlots: 4, statSize: 26 }, // weapon slots + stat icons next to the orb
  counters: { y: 60 }, // coins / kills, top right (below the dev switch label)
};

// ---------------------------------------------------------------------------
// Dev-only playtest switches (src/systems/devtools.js; dev server only)
// ---------------------------------------------------------------------------
export const DEV = {
  toggleAttackKey: "k", // toggle the player's attack (also ?noattack in the URL)
  endWaveKey: "n", // end the running wave now, as if survived (boss waves too)
  freezeEnemiesKey: "f", // toggle: enemies frozen in place (spawns + wave timer go on)
  speedKey: "t", // toggle the whole game between x1 and x fastSpeed
  fastSpeed: 2,
};

// ---------------------------------------------------------------------------
// Cycle director (owner: Mickael - src/systems/cycle.js)
// wave → break (portal if far / walk home) → shop at the golem → next wave
// ---------------------------------------------------------------------------
export const CYCLE = {
  portalMinDistance: 500, // px from the golem: farther than this at wave end → a portal appears
  // Wave end: enemies pouf → afterWaveDelay s → rainbow swipe up the golem
  // (swipeTime s) → break: the shop circle shows, a portal if far.
  afterWaveDelay: 2.5,
  swipeTime: 0.8,
  // Shop circle (px from the golem's body center): inside it during the
  // break → the shop opens. Drawn as a faint glowing ring.
  shopCircle: 130,
  shopCircleColor: [255, 214, 120],
  arrivalGap: 50, // px below the golem where the portal drops the player
  nextWaveDelay: 2, // s between closing the shop and the next wave
  pauseInShop: true, // freeze the game (time scale 0) while the shop is open
};

// ---------------------------------------------------------------------------
// Damage numbers (owner: Akram - src/systems/damage-numbers.js)
// floating hit numbers over enemies (dealt) / player & tower (taken)
// ---------------------------------------------------------------------------
export const DAMAGE_NUMBERS = {
  size: 16, // text size in px
  lifetime: 0.6, // s a number lives
  fade: 0.3, // s of fade-out at the end of its life
  riseSpeed: 40, // px/s upward drift
  lift: 12, // px spawned above the hit point
  jitter: 8, // px of horizontal scatter so stacked hits stay readable
  maxPerFrame: 12, // cap: hordes hitting at once must not spawn 100 texts
};

// ---------------------------------------------------------------------------
// Rare bonus drops (owner: chippe — src/systems/bonus.js)
// docs/game-design-v2.md → "Rare bonus drops". The chance per kill is
// BONUS_DROP_ROW (0.5%, top of this file); these are which bonus and its effect.
// ---------------------------------------------------------------------------
export const BONUS_DROPS = {
  // relative weights (Bomb and Rage rarer than Magnet)
  weights: { bomb: 1, freeze: 2, rage: 1, "golem-heal": 2, magnet: 3, recall: 2 },
  lifetime: 20, // s on the ground
  blinkLast: 5, // s: blinks during the end of its lifetime
  collectRadius: 26, // px
  scale: 3,
  bobHeight: 4, // px
  bobHz: 1.5,
  bombBossDamage: 0.25, // bosses lose this fraction of their max HP to a Bomb
  freezeTime: 4, // s
  rageTime: 8, // s
  rageDamageMult: 5,
  rageAttackSpeedMult: 8, // ≈ every weapon down to ~0.1-0.15 s between attacks
  golemHeal: 0.25, // fraction of the golem's max HP
  recallKey: "r",
  recallCast: 1, // s, taking damage doesn't cancel it
  recallGap: 50, // px below the golem's body where recall lands (like CYCLE.arrivalGap)
};

// ---------------------------------------------------------------------------
// Base under attack UI (owner: chippe — src/systems/base-alert.js)
// ---------------------------------------------------------------------------
export const BASE_ALERT = {
  attackedFor: 1.5, // s after the last HP loss the golem still counts as "under attack"
  bannerQuiet: 5, // s the golem must be left alone before the banner shows again
  bannerTime: 2.5, // s the "BASE UNDER ATTACK!" banner stays up
  flashTime: 0.3, // s, the HUD bar's white hit flash fades over this
  dangerRatio: 0.25, // golem HP fraction below which the danger state is on
  dangerHz: 1.2, // red edge pulses per second
  dangerEdge: 60, // px, how far the red edge glow reaches inward
  dangerOpacity: 0.35, // edge glow opacity at the peak of a pulse
  onScreenMargin: 40, // px: the golem this far inside the screen counts as visible
  edgeMargin: 80, // px from the screen edge where the arrow sits (like GUIDE_ARROW)
  arrowSize: 26, // px
  arrowHz: 1.5, // arrow pulses per second (doubled in danger)
  bar: { width: 260, height: 14, y: 96, textSize: 12 }, // HUD golem HP bar, top center
};

// --- Golem style pick screen (src/systems/golem-styles.js, owner Akram) ---
export const GOLEM_STYLES = {
  openDelay: 1.2, // s after "golem-awake" before the pick screen appears
  cardW: 260,
  cardH: 300,
  titleColor: [255, 220, 90],
};

// ---------------------------------------------------------------------------
// Minimap (owner: chippe — src/systems/minimap.js), top-left corner
// ---------------------------------------------------------------------------
export const MINIMAP = {
  x: 16, // px, top-left corner of the map on screen
  y: 16,
  size: 150, // px, the map is a square
  range: 1000, // world px from the player to the map's edge
  golemSize: 7, // px, half-diagonal of the golem diamond
  attackedFor: 1.5, // s after the golem's last HP loss it pulses red
  pulseHz: 2, // red pulses per second while under attack
};

// ---------------------------------------------------------------------------
// Golem styles (owner: Akram - src/systems/golem-guardian.js)
// ---------------------------------------------------------------------------
// Guardian (docs/game-design-v2.md → "The golem awakening flow" → pick 1 of 3
// golem styles): the defensive, stay-home identity. A protective aura around
// the golem slows enemies inside, and a shield refreshes while the player
// roams near it and holds a while after they leave. Picked with the root
// event "golem-style-pick" { style: "guardian", level?, params? }.
export const GOLEM_GUARDIAN = {
  radius: { base: 220, perLevel: 40 }, // px, aura around the golem
  enemySlow: { base: 0.75, perLevel: -0.05, min: 0.5 }, // enemy speed x inside
  shield: { base: 15, perLevel: 5 }, // hp absorbed while inside (refreshed)
  shieldDuration: 6, // s the shield holds after leaving the aura
  color: [200, 212, 230], // white/gray: defense paths (game-design-v2.md)
};

// Sound effects (src/systems/sounds.js, files in gfx/Sounds/).
// Mix: what you hear = master x volume[sound] (each 0..1). Frequent sounds
// (attacks, pickups) sit very low so they don't drown the important cues
// (level up, wave won).
export const SOUND = {
  master: 0.8, // global volume (0 when muted)
  muteKey: "m", // toggles mute, remembered in the browser
  volume: {
    // frequent: really low
    plank: 0.1, // every plank poke
    gun: 0.08, // every pistol bullet
    axe: 0.08, // whoosh while axes are in the air
    collect: 0.1, // XP gems, hearts, coins, bonus drops
    // regular
    step: 0.3, // one footstep per stride
    kill: 0.3,
    // rare, important cues: a bit above the rest
    levelUp: 0.25,
    waveWon: 0.7,
    gameOver: 0.3, // the run is lost
    // background
    music: 0.2, // LoopMusic.mp3, looped all run: quiet, under the effects
  },
  musicFadeOut: 1.5, // s: the music fades out when the run is lost
  killGap: 0.06, // s: at most one kill sound per gap (bombs, big sweeps)
  collectGap: 0.05, // s: same for pickups (magnet bursts)
  // Footsteps follow the real walking speed: one step every `stride` px the
  // player actually walks (220 px/s base speed → 4 steps/s; Move Speed cards
  // make the steps faster). Walking.ogg is a single step, so no loop.
  stride: 55,
  // Axe whoosh rhythm while axes fly: one every axeEvery s (≈ one per half
  // turn of the axe, AXE.spin 720°/s).
  axeEvery: 0.25,
};

// ---------------------------------------------------------------------------
// Golem styles (owner: Akram - src/systems/golem-warden.js)
// ---------------------------------------------------------------------------
// Warden (docs/game-design-v2.md → "The golem awakening flow" → pick 1 of 3
// golem styles): the crowd-control identity. A slow-field aura around the
// golem holds the horde back (same "aura" mechanism as the guardian), plus a
// periodic pulse that slows enemies inside much harder for a moment. Picked
// with the root event "golem-style-pick" { style: "warden", level?, params? }.
export const GOLEM_WARDEN = {
  radius: { base: 260, perLevel: 35 }, // px, slow field around the golem
  enemySlow: { base: 0.6, perLevel: -0.05, min: 0.4 }, // enemy speed x inside
  pulseInterval: 4, // s between pulses (fires only with an enemy inside)
  pulseDuration: 1.5, // s the hard slow lasts
  pulseSlow: 0.15, // enemy speed x inside while the pulse holds
  ringTime: 0.45, // s, ring animation length (as GOLEM_SHOCKWAVE)
  color: [150, 210, 180], // gray-green: it holds, it doesn't hurt
  pulseColor: [120, 230, 190], // ring color of a pulse
};

// ---------------------------------------------------------------------------
// Chests & hidden treasures (owner: chippe — src/systems/chests.js)
// docs/game-design-v2.md → "Chests & hidden treasures"
// ---------------------------------------------------------------------------
export const CHESTS = {
  perWave: { min: 1, max: 3 }, // visible chests spawned at each wave start
  minDist: 450, // px from the golem: never too close
  maxDist: 1500, // px: the farther, the better the loot (q = 0..1)
  scale: 3,
  openRadius: 44, // px: stand this close to open
  openTime: 1, // s standing next to it (damage doesn't cancel, walking away does)
  guardedChance: 0.35, // chance a chest has a pack around it
  guardRadius: 320, // px: the pack spawns the first time you get this close
  guards: { min: 3, max: 5 },
  // one roll per chest; weight + perQ x q (golem-* only once the golem is awake)
  loot: {
    coins: { weight: 5 },
    card: { weight: 2, perQ: 2 }, // a free level-up card (pick 1 of 3)
    heal: { weight: 2 }, // full player heal
    "golem-repair": { weight: 0.3, perQ: 0.7 },
    "golem-upgrade": { weight: 0.2, perQ: 0.6 }, // free, doesn't raise upgradesOwned
  },
  coins: { base: 8, perWave: 3, farBonus: 1.5 }, // (base + perWave x (wave-1)) x (1 + farBonus x q)
  repairPct: 0.3, // free golem repair: this fraction of its max HP
};

export const GOLEM_CHEST = {
  firstWave: 2, // first one (the golem wakes at the end of wave 1)
  every: { min: 2, max: 3 }, // waves between two golem chests
  minDist: 1100, // px from the golem: always far
  maxDist: 1600,
  scale: 3.6,
  tint: [255, 215, 140], // stone/gold look (+ a glow)
  guards: { min: 5, max: 7 }, // always guarded
  maxHpPerLevel: 60, // Golem Max HP
  armorPerLevel: 0.12, // Golem Armor: -12% golem damage taken per level
  armorMin: 0.4, // never below 40% damage taken
  swipeRadiusPerLevel: 0.15, // Swipe: shock wave radius +15% per level
  swipeForcePerLevel: 0.2, // and push +20% per level
};

export const TREASURES = {
  base: 2, // hidden treasures in wave 1
  perWave: 0.5, // + this many per wave after (floored)
  max: 6,
  minDist: 400,
  maxDist: 1700,
  hintRadius: 110, // px: a faint sparkle shows this close (never on the minimap)
  digRadius: 30, // px: stand on it
  digTime: 2, // s; walking away cancels
  coinMult: 2.5, // bigger than a chest's coin bag
  rareChance: 0.25, // sometimes a rare item from the chest list instead
};
