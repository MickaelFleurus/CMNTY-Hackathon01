// Axe: weapon unlocked by the "weapon-axe" level up card. Thrown up in an arc
// toward the facing side, it spins and falls back down through the horde,
// hitting everything on its way (high pierce). docs/game-design-v2.md → Weapons.
// Level path: Lv2 +damage → Lv3 pierce +3 → Lv4 +1 axe → Lv5 +area.
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
    const damage = (AXE.damage + (level >= 2 ? AXE.damageBonus : 0)) * (buffs.damageMult ?? 1) * (stats.damageMult ?? 1);
    const pierce = AXE.pierce + (level >= 3 ? AXE.pierceBonus : 0);
    const area = level >= 5 ? AXE.areaMult : 1;
    const count = level >= 4 ? 2 : 1;

    const facing = player.flipX ? -1 : 1;
    for (let i = 0; i < count; i++) {
      // the second axe goes the other way, so the pair covers both sides
      const side = i === 0 ? facing : -facing;
      throwAxe(player.pos, side, damage, pierce, area);
    }
  });
}

function throwAxe(from, side, damage, pierce, area) {
  let vel = vec2(side * AXE.launchSide * rand(0.6, 1.2), -AXE.launchUp * rand(0.9, 1.1));
  const axe = add([
    sprite("proj-axe", { anim: "spin" }),
    scale(AXE.scale * area),
    pos(from),
    anchor("center"),
    rotate(0),
    opacity(1),
    lifespan(AXE.lifetime, { fade: 0.2 }),
    z(7), // over walkers: it flies above them
    "projectile",
    "axe",
    { damage, pierce, hitRadius: AXE.hitRadius * area },
  ]);
  axe.onUpdate(() => {
    vel = vel.add(0, AXE.gravity * dt());
    axe.pos = axe.pos.add(vel.scale(dt()));
    axe.angle += AXE.spin * side * dt();
  });
}
