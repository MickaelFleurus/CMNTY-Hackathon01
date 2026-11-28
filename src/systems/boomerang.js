// Boomerang: weapon unlocked by the "weapon-boomerang" level up card. Flies
// out toward the nearest enemy (or the facing side), slows down at the end of
// its range, then comes back to the player - hitting enemies on the way out
// AND on the way back (its hit list resets when it turns).
// docs/game-design-v2.md → Weapons.
// Level path: Lv2 pierce +2 → Lv3 +1 boomerang → Lv4 +speed → Lv5 +damage.
//
// Damage goes through the shared projectile contract (enemies.js reads
// `damage`, `pierce`, `hitRadius`, and keeps `hitEnemies` per projectile).
import { BOOMERANG } from "../config.js";

export function initBoomerang(player) {
  let level = 0;
  let cooldown = 0;

  player.on("upgrade", ({ id, level: lvl }) => {
    if (id === "weapon-boomerang") level = lvl;
  });

  onUpdate(() => {
    if (level === 0) return;
    cooldown -= dt();
    // no throwing while dead (respawn.js), after the run is over (runstate.js)
    // or with the dev playtest switch on (devtools.js, K / ?noattack)
    if (cooldown > 0 || player.down || player.frozen || player.attackDisabled) return;

    const buffs = player.buffs ?? {};
    const stats = player.stats ?? {};
    cooldown = BOOMERANG.interval / (buffs.attackSpeedMult ?? 1) / (stats.attackSpeedMult ?? 1);
    const damage = (BOOMERANG.damage + (level >= 5 ? BOOMERANG.damageBonus : 0)) * (buffs.damageMult ?? 1) * (stats.damageMult ?? 1);
    const pierce = BOOMERANG.pierce + (level >= 2 ? BOOMERANG.pierceBonus : 0);
    const speed = level >= 4 ? BOOMERANG.speedMult : 1;
    const count = level >= 3 ? 2 : 1;

    const target = nearestEnemy(player.pos, BOOMERANG.aimRange);
    const aim = target ? target.pos.sub(player.pos).angle() : player.flipX ? 180 : 0;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * BOOMERANG.spread * (180 / Math.PI);
      throwBoomerang(player, Vec2.fromAngle(aim + offset), damage, pierce, speed);
    }
  });
}

function nearestEnemy(from, range) {
  let best = null;
  let bestD = range;
  for (const e of get("enemy")) {
    const d = e.pos.dist(from);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function throwBoomerang(player, dir, damage, pierce, speed) {
  const start = player.pos.clone();
  const outTime = BOOMERANG.outTime / speed;
  let t = 0;
  let back = false;
  const b = add([
    sprite("proj-boomerang", { anim: "spin" }),
    scale(BOOMERANG.scale),
    pos(start),
    anchor("center"),
    z(7),
    "projectile",
    "boomerang",
    { damage, pierce, hitRadius: BOOMERANG.hitRadius },
  ]);
  b.onUpdate(() => {
    t += dt();
    if (!back) {
      // ease out to full range, then turn around
      const k = Math.min(1, t / outTime);
      b.pos = start.add(dir.scale(BOOMERANG.range * (1 - (1 - k) * (1 - k))));
      if (k >= 1) {
        back = true;
        b.hitEnemies = new Set(); // can hit the same enemies again on the way back
        b.pierce = pierce;
      }
    } else {
      const to = player.pos.sub(b.pos);
      const step = BOOMERANG.returnSpeed * speed * dt();
      if (to.len() <= Math.max(step, 18)) {
        destroy(b); // caught
        return;
      }
      b.pos = b.pos.add(to.unit().scale(step));
    }
    if (t > BOOMERANG.maxLifetime) destroy(b);
  });
}
