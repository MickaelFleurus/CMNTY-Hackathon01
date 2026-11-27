// Passive auras around the base (shop quadrants "passive-defense" and
// "passive-offense"). Each pick creates or levels up one aura; its radius grows
// with level so the player can roam further from home.
//
// Contract (no imports between systems):
//   - listens to getTreeRoot().on("shop-pick", { quadrant, level, params })
//   - centers on the object tagged "base" (does nothing until one exists)
//   - aura objects are tagged "aura" with { quadrant, level, radius, enemySlow? }
//     → enemies.js slows enemies inside (enemySlow)
//   - writes player.buffs every frame:
//       damageTaken      x on damage the player takes (defense aura)
//       damageMult       x on player weapon damage   (offense aura)
//       attackSpeedMult  x on player fire rate       (offense aura)
//     All 1 when outside every aura. Weapons read damageMult/attackSpeedMult.
import { AURA } from "../config.js";
import { resolveStats } from "../util/levelStat.js";

const QUADRANTS = Object.keys(AURA);
const NEUTRAL = { damageTaken: 1, damageMult: 1, attackSpeedMult: 1 };

export function startAuras() {
  const active = new Map(); // quadrant -> aura object

  getTreeRoot().on("shop-pick", (pick) => {
    if (!QUADRANTS.includes(pick?.quadrant)) return;
    const level = pick.level ?? 1;
    const stats = resolveStats(AURA[pick.quadrant], level, pick.params);
    const aura = active.get(pick.quadrant) ?? makeAura(pick.quadrant);
    active.set(pick.quadrant, aura);
    Object.assign(aura, stats, { level });
  });

  onUpdate(() => {
    const player = get("player")[0];
    if (!player) return;
    const buffs = { ...NEUTRAL };
    for (const aura of active.values()) {
      if (!aura.inactive && player.pos.dist(aura.pos) <= aura.radius) {
        if (aura.damageTaken !== undefined) buffs.damageTaken *= aura.damageTaken;
        if (aura.damageMult !== undefined) buffs.damageMult *= aura.damageMult;
        if (aura.attackSpeedMult !== undefined) buffs.attackSpeedMult *= aura.attackSpeedMult;
      }
    }
    player.buffs = buffs;
  });
}

function makeAura(quadrant) {
  const aura = add([
    pos(0, 0),
    z(-5), // above the ground, under characters
    "aura",
    { quadrant, radius: 0, inactive: true },
  ]);

  aura.onUpdate(() => {
    const base = get("base")[0];
    aura.inactive = !base; // no base, no aura (and no effect)
    if (base) aura.pos = base.pos.clone();
  });

  // Soft filled disc + ring; a gentle pulse so it reads as "active".
  aura.onDraw(() => {
    if (aura.inactive) return;
    const c = rgb(...aura.color);
    const pulse = 0.5 + 0.5 * Math.sin(time() * 2);
    drawCircle({ radius: aura.radius, color: c, opacity: 0.1 + 0.04 * pulse });
    drawCircle({
      radius: aura.radius,
      fill: false,
      outline: { width: 2, color: c, opacity: 0.5 },
    });
  });

  return aura;
}
