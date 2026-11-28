// Guardian golem style (docs/game-design-v2.md → "The golem awakening flow"
// → pick 1 of 3 golem styles). The defensive, stay-home identity: a
// protective aura around the golem slows enemies inside, and a damage shield
// refreshes while the player is inside and holds a while after they leave.
//
// Per-style skill tree (docs/game-design-v2.md → "Golem skill tree"): the
// shop tree UI (shop.js) sells this style's GOLEM_SKILLS.guardian nodes and
// fires "golem-skill-pick" { style, id, level, params }; each pick re-resolves
// the node's params (levelStat specs at the NODE's level) on top of the style
// pick's stats and updates the live aura object. Different nodes may override
// the same stat - the LAST pick wins.
//
// Contract (no imports between systems):
//   - listens to getTreeRoot().on("golem-style-pick", { style, level?, params? })
//     → applies only to style "guardian"; the UI side fires it
//   - listens to getTreeRoot().on("golem-skill-pick", { style, id, level, params })
//     → applies only to this style's node ids (GOLEM_SKILLS.guardian)
//   - centers on the object tagged "base" (does nothing until one exists)
//   - the aura is an object tagged "aura" with { radius, enemySlow, color }
//     → enemies.js slows enemies inside (the strongest aura wins)
//   - writes player.shield (hp): absorbed before damage by enemies.js
//     (same shield as regen.js — they don't stack, they overwrite; regen's
//     shield lives REGEN.shieldDuration, ours GOLEM_GUARDIAN.shieldDuration)
//   - refreshes the shield only while the player is within `radius` of the
//     golem; on leaving it decays after shieldDuration s
//   - the "guardian-armor" node bumps the golem's max HP and heals it by the
//     bump (same behavior as a tower level-up repair in tower.js)
//   - stops on "run-over" / "golem-dying" (fx objects are cleared by runstate.js)
import { GOLEM_GUARDIAN as CFG, GOLEM_SKILLS } from "../config.js";
import { resolveStats } from "../util/levelStat.js";

const STYLE = "guardian";

export function startGolemGuardian() {
  let over = false;
  let base = null; // stats resolved from the style pick
  let overrides = {}; // plain-number stat overrides from skill picks (last wins)
  let stats = null; // { ...base, ...overrides } - closures read this live
  let aura = null; // the aura object, once created
  let armorLevel = 0; // guardian-armor node level (max HP bumps)

  getTreeRoot().on("run-over", () => (over = true));
  getTreeRoot().on("golem-dying", () => (over = true));

  getTreeRoot().on("golem-style-pick", (pick) => {
    if (over || pick?.style !== STYLE) return;
    base = resolveStats(CFG, pick.level ?? 1, pick.params);
    overrides = {};
    stats = { ...base, ...overrides };
    makeAura();
    startShield();
  });

  getTreeRoot().on("golem-skill-pick", (pick) => {
    if (over || pick?.style !== STYLE) return;
    const node = (GOLEM_SKILLS[STYLE] ?? []).find((n) => n.id === pick?.id);
    if (!node) return;
    const level = pick.level ?? 1;
    Object.assign(overrides, resolveStats(node.params, level));
    stats = { ...base, ...overrides };
    if (pick.id === "guardian-armor") armorLevel = level;
    if (aura) Object.assign(aura, { radius: stats.radius, enemySlow: stats.enemySlow, color: stats.color });
    applyArmor();
  });

  // Stone Skin: raise the golem's max HP to the node's hp spec and heal the
  // difference (mirrors tower.js's level-up repair).
  function applyArmor() {
    if (!armorLevel) return;
    const node = GOLEM_SKILLS[STYLE].find((n) => n.id === "guardian-armor");
    const hp = Math.round(resolveStats(node.params, armorLevel).hp);
    const golem = get("tower")[0] ?? get("base")[0];
    if (!golem?.maxHP || !golem.exists()) return;
    const bump = hp - golem.maxHP();
    if (bump <= 0) return;
    golem.setMaxHP(hp);
    golem.setHP(golem.hp() + bump);
  }

  function makeAura() {
    aura = add([
      pos(0, 0),
      z(-5), // same layer as the shop auras (auras.js)
      "aura",
      { radius: stats.radius, enemySlow: stats.enemySlow, color: stats.color },
    ]);
    aura.onUpdate(() => {
      const base = get("base")[0];
      if (!base || over) return aura.destroy();
      aura.pos = base.pos.clone();
    });
    aura.onDraw(() => {
      const c = rgb(stats.color[0], stats.color[1], stats.color[2]);
      const pulse = 0.5 + 0.5 * Math.sin(time() * 2);
      drawCircle({ radius: stats.radius, color: c, opacity: 0.1 + 0.04 * pulse });
      drawCircle({
        radius: stats.radius,
        fill: false,
        outline: { width: 2, color: c, opacity: 0.5 },
      });
    });
  }

  function startShield() {
    let left = 0; // s of shield left after leaving the aura
    onUpdate(() => {
      if (over) return;
      const player = get("player")[0];
      if (!player || player.down || player.frozen) return;
      const base = get("base")[0];
      if (!base) return;
      if (player.pos.dist(base.pos) <= stats.radius) {
        left = stats.shieldDuration; // re-armed while inside
        player.shield = Math.max(player.shield ?? 0, stats.shield);
      } else if (left > 0) {
        left -= dt();
        if (left <= 0) player.shield = 0;
      }
    });

    // Shield bubble around the player while it holds (same look as regen.js,
    // in the Guardian's gray-white).
    add([
      pos(0, 0),
      z(50),
      "fx",
      {
        draw() {
          const player = get("player")[0];
          if (!player || !(player.shield > 0)) return;
          drawCircle({
            pos: player.pos,
            radius: 22,
            fill: false,
            outline: {
              width: 2,
              color: rgb(stats.color[0], stats.color[1], stats.color[2]),
              opacity: 0.8,
            },
          });
        },
      },
    ]);
  }
}
