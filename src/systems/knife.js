// Knife: weapon unlocked by the "weapon-knife" level up card. Throws a fan of
// knives in the direction the player faces. Every level: +damage. The path
// alternates: Lv2 +1 knife → Lv3 +1 pierce → Lv4 +1 knife → Lv5 +1 pierce.
// Damage goes through the shared projectile contract (enemies.js reads
// `damage` and `pierce`).
import { KNIFE } from "../config.js";

export function initKnife(player) {
  let level = 0;
  let cooldown = 0;

  player.on("upgrade", ({ id, level: lvl }) => {
    if (id === "weapon-knife") level = lvl;
  });

  onUpdate(() => {
    if (level === 0) return;
    cooldown -= dt();
    // no throwing while dead (respawn.js), after the run is over (runstate.js)
    // or with the dev playtest switch on (devtools.js, K / ?noattack)
    if (cooldown > 0 || player.down || player.frozen || player.attackDisabled || player.resting) return;

    const buffs = player.buffs ?? {};
    const stats = player.stats ?? {};
    cooldown = KNIFE.interval / (buffs.attackSpeedMult ?? 1) / (stats.attackSpeedMult ?? 1);
    const base = KNIFE.damage + KNIFE.damagePerLevel * (level - 1);
    const damage = base * (buffs.damageMult ?? 1) * (stats.damageMult ?? 1);
    const knives = 1 + Math.floor(level / 2); // +1 at Lv2, Lv4
    const pierce = 1 + Math.floor((level - 1) / 2); // +1 at Lv3, Lv5

    const facing = player.flipX ? Math.PI : 0;
    for (let i = 0; i < knives; i++) {
      const angle = facing + (i - (knives - 1) / 2) * KNIFE.spread;
      throwKnife(player.pos, vec2(Math.cos(angle), Math.sin(angle)), damage, pierce);
    }
  });
}

function throwKnife(from, dir, damage, pierce) {
  add([
    sprite("proj-knife", { anim: "spin" }),
    scale(2),
    pos(from),
    anchor("center"),
    area(),
    move(dir, KNIFE.speed),
    rotate(dir.angle()),
    opacity(1),
    lifespan(KNIFE.lifetime, { fade: 0.15 }),
    "projectile",
    "knife",
    { damage, pierce },
  ]);
}
