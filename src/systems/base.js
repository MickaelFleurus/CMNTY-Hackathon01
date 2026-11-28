// The player's home base: a fixed structure at CFG.home that anchors the v2
// loop (wave out → portal home → shop). The base itself is a visual anchor
// for now - passives/actives chosen in the shop attach to it (tasks-v2 #3,
// Mickael). Enemies don't interact with it yet; the tower/boss tasks make it
// targetable later.
//
// Contract (no imports needed - use KAPLAY tags/events):
//   - The base carries the "base" tag at SHOP.home.
//   - Kills MAY pay out coins: listens on("drop","enemy") for kind "coin"
//     (enemies.js rolls ONE drop per kill: XP, heart, coin or nothing) and
//     spawns a coin pickup at the enemy's death position; coins fly to the player inside
//     SHOP.coins.magnetRadius and are collected on contact. Coin count lives
//     on root event state - read it via the exported getCoins()/addCoins()
//     helpers or listen for the "coins-changed" root event.
//   - getTreeRoot().on("coins-changed", (coins) => …)   every coin change
//   - spawnCoins(n, pos)   helper for other systems to grant coins (boss rewards)
import { SHOP } from "../config.js";

// ---------------------------------------------------------------------------
// sprite loading (called once from main.js before the game scene builds)
// ---------------------------------------------------------------------------
let spritesLoaded = false;

export function loadBaseSprites() {
  if (spritesLoaded) return;
  spritesLoaded = true;
  loadSprite("base-golem", "gfx/SurvivorsStarterKit_v1.0/Bosses/Boss_Stone_Golem.png", {
    sliceX: 8, // 256x128: 8 cols x 4 rows of 32x32
    sliceY: 4,
    anims: {
      idle: { from: 0, to: 3, loop: true, speed: 8 },
    },
  });
  loadSprite("pickup-coin", "gfx/SurvivorsStarterKit_v1.0/Pickups/Pickup_Coin.png", {
    sliceX: 4,
    anims: { spin: { from: 0, to: 3, loop: true, speed: 6 } },
  });
}

// ---------------------------------------------------------------------------
// coins (module state - one economy shared by base/shop/hud)
// ---------------------------------------------------------------------------
let coins = 0;

export function getCoins() {
  return coins;
}

export function addCoins(n) {
  coins += n;
  getTreeRoot().trigger("coins-changed", coins);
}

// Spawns n coins scattered around pos (boss rewards, etc).
export function spawnCoins(n, pos) {
  for (let i = 0; i < n; i++) {
    spawnCoin(pos.add(rand(vec2(-14, 14), vec2(-14, 14))));
  }
}

// ---------------------------------------------------------------------------
// base + coin pickups
// ---------------------------------------------------------------------------
export function makeBase() {
  // coin drops (one roll per kill in enemies.js) roll out from the death spot;
  // the amount follows this economy, not the drop's value
  on("drop", "enemy", (/** @type {any} */ _, /** @type {any} */ drop) => {
    if (drop?.kind !== "coin") return;
    const extra = Math.floor((drop.level ?? 1) * SHOP.coins.perLevelBonus);
    spawnCoin(drop.pos ?? _.pos, SHOP.coins.perKill + extra);
  });

  const base = add([
    sprite("base-golem", { anim: "idle" }),
    scale(SHOP.spriteScale),
    pos(SHOP.home.x, SHOP.home.y),
    anchor("bot"),
    z(5),
    area(),
    "base",
  ]);

  base.add([
    text("BASE", { size: 12 }),
    anchor("bot"),
    pos(0, 2),
    opacity(0.8),
  ]);

  return base;
}

function spawnCoin(at, value = SHOP.coins.perKill) {
  const coin = add([
    sprite("pickup-coin", { anim: "spin" }),
    pos(at.x, at.y),
    anchor("center"),
    scale(1.5),
    z(4),
    "coin",
    { value, homing: false, age: 0 },
  ]);

  coin.onUpdate(() => {
    coin.age += dt();
    if (coin.age > SHOP.coins.lifetime) {
      destroy(coin);
      return;
    }
    const p = get("player")[0];
    if (!p) return;
    const d = p.pos.dist(coin.pos);
    if (coin.homing || d < SHOP.coins.magnetRadius) {
      coin.homing = true;
      const step = p.pos.sub(coin.pos);
      coin.pos = coin.pos.add(step.len() > 1 ? step.unit().scale(SHOP.coins.flySpeed * dt()) : step);
      if (d < SHOP.coins.collectRadius) {
        addCoins(coin.value);
        getTreeRoot().trigger("pickup-collected", { kind: "coin", value: coin.value }); // run-stats.js
        destroy(coin);
      }
    }
  });
}
