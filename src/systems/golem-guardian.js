// Guardian golem style (docs/game-design-v2.md → "The golem awakening flow"
// → pick 1 of 3 golem styles). The defensive, stay-home identity: a
// protective aura around the golem slows enemies inside, and a damage shield
// refreshes while the player is inside and holds a while after they leave.
//
// Contract (no imports between systems):
//   - listens to getTreeRoot().on("golem-style-pick", { style, level?, params? })
//     → applies only to style "guardian"; the UI side fires it
//   - centers on the object tagged "base" (does nothing until one exists)
//   - the aura is an object tagged "aura" with { radius, enemySlow, color }
//     → enemies.js slows enemies inside (the strongest aura wins)
//   - writes player.shield (hp): absorbed before damage by enemies.js
//     (same shield as regen.js — they don't stack, they overwrite; regen's
//     shield lives REGEN.shieldDuration, ours GOLEM_GUARDIAN.shieldDuration)
//   - refreshes the shield only while the player is within `radius` of the
//     golem; on leaving it decays after shieldDuration s
//   - stops on "run-over" / "golem-dying" (fx objects are cleared by runstate.js)
import { GOLEM_GUARDIAN as CFG } from "../config.js";
import { resolveStats } from "../util/levelStat.js";

const STYLE = "guardian";

export function startGolemGuardian() {
  let over = false;
  getTreeRoot().on("run-over", () => (over = true));
  getTreeRoot().on("golem-dying", () => (over = true));

  getTreeRoot().on("golem-style-pick", (pick) => {
    if (over || pick?.style !== STYLE) return;
    const stats = resolveStats(CFG, pick.level ?? 1, pick.params);
    makeAura(stats);
    startShield(stats);
  });

  function makeAura(stats) {
    const aura = add([
      pos(0, 0),
      z(-5), // same layer as the shop auras (auras.js)
      "aura",
      { radius: stats.radius, enemySlow: stats.enemySlow, color: stats.color },
    ]);
    aura.onUpdate(() => {
      const base = get("base")[0];
      if (!base || over) return aura.destroy();
      aura.pos = base.pos.clone();
    });
    aura.onDraw(() => {
      const c = rgb(stats.color[0], stats.color[1], stats.color[2]);
      const pulse = 0.5 + 0.5 * Math.sin(time() * 2);
      drawCircle({ radius: stats.radius, color: c, opacity: 0.1 + 0.04 * pulse });
      drawCircle({
        radius: stats.radius,
        fill: false,
        outline: { width: 2, color: c, opacity: 0.5 },
      });
    });
  }

  function startShield(stats) {
    let left = 0; // s of shield left after leaving the aura
    onUpdate(() => {
      if (over) return;
      const player = get("player")[0];
      if (!player || player.down || player.frozen) return;
      const base = get("base")[0];
      if (!base) return;
      if (player.pos.dist(base.pos) <= stats.radius) {
        left = CFG.shieldDuration; // re-armed while inside
        player.shield = Math.max(player.shield ?? 0, stats.shield);
      } else if (left > 0) {
        left -= dt();
        if (left <= 0) player.shield = 0;
      }
    });

    // Shield bubble around the player while it holds (same look as regen.js,
    // in the Guardian's gray-white).
    add([
      pos(0, 0),
      z(50),
      "fx",
      {
        draw() {
          const player = get("player")[0];
          if (!player || !(player.shield > 0)) return;
          drawCircle({
            pos: player.pos,
            radius: 22,
            fill: false,
            outline: {
              width: 2,
              color: rgb(stats.color[0], stats.color[1], stats.color[2]),
              opacity: 0.8,
            },
          });
        },
      },
    ]);
  }
}
