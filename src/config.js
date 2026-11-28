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
    hitRadius: 16,
    baseHp: 45, // a lot of HP: 15x a zombie
    baseDamage: 12,
    speed: 40,
    // HP 45 → 108 (wave 3) → 202 (wave 6) → 344 (wave 10) → 501 (wave 15)
    tierMinHp: [0, 120, 210, 330, 480],
    drops: [
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
  // When a wave ends, remaining enemies die immediately (death anim, no drops,
  // not counted as kills). false = they keep chasing until "enemy-clear".
  killOnEnd: true,
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
  { kind: "xp-blue", base: 0.45, perLevel: -0.01, max: 0.45, value: 1 },
  { kind: "xp-green", base: 0.08, perLevel: 0.01, max: 0.25, value: 3 },
  { kind: "xp-red", base: 0.0, perLevel: 0.005, max: 0.1, value: 10 },
  { kind: "heart", base: 0.01, perLevel: 0.0, max: 0.01, value: 0 },
  { kind: "coin", base: 0.35, perLevel: 0, max: 0.35, value: 0 },
];

// ---------------------------------------------------------------------------
// Player + weapon + map (owner: Akram - src/systems/{player,weapons,map}.js)
// ---------------------------------------------------------------------------
export const CFG = {
  viewport: { width: 1280, height: 720 },

  player: {
    speed: 220, // px/s
    maxHp: 100,
    scale: 2, // sprite scale (16px art -> 32px on screen)
    // Draw layer: above every world object (ground -10, auras -5, enemies 0,
    // coins 4, base 5, portal/projectiles 6) so the player is never hidden,
    // below overlays (HP bars / shield 50, floating text 60, UI 100).
    z: 40,
  },

  weapon: {
    fireInterval: 1.0, // seconds between pistol shots
    projectileSpeed: 480, // px/s
    damage: 10,
    range: 360, // px - acquire nearest enemy within this distance
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
    magnetRadius: 110, // px at which coins fly to the player
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
      id: "turret",
      quadrant: "active-offense",
      name: "Turret",
      icon: "icon-lightning",
      desc: "The base fights for you.\nIf it dies, you die.",
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
  pickupRadius: 90, // px; pickups inside this fly to the player
  collectRadius: 20, // px; pickups this close are collected
  magnetSpeed: 420, // px/s when a pickup flies to the player
  pickupScale: 3, // sprite scale (16px art)
  pickupLifetime: 60, // s before an uncollected pickup despawns
  heartHeal: 20, // hp restored by a "heart" drop
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
  magnetBonus: 40, // pickup radius added per Magnet level
  maxHpPerLevel: 20, // max hp added (and healed) per Max HP level
  moveSpeedPerLevel: 0.1, // +10% move speed per level
  mightPerLevel: 0.15, // +15% weapon damage per level
  cooldownPerLevel: 0.1, // +10% fire rate per level
};

// Knife weapon unlocked by the "weapon-knife" upgrade (src/systems/knife.js)
export const KNIFE = {
  interval: 1.2, // s between volleys
  damage: 8,
  speed: 560, // px/s
  lifetime: 0.9, // s
  spread: 0.18, // radians between knives in one volley
  // per knife level: knives per volley = level, pierce = 1 + level
};

export const HUD = {
  margin: 16,
  textSize: 22,
  xpBarHeight: 10,
  hpBarWidth: 40, // px, drawn under the player
  hpBarHeight: 5,
  hpBarOffset: 22, // px below the player's center
};

// ---------------------------------------------------------------------------
// Dev-only playtest switches (src/systems/devtools.js; dev server only)
// ---------------------------------------------------------------------------
export const DEV = {
  toggleAttackKey: "k", // toggle the player's attack (also ?noattack in the URL)
};

// ---------------------------------------------------------------------------
// Cycle director (owner: Mickael - src/systems/cycle.js)
// wave → break (portal if far / walk home) → shop at the golem → next wave
// ---------------------------------------------------------------------------
export const CYCLE = {
  portalMinDistance: 500, // px from the golem: farther than this at wave end → a portal appears
  shopRadius: 70, // px from the golem's body: closer than this during the break → shop opens
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
