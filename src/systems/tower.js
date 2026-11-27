// The base IS the tower (docs/game-design-v2.md): from the start of the run
// the "base" object gets HP and the "tower" tag, enemies attack it, and when
// it's destroyed the run is over. The active-offense shop pick makes it shoot
// the nearest enemy in range; each further pick levels it up and repairs it.
//
// Contract (no imports between systems):
//   - attaches to the object tagged "base" (base.js) once it exists: adds
//     health() + the "tower" tag → enemies.js targets it and hits it on contact
//   - listens to getTreeRoot().on("shop-pick", { quadrant: "active-offense", level, params })
//   - shots are "projectile"s with { damage } → enemies.js applies the hit
//   - on destruction: getTreeRoot().trigger("run-over", { reason: "tower-destroyed" })
//     (fired once). This is the run's ONLY lose condition.
import boltUrl from "../../gfx/SurvivorsStarterKit_v1.0/Weapons/Projectiles/Proj_Magic_Bolt.png";
import { TOWER } from "../config.js";
import { levelStat, resolveStats } from "../util/levelStat.js";

const QUADRANT = "active-offense";
const BOLT = "tower-bolt";

export function loadTowerSprites() {
  loadSprite(BOLT, boltUrl, {
    sliceX: 4,
    anims: { fly: { from: 0, to: 3, loop: true, speed: 12 } },
  });
}

export function startTower() {
  let tower = null; // the base, once armed
  let picks = 0; // active-offense pick level (0 = doesn't shoot)
  let params = {};
  let shot = null; // shooting stats, null until picked
  let cooldown = 0;
  let over = false;

  const maxHpFor = (p) => Math.round(levelStat(params.hp ?? TOWER.hp, p + 1));

  getTreeRoot().on("shop-pick", (pick) => {
    if (pick?.quadrant !== QUADRANT) return;
    picks = pick.level ?? picks + 1;
    params = pick.params ?? {};
    shot = resolveStats(TOWER, picks, params);
    if (tower) {
      tower.setMaxHP(maxHpFor(picks));
      tower.setHP(tower.maxHP()); // level-up repairs it
    }
  });

  onUpdate(() => {
    if (!tower) {
      const base = get("base")[0];
      if (base) tower = arm(base);
      return;
    }
    if (over || !tower.exists()) return;

    cooldown -= dt();
    if (!shot || cooldown > 0) return;
    const from = center(tower);
    const target = nearestEnemy(from, shot.range);
    if (!target) return;
    cooldown = shot.fireInterval;
    shoot(from, target.pos, shot);
  });

  function arm(base) {
    const hp = maxHpFor(picks);
    base.use(health(hp, hp));
    if (!base.has("color")) base.use(color(255, 255, 255)); // for the hurt flash
    base.tag("tower");

    base.onHurt(() => {
      base.color = rgb(255, 140, 140);
      wait(0.08, () => base.exists() && (base.color = rgb(255, 255, 255)));
    });

    base.onDeath(() => {
      if (over) return;
      over = true;
      base.untag("tower"); // enemies stop targeting it
      getTreeRoot().trigger("run-over", { reason: "tower-destroyed" });
    });

    // HP bar above the base (separate object so the base's scale doesn't apply)
    add([
      pos(0, 0),
      z(50),
      {
        draw() {
          if (!base.exists()) return;
          const box = base.worldArea().bbox();
          const w = Math.max(60, box.width * 0.8);
          const x = box.pos.x + box.width / 2 - w / 2;
          const y = box.pos.y - 12;
          const ratio = Math.max(0, base.hp() / base.maxHP());
          drawRect({ pos: vec2(x - 1, y - 1), width: w + 2, height: 8, color: rgb(34, 24, 48) });
          drawRect({
            pos: vec2(x, y),
            width: w * ratio,
            height: 6,
            color: ratio > 0.3 ? rgb(110, 220, 120) : rgb(240, 80, 70),
          });
        },
      },
    ]);

    return base;
  }
}

/** Visual center of the base (its anchor is "bot"). */
function center(obj) {
  const b = obj.worldArea().bbox();
  return vec2(b.pos.x + b.width / 2, b.pos.y + b.height / 2);
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
