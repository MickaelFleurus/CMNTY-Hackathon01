// Pistol: the old MVP auto-attack - fires every CFG.weapon.fireInterval
// seconds at the nearest enemy within range. No longer the starter (the Plank
// is, see plank.js): it's unlocked by the "weapon-pistol" level up card.
// Every level: +damage. The path alternates: Lv2 +1 bullet (fan) → Lv3 faster
// fire → Lv4 +1 bullet → Lv5 faster fire.
// Enemies just need the "enemy" tag and a pos; no import coupling.
import { CFG } from "../config.js";

export function makeWeapon(player) {
  let cooldown = 0;
  let level = 0;
  player.on("upgrade", ({ id, level: lvl }) => {
    if (id === "weapon-pistol") level = lvl;
  });

  onUpdate(() => {
    if (level === 0) return;
    cooldown -= dt();
    // no firing while dead (respawn.js) or after the run is over (runstate.js)
    // attackDisabled: dev playtest switch (devtools.js, K / ?noattack)
    if (cooldown > 0 || player.down || player.frozen || player.attackDisabled) return;

    const target = nearestEnemy(player.pos, CFG.weapon.range);
    if (!target) return;

    // offense aura (auras.js) sets player.buffs; 1 when outside every aura.
    // Level up cards (upgrade-effects.js) set player.stats; stacks on top.
    const buffs = player.buffs ?? {};
    const stats = player.stats ?? {};
    const w = CFG.weapon;
    const faster = Math.pow(w.fasterFire, Math.floor((level - 1) / 2)); // Lv3, Lv5
    cooldown = (w.fireInterval * faster) / (buffs.attackSpeedMult ?? 1) / (stats.attackSpeedMult ?? 1);
    const damage = (w.damage + w.damagePerLevel * (level - 1)) * (buffs.damageMult ?? 1) * (stats.damageMult ?? 1);
    const bullets = 1 + Math.floor(level / 2); // Lv2, Lv4
    const aim = target.pos.sub(player.pos).angle();
    for (let i = 0; i < bullets; i++) {
      const a = aim + (i - (bullets - 1) / 2) * w.spread * (180 / Math.PI);
      fire(player.pos, player.pos.add(Vec2.fromAngle(a)), damage);
    }
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
    // collision system - see the shared contract in docs/tasks.md): it hurts
    // each overlapped enemy once and destroys the knife after `pierce` hits.
    { damage },
  ]);
}
