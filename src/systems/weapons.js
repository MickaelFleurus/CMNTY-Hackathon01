// Auto-attack weapons: the "laser pistol" MVP — fires every CFG.weapon.fireInterval
// seconds at the nearest enemy within range. Enemies just need the "enemy" tag
// and a pos (Mickael's system); no import coupling.
import { CFG } from "../config.js";

export function makeWeapon(player) {
  let cooldown = 0;

  onUpdate(() => {
    cooldown -= dt();
    if (cooldown > 0 || player.down) return; // no firing while dead (respawn.js)

    const target = nearestEnemy(player.pos, CFG.weapon.range);
    if (!target) return;

    // offense aura (auras.js) sets player.buffs; 1 when outside every aura
    const buffs = player.buffs ?? {};
    cooldown = CFG.weapon.fireInterval / (buffs.attackSpeedMult ?? 1);
    fire(player.pos, target.pos, CFG.weapon.damage * (buffs.damageMult ?? 1));
  });
}

function nearestEnemy(from, range) {
  let best = null;
  let bestDist = range;
  for (const enemy of get("enemy")) {
    const d = enemy.pos.sub(from).len();
    if (d < bestDist) {
      best = enemy;
      bestDist = d;
    }
  }
  return best;
}

function fire(from, targetPos, damage) {
  const dir = targetPos.sub(from).unit();

  add([
    sprite("proj-knife", { anim: "spin" }),
    scale(2),
    pos(from),
    anchor("center"),
    area(),
    move(dir, CFG.weapon.projectileSpeed),
    rotate(dir.angle()),
    offscreen({ destroy: true }),
    opacity(1),
    lifespan(1.2, { fade: 0.2 }),
    "projectile",
    // Damage on contact is applied by enemies.js (enemies aren't in KAPLAY's
    // collision system — see the shared contract in docs/tasks.md): it hurts
    // each overlapped enemy once and destroys the knife after `pierce` hits.
    { damage },
  ]);
}
