// Auto-attack weapons: the "laser pistol" MVP — fires every CFG.weapon.fireInterval
// seconds at the nearest enemy within range. Enemies just need the "enemy" tag
// and a pos (Mickael's system); no import coupling.
import { CFG } from "../config.js";

export function makeWeapon(player) {
  let cooldown = 0;

  onUpdate(() => {
    cooldown -= dt();
    if (cooldown > 0) return;

    const target = nearestEnemy(player.pos, CFG.weapon.range);
    if (!target) return;

    cooldown = CFG.weapon.fireInterval;
    fire(player.pos, target.pos);
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

function fire(from, targetPos) {
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
  ]);

  // damage on contact — the shared contract from docs/tasks.md
  onCollideUpdate("projectile", "enemy", (_, enemy) => {
    if (enemy.hp?.() !== undefined) enemy.hurt(CFG.weapon.damage);
  });
}
