// Applies level up card effects to the player.
//
// upgrades.js fires player.trigger("upgrade", { id, level }); this module turns
// that into stats. It writes ONLY player.stats, never player.buffs (auras.js
// overwrites buffs every frame). Weapons and movement multiply both:
//   damage   = base * buffs.damageMult      * stats.damageMult
//   cooldown = base / buffs.attackSpeedMult / stats.attackSpeedMult
//   speed    = base * stats.speedMult
// "magnet" is handled in upgrades.js, "weapon-knife" in knife.js.
import { UPGRADE } from "../config.js";

export function initUpgradeEffects(player) {
  player.stats = { speedMult: 1, damageMult: 1, attackSpeedMult: 1 };

  player.on("upgrade", ({ id, level }) => {
    switch (id) {
      case "max-hp":
        player.setMaxHP((player.maxHP() ?? player.hp()) + UPGRADE.maxHpPerLevel);
        player.heal(UPGRADE.maxHpPerLevel);
        break;
      case "move-speed":
        player.stats.speedMult = 1 + UPGRADE.moveSpeedPerLevel * level;
        break;
      case "might":
        player.stats.damageMult = 1 + UPGRADE.mightPerLevel * level;
        break;
      case "cooldown":
        player.stats.attackSpeedMult = 1 + UPGRADE.cooldownPerLevel * level;
        break;
    }
  });
}
