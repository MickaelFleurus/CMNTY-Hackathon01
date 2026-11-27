// Active defense (shop quadrant "active-defense"): while the player is within
// range of the base, heal them every `interval` seconds. From
// REGEN.shieldFromLevel, each heal also grants a short damage shield.
//
// Contract (no imports between systems):
//   - listens to getTreeRoot().on("shop-pick", { quadrant, level, params })
//   - centers on the object tagged "base" (does nothing until one exists)
//   - player.shield (hp) is absorbed before damage by enemies.js; it expires
//     after REGEN.shieldDuration
//   - heals never exceed the player's max HP (maxHP() or CFG.player.maxHp)
import { REGEN, CFG } from "../config.js";
import { resolveStats } from "../util/levelStat.js";

const QUADRANT = "active-defense";

export function startRegen() {
  let stats = null; // null until picked
  let level = 0;
  let untilTick = 0;
  let shieldTimer = 0;

  getTreeRoot().on("shop-pick", (pick) => {
    if (pick?.quadrant !== QUADRANT) return;
    level = pick.level ?? 1;
    stats = resolveStats(REGEN, level, pick.params);
  });

  onUpdate(() => {
    const player = get("player")[0];
    if (!player) return;

    // shield expiry
    if (shieldTimer > 0) {
      shieldTimer -= dt();
      if (shieldTimer <= 0) player.shield = 0;
    }

    const base = get("base")[0];
    if (!stats || !base || player.down) return;
    if (player.pos.dist(base.pos) > stats.range) {
      untilTick = Math.min(untilTick, stats.interval); // ready on re-entry
      return;
    }

    untilTick -= dt();
    if (untilTick > 0) return;
    untilTick = stats.interval;

    const maxHp = player.maxHP?.() ?? CFG.player.maxHp;
    const healed = Math.min(stats.heal, maxHp - player.hp());
    if (healed > 0) {
      player.setHP(player.hp() + healed);
      floatText(player.pos, `+${Math.round(healed)}`, [90, 230, 110]);
    }
    if (level >= stats.shieldFromLevel && stats.shield > 0) {
      player.shield = Math.max(player.shield ?? 0, stats.shield);
      shieldTimer = stats.shieldDuration;
    }
  });

  // Shield bubble around the player while it holds.
  add([
    pos(0, 0),
    z(50),
    {
      draw() {
        const player = get("player")[0];
        if (!player || !(player.shield > 0)) return;
        drawCircle({
          pos: player.pos,
          radius: 22,
          fill: false,
          outline: { width: 2, color: rgb(150, 220, 255), opacity: 0.8 },
        });
      },
    },
  ]);
}

function floatText(at, msg, rgbValues) {
  const t = add([
    text(msg, { size: 16 }),
    pos(at.add(0, -24)),
    anchor("center"),
    color(...rgbValues),
    opacity(1),
    z(60),
    lifespan(0.8, { fade: 0.5 }),
  ]);
  t.onUpdate(() => t.move(0, -30));
}
