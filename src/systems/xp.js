// XP gems + other pickups (hearts, coins) and the leveling curve.
//
// Contract with the other systems (no imports between systems):
//   - Listens to on("drop", "enemy", (enemy, { kind, pos, value })) from
//     enemies.js and spawns a pickup there. Kinds: "xp-*" give xp,
//     "heart" heals the player, "coin"/"coin-bag" give coins.
//   - Pickups are tagged "xp-gem" (xp) or "pickup" (others). Collection is a
//     distance check, not area(), so lots of gems stay cheap.
//   - Writes to the player object so others can read it without imports:
//       player.level   current level (enemies.js spawn conditions read this)
//       player.coins   coin total (the shop spends it by lowering it)
//   - On level up: player.trigger("levelup", level)
import { XP, PICKUP_SPRITES } from "../config.js";

// Shared xp state, read by hud.js and upgrades.js
export const xpState = {
  xp: 0,
  level: 1,
  toNext: xpForLevel(1),
  pickupRadius: XP.pickupRadius,
};

export function xpForLevel(level) {
  return XP.firstLevel + (level - 1) * XP.levelStep;
}

export function loadXpAssets() {
  for (const [kind, file] of Object.entries(PICKUP_SPRITES)) {
    loadSprite(`pickup-${kind}`, `gfx/SurvivorsStarterKit_v1.0/Pickups/${file}`, {
      sliceX: 4,
      anims: { spin: { from: 0, to: 3, loop: true, speed: 6 } },
    });
  }
}

function player() {
  return get("player")[0];
}

export function spawnPickup(position, kind, value) {
  if (!PICKUP_SPRITES[kind]) return null;
  const isXp = kind.startsWith("xp-");
  const pickup = add([
    sprite(`pickup-${kind}`, { anim: "spin" }),
    pos(position),
    anchor("center"),
    scale(XP.pickupScale),
    opacity(1),
    lifespan(XP.pickupLifetime, { fade: 1 }),
    z(-1), // under characters
    isXp ? "xp-gem" : "pickup",
    { kind, value },
  ]);

  pickup.onUpdate(() => {
    const p = player();
    if (!p) return;
    const dist = pickup.pos.dist(p.pos);
    if (dist < XP.collectRadius) {
      collect(p, pickup);
    } else if (dist < xpState.pickupRadius) {
      pickup.moveTo(p.pos, XP.magnetSpeed);
    }
  });
  return pickup;
}

function collect(p, pickup) {
  const { kind, value } = pickup;
  pickup.destroy();
  if (kind.startsWith("xp-")) {
    addXp(value);
  } else if (kind === "heart") {
    p.heal?.(XP.heartHeal);
  } else if (kind.startsWith("coin")) {
    p.coins = (p.coins ?? 0) + (value || XP.coinValue);
  }
}

export function addXp(amount) {
  xpState.xp += amount;
  while (xpState.xp >= xpState.toNext) {
    xpState.xp -= xpState.toNext;
    xpState.level += 1;
    xpState.toNext = xpForLevel(xpState.level);
    const p = player();
    if (p) {
      p.level = xpState.level;
      p.trigger("levelup", xpState.level);
    }
  }
}

export function initXp() {
  xpState.xp = 0;
  xpState.level = 1;
  xpState.toNext = xpForLevel(1);
  xpState.pickupRadius = XP.pickupRadius;

  const p = player();
  if (p) {
    p.level = 1;
    p.coins = p.coins ?? 0;
    // health(hp) without a max lets heal() overshoot; cap at the starting hp
    if (p.maxHP?.() == null && p.hp) p.setMaxHP(p.hp());
  }

  on("drop", "enemy", (_enemy, { kind, pos: dropPos, value }) => {
    spawnPickup(dropPos.clone(), kind, value);
  });
}
