// Enemies: factory, chase behaviour, contact attack, death + drops, and the
// spawn director that ramps difficulty over time.
//
// Contract for other systems (no imports needed — use KAPLAY tags/events):
//   - Live enemies carry the "enemy" tag and a health() comp: weapons call
//     `enemy.hurt(dmg)`. Dying enemies lose "enemy" (and their area), so they
//     can't be targeted or hit while the death animation plays.
//   - on("killed", "enemy", (enemy, { pos, level, tier }) => ...)   every kill (HUD)
//   - on("drop",   "enemy", (enemy, { kind, pos, level, tier, value }) => ...)
//       only when the drop roll succeeds (xp.js spawns the gem/item)
//   - Enemies damage the player on contact by calling `player.hurt(n)` if
//     the "player" object has a health() comp.

import zombieUrl from "../../gfx/SurvivorsStarterKit_v1.0/Enemies/Enemy_Zombie.png";
import {
  ENEMY,
  ENEMY_LEVEL,
  ENEMY_SPAWN,
  ENEMY_DROPS,
  ENEMY_TIERS,
} from "../config.js";

// Sheet: 6 columns x 3 rows of 16x16 — row 0 Move(4), row 1 Hit(2), row 2 Death(6)
const SHEET_COLS = 6;
const SHEET_ROWS = 3;

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
  loadSprite(ENEMY.sprite, zombieUrl, {
    sliceX: SHEET_COLS,
    sliceY: SHEET_ROWS,
    anims: {
      move: { from: 0, to: 3, loop: true, speed: 8 },
      hit: { from: 6, to: 7, speed: 12 },
      death: { from: 12, to: 17, speed: 12 },
    },
  });
}

/** Enemy level for a given survival time (seconds). */
export function enemyLevelAt(seconds) {
  const lvl = 1 + Math.floor(seconds / ENEMY_LEVEL.secondsPerLevel);
  return Math.min(lvl, ENEMY_LEVEL.maxLevel);
}

export function enemyStatsForLevel(level) {
  const n = level - 1;
  return {
    hp: Math.round(ENEMY.baseHp * (1 + ENEMY_LEVEL.hpGrowth * n)),
    damage: Math.round(ENEMY.baseDamage * (1 + ENEMY_LEVEL.damageGrowth * n)),
  };
}

/** Roll the drop table once; returns a drop entry or null. */
export function rollDrop(level) {
  const r = Math.random();
  let acc = 0;
  for (const d of ENEMY_DROPS) {
    acc += Math.max(0, Math.min(d.max, d.base + d.perLevel * (level - 1)));
    if (r < acc) return d;
  }
  return null;
}

/** Color-swap tier for a given max HP (highest tier whose minHp <= hp). */
export function enemyTierForHp(hp) {
  let tier = 0;
  ENEMY_TIERS.forEach((t, i) => {
    if (hp >= t.minHp) tier = i;
  });
  return tier;
}

// Live (not dying) enemies. Kept here so hot paths never scan the whole
// object tree with get("enemy").
const live = new Set();

/** Number of live (not dying) enemies. */
export function liveEnemyCount() {
  return live.size;
}

// get("player") walks every object in the scene; doing that once per enemy
// per frame was O(n²). Cache it and only re-query when it's gone.
let cachedPlayer = null;
function getPlayer() {
  if (!cachedPlayer || !cachedPlayer.exists()) cachedPlayer = get("player")[0] ?? null;
  return cachedPlayer;
}

export function spawnEnemy(p, level = 1) {
  const stats = enemyStatsForLevel(level);
  const tier = enemyTierForHp(stats.hp);
  const { xpMult } = ENEMY_TIERS[tier];
  const uniforms = tierUniforms[tier];

  const enemy = add([
    sprite(ENEMY.sprite, { anim: "move" }),
    pos(p),
    anchor("center"),
    scale(ENEMY.scale),
    // Enemies ignore each other in KAPLAY's collision pass: checking every
    // enemy pair in a dense horde was the main frame-time cost. Spacing is
    // handled by separateEnemies() instead.
    area({ scale: 0.75, collisionIgnore: ["enemy"] }),
    health(stats.hp),
    ...(uniforms ? [shader(TINT_SHADER, uniforms)] : []),
    "enemy",
    {
      level,
      tier,
      xpMult,
      damage: stats.damage,
      attackTimer: 0,
      dead: false,
    },
  ]);

  enemy.onUpdate(() => {
    if (enemy.dead) return;
    enemy.attackTimer = Math.max(0, enemy.attackTimer - dt());

    const player = getPlayer();
    if (!player) return;

    const toPlayer = player.pos.sub(enemy.pos);
    if (toPlayer.len() > ENEMY.despawnDistance) {
      destroy(enemy); // silently recycle stragglers, no drop
      return;
    }
    enemy.move(toPlayer.unit().scale(ENEMY.speed));
    enemy.flipX = toPlayer.x < 0; // art faces right
  });

  enemy.onCollideUpdate("player", (player) => {
    if (enemy.dead || enemy.attackTimer > 0) return;
    if (typeof player.hurt !== "function") return;
    player.hurt(enemy.damage);
    enemy.attackTimer = ENEMY.attackCooldown;
  });

  enemy.onHurt(() => {
    if (enemy.dead || enemy.hp() <= 0) return;
    enemy.play("hit");
  });

  enemy.onAnimEnd((anim) => {
    if (anim === "hit" && !enemy.dead) enemy.play("move");
    if (anim === "death") destroy(enemy);
  });

  enemy.onDeath(() => killEnemy(enemy));
  enemy.onDestroy(() => live.delete(enemy));
  live.add(enemy);

  return enemy;
}

