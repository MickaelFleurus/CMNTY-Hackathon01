// Axe: weapon unlocked by the "weapon-axe" level up card. Thrown up in an arc
// toward the facing side, it spins and falls back down through the horde,
// hitting everything on its way (high pierce). docs/game-design-v2.md → Weapons.
// Every level: +damage. Path: Lv2 +1 axe → Lv3 thrown to both sides →
// Lv4 +1 axe → Lv5 +1 axe. Axes on the same side fan out (different throw
// strengths) so they land apart.
//
// Damage goes through the shared projectile contract (enemies.js reads
// `damage`, `pierce`, `hitRadius`).
import { AXE } from "../config.js";

export function initAxe(player) {
  let level = 0;
  let cooldown = 0;

  player.on("upgrade", ({ id, level: lvl }) => {
    if (id === "weapon-axe") level = lvl;
  });

  onUpdate(() => {
    if (level === 0) return;
    cooldown -= dt();
    // no throwing while dead (respawn.js), after the run is over (runstate.js)
    // or with the dev playtest switch on (devtools.js, K / ?noattack)
    if (cooldown > 0 || player.down || player.frozen || player.attackDisabled) return;

    const buffs = player.buffs ?? {};
    const stats = player.stats ?? {};
    cooldown = AXE.interval / (buffs.attackSpeedMult ?? 1) / (stats.attackSpeedMult ?? 1);
    const damage = (AXE.damage + AXE.damagePerLevel * (level - 1)) * (buffs.damageMult ?? 1) * (stats.damageMult ?? 1);
    const count = 1 + (level >= 2) + (level >= 4) + (level >= 5); // +1 axe at Lv2, Lv4, Lv5
    const bothSides = level >= 3;

    const facing = player.flipX ? -1 : 1;
    const sides = Array.from({ length: count }, (_, i) => (bothSides && i % 2 === 1 ? -facing : facing));
    for (const side of [facing, -facing]) {
      const mine = sides.filter((s) => s === side).length;
      // fan out: the k-th of `mine` axes on this side is thrown a bit further
      for (let k = 0; k < mine; k++) {
        const reach = mine === 1 ? 1 : 0.55 + (0.9 * k) / (mine - 1);
        throwAxe(player.pos, side, reach, damage, AXE.pierce);
      }
    }
  });
}

function throwAxe(from, side, reach, damage, pierce) {
  let vel = vec2(side * AXE.launchSide * reach * rand(0.9, 1.1), -AXE.launchUp * rand(0.92, 1.08));
  const axe = add([
    sprite("proj-axe", { anim: "spin" }),
    scale(AXE.scale),
    pos(from),
    anchor("center"),
    rotate(0),
    opacity(1),
    lifespan(AXE.lifetime, { fade: 0.2 }),
    z(7), // over walkers: it flies above them
    "projectile",
    "axe",
    { damage, pierce, hitRadius: AXE.hitRadius },
  ]);
  axe.onUpdate(() => {
    vel = vel.add(0, AXE.gravity * dt());
    axe.pos = axe.pos.add(vel.scale(dt()));
    axe.angle += AXE.spin * side * dt();
  });
}
