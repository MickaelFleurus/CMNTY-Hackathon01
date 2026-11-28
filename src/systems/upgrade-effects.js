// Applies level up card effects to the player.
//
// upgrades.js fires player.trigger("upgrade", { id, level }); this module turns
// that into stats. It writes ONLY player.stats, never player.buffs (auras.js
// overwrites buffs every frame). Weapons and movement multiply both:
//   damage   = base * buffs.damageMult      * stats.damageMult
//   cooldown = base / buffs.attackSpeedMult / stats.attackSpeedMult
//   speed    = base * stats.speedMult
// "magnet" is handled in upgrades.js; weapon cards in their own files:
// "weapon-knife" knife.js, "weapon-plank" plank.js, "weapon-axe" axe.js,
// "weapon-boomerang" boom-stick.js.
//
// Rage (rare bonus drop, bonus.js): while player.rage = { damageMult,
// attackSpeedMult } is set, it multiplies on top of the card stats. bonus.js
// fires player.trigger("rage-changed") when it starts or ends; the stats are
// rebuilt from the card levels, so a level up during Rage can't lose it.
import { UPGRADE } from "../config.js";

export function initUpgradeEffects(player) {
  const levels = { "move-speed": 0, might: 0, cooldown: 0 };

  const rebuild = () => {
    const rage = player.rage ?? {};
    player.stats = {
      speedMult: 1 + UPGRADE.moveSpeedPerLevel * levels["move-speed"],
      damageMult: (1 + UPGRADE.mightPerLevel * levels.might) * (rage.damageMult ?? 1),
      attackSpeedMult: (1 + UPGRADE.cooldownPerLevel * levels.cooldown) * (rage.attackSpeedMult ?? 1),
    };
  };
  rebuild();

  player.on("upgrade", ({ id, level }) => {
    if (id === "max-hp") {
      player.setMaxHP((player.maxHP() ?? player.hp()) + UPGRADE.maxHpPerLevel);
      player.heal(UPGRADE.maxHpPerLevel);
    } else if (id in levels) {
      levels[id] = level;
      rebuild();
    }
  });
  player.on("rage-changed", rebuild);
}