function killEnemy(enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  live.delete(enemy);

  const info = { pos: enemy.pos.clone(), level: enemy.level, tier: enemy.tier };
  enemy.trigger("killed", info);

  const drop = rollDrop(enemy.level);
  if (drop) {
    enemy.trigger("drop", {
      ...info,
      kind: drop.kind,
      value: Math.round(drop.value * enemy.level * enemy.xpMult),
    });
  }

  // Out of play: no more targeting / collisions while the death anim runs.
  enemy.untag("enemy");
  enemy.unuse("area");
  enemy.play("death");
}

// Soft separation so the horde spreads out instead of stacking on one point.
// Bucket enemies into a grid of cells one separation-radius wide, then only
// compare each enemy with its own + neighbouring cells. Plain number math,
// no Vec2 allocations — this runs on up to maxAlive enemies every frame.
const grid = new Map();
function separateEnemies() {
  const r = ENEMY.separationRadius;
  const r2 = r * r;
  const stiffness = ENEMY.separationStiffness;
  grid.clear();
  for (const e of live) {
    const key = Math.floor(e.pos.x / r) * 65536 + Math.floor(e.pos.y / r);
    let cell = grid.get(key);
    if (!cell) grid.set(key, (cell = []));
    cell.push(e);
  }
  // A few relaxation passes let pressure spread outward through the crowd.
  for (let pass = 0; pass < ENEMY.separationPasses; pass++) {
    for (const e of live) {
      const cx = Math.floor(e.pos.x / r);
      const cy = Math.floor(e.pos.y / r);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const cell = grid.get(gx * 65536 + gy);
          if (!cell) continue;
          for (const o of cell) {
            if (o.id <= e.id) continue; // each pair once
            let dx = e.pos.x - o.pos.x;
            let dy = e.pos.y - o.pos.y;
            let d2 = dx * dx + dy * dy;
            if (d2 >= r2) continue;
            if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = dx * dx + dy * dy; }
            const d = Math.sqrt(d2);
            // Position correction: resolve a fraction of the overlap each frame,
            // split between both enemies. Holds spacing even when the whole
            // horde is pressing in on the player.
            const k = (0.5 * stiffness * (r - d)) / d;
            e.pos.x += dx * k; e.pos.y += dy * k;
            o.pos.x -= dx * k; o.pos.y -= dy * k;
          }
        }
      }
    }
  }
}

/** Random point just outside the current camera view. */
function edgeSpawnPoint() {
  const c = getCamPos();
  const hw = width() / 2 + ENEMY_SPAWN.edgeMargin;
  const hh = height() / 2 + ENEMY_SPAWN.edgeMargin;
  switch (randi(4)) {
    case 0: return vec2(c.x + rand(-hw, hw), c.y - hh); // top
    case 1: return vec2(c.x + rand(-hw, hw), c.y + hh); // bottom
    case 2: return vec2(c.x - hw, c.y + rand(-hh, hh)); // left
    default: return vec2(c.x + hw, c.y + rand(-hh, hh)); // right
  }
}

/**
 * Start the spawn director. Call once per game scene.
 * Returns { level(), elapsed() } so HUD/debug can show the current enemy level.
 */
export function startEnemyDirector() {
  let elapsed = 0;
  let untilNext = 0;
  live.clear();
  cachedPlayer = null;

  onUpdate(() => {
    separateEnemies();

    elapsed += dt();
    untilNext -= dt();
    if (untilNext > 0) return;

    untilNext = Math.max(
      ENEMY_SPAWN.minInterval,
      ENEMY_SPAWN.startInterval - ENEMY_SPAWN.intervalDecayPerSec * elapsed,
    );

    const level = enemyLevelAt(elapsed);
    const batch = 1 + Math.floor(ENEMY_SPAWN.batchPerLevel * (level - 1));
    for (let i = 0; i < batch; i++) {
      if (live.size >= ENEMY_SPAWN.maxAlive) break;
      spawnEnemy(edgeSpawnPoint(), level);
    }
  });

  return {
    level: () => enemyLevelAt(elapsed),
    elapsed: () => elapsed,
    alive: liveEnemyCount,
  };
}
