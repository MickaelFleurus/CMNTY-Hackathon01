// Active offense (shop quadrant "active-offense"): a tower next to the base
// that shoots the nearest enemy in range. It's the strongest pick, but it binds
// you to the base: enemies near the tower attack it, and if it's destroyed the
// run is over.
//
// Contract (no imports between systems):
//   - listens to getTreeRoot().on("shop-pick", { quadrant, level, params })
//   - placed at the "base" object + TOWER.offset (waits until a base exists)
//   - tagged "tower", with health(), hitRadius, aggroRange → enemies.js makes
//     nearby enemies target and hit it
//   - shots are "projectile"s with { damage } → enemies.js applies the hit
//   - on destruction: getTreeRoot().trigger("run-over", { reason: "tower-destroyed" })
//   - a new pick levels it up: stats rise and it's repaired to full HP
import boltUrl from "../../gfx/SurvivorsStarterKit_v1.0/Weapons/Projectiles/Proj_Magic_Bolt.png";
import { TOWER } from "../config.js";
import { resolveStats } from "../util/levelStat.js";

const QUADRANT = "active-offense";
const BOLT = "tower-bolt";

export function loadTowerSprites() {
  loadSprite(BOLT, boltUrl, {
    sliceX: 4,
    anims: { fly: { from: 0, to: 3, loop: true, speed: 12 } },
  });
}

export function startTower() {
  let tower = null;
  let pending = null; // pick received before a base existed

  getTreeRoot().on("shop-pick", (pick) => {
    if (pick?.quadrant !== QUADRANT) return;
    pending = pick;
  });

  onUpdate(() => {
    if (!pending) return;
    const base = get("base")[0];
    if (!base) return;
    const level = pending.level ?? 1;
    const stats = resolveStats(TOWER, level, pending.params);
    pending = null;
    if (!tower || !tower.exists()) tower = makeTower(base, stats);
    tower.level = level;
    Object.assign(tower.stats, stats);
    tower.setMaxHP(stats.hp);
    tower.setHP(stats.hp); // level-up repairs it
  });
}

function makeTower(base, stats) {
  const offset = vec2(...stats.offset);
  const tower = add([
    rect(stats.size, stats.size, { radius: 6 }),
    pos(base.pos.add(offset)),
    anchor("center"),
    color(120, 110, 150),
    outline(3, rgb(34, 24, 48)), // pack outline colour #221830
    health(stats.hp, stats.hp),
    z(5),
    "tower",
    {
      stats,
      level: 1,
      hitRadius: stats.hitRadius,
      aggroRange: stats.aggroRange,
      cooldown: 0,
    },
  ]);

  tower.onUpdate(() => {
    // stay attached to the base if it moves
    const b = get("base")[0];
    if (b) tower.pos = b.pos.add(offset);

    tower.cooldown -= dt();
    if (tower.cooldown > 0) return;
    const target = nearestEnemy(tower.pos, tower.stats.range);
    if (!target) return;
    tower.cooldown = tower.stats.fireInterval;
    shoot(tower.pos, target.pos, tower.stats);
  });

  tower.onHurt(() => {
    tower.color = rgb(255, 120, 120);
    wait(0.08, () => tower.exists() && (tower.color = rgb(120, 110, 150)));
  });

  tower.onDeath(() => {
    destroy(tower);
    getTreeRoot().trigger("run-over", { reason: "tower-destroyed" });
  });

  // HP bar above the tower
  tower.onDraw(() => {
    const w = stats.size + 12;
    const ratio = Math.max(0, tower.hp() / tower.maxHP());
    const y = -stats.size / 2 - 12;
    drawRect({ pos: vec2(-w / 2, y), width: w, height: 5, color: rgb(34, 24, 48) });
    drawRect({
      pos: vec2(-w / 2, y),
      width: w * ratio,
      height: 5,
      color: ratio > 0.3 ? rgb(110, 220, 120) : rgb(240, 80, 70),
    });
  });

  return tower;
}

function nearestEnemy(from, range) {
  let best = null;
  let bestD = range * range;
  for (const e of get("enemy")) {
    const dx = e.pos.x - from.x;
    const dy = e.pos.y - from.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function shoot(from, to, stats) {
  const dir = to.sub(from).unit();
  add([
    sprite(BOLT, { anim: "fly" }),
    scale(2),
    pos(from),
    anchor("center"),
    rotate(dir.angle()),
    move(dir, stats.projectileSpeed),
    offscreen({ destroy: true }),
    opacity(1), // required by lifespan()
    lifespan(stats.range / stats.projectileSpeed + 0.2),
    z(6),
    "projectile",
    { damage: stats.damage, hitRadius: 8 },
  ]);
}
