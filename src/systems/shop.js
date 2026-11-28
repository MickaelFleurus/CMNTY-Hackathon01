// Golem upgrades as a SKILL TREE (docs/game-design-v2.md → "Upgrade UI
// rework" and "Between waves: repair or upgrade the golem"). Opens at the
// golem during the break and sells exactly one upgrade per break.
//
// Layout: one branch (column) per shop option / quadrant (passive-defense,
// passive-offense, active-defense, active-offense). Each branch is a chain of
// nodes, Lv1 at the bottom growing up to its maxLevel. Owned nodes are filled,
// the NEXT node of each branch carries its key hint (1-4) and the price,
// later nodes are locked. Keyboard-driven like the level-up screen: press a
// branch's key (or click its next node) to buy it; E / Esc or the Skip button
// leaves without buying. Colors follow the art direction: defense branches
// white / gray, offense branches red.
//
// Price (docs → "Upgrade cost"): ONE shared counter,
//   cost = SHOP.upgradeCost.baseCost × SHOP.upgradeCost.costGrowth ^ upgradesOwned
// so every next upgrade costs the same whatever branch it's in.
//
// The shop only SELLS: it deducts coins and fires the root event
//   getTreeRoot().trigger("shop-pick", pick)
// with pick = { id, quadrant, level, params } - the effect systems
// (auras / regen / tower) apply the params. The pick's level comes from this
// shop's purchase history (upgrading = buying the same option again).
//
// Contract (unchanged):
//   - getTreeRoot().on("shop-open", () => …)        opened by the cycle flow
//   - getTreeRoot().on("shop-close", () => …)       fired here after a pick / skip
//   - the UI root is tagged "shop-ui" (pause.js won't pause over it)
//   - new: getTreeRoot().trigger("shop-refused", { id, cost, coins }) when the
//     player tries to buy without enough coins (sound list: "purchase refused")
//   - Enemies are cleared and the next wave starts by the cycle director
//     when it hears "shop-close".
import { SHOP } from "../config.js";
import { getCoins, addCoins } from "./base.js";
import { isFocusClick } from "../util/focusClick.js";

let spritesLoaded = false;

export function loadShopSprites() {
  if (spritesLoaded) return;
  spritesLoaded = true;
  const icons = ["Armor", "Might", "Regen", "Lightning"];
  for (const name of icons) {
    loadSprite(
      "icon-" + name.toLowerCase(),
      `gfx/SurvivorsStarterKit_v1.0/Weapons/Icons/Icon_${name}.png`,
    );
  }
}

// Branch order = key order (1-4) and left-to-right columns.
const BRANCHES = [
  { quadrant: "passive-defense", label: "PASSIVE · DEFENSE", color: [205, 215, 235] },
  { quadrant: "passive-offense", label: "PASSIVE · OFFENSE", color: [240, 140, 125] },
  { quadrant: "active-defense", label: "ACTIVE · DEFENSE", color: [245, 245, 250] },
  { quadrant: "active-offense", label: "ACTIVE · OFFENSE", color: [240, 70, 60] },
];
const DARK = [20, 14, 28];
const GOLD = [255, 220, 90];

export function makeShop() {
  // levels: purchases per option id, across the whole run
  const levels = {};
  let upgradesOwned = 0;
  let ui = null;

  const costNow = () => {
    const c = SHOP.upgradeCost;
    return Math.floor(c.baseCost * Math.pow(c.costGrowth, upgradesOwned));
  };

  function isOpen() {
    return ui !== null;
  }

  function open() {
    if (ui) return;
    const branches = BRANCHES.map((b, i) => ({
      ...b,
      key: String(i + 1),
      opt: SHOP.options.find((o) => o.quadrant === b.quadrant),
    })).filter((b) => b.opt);

    let clock = 0;
    let hover = null; // branch under the mouse, or "skip"
    let refused = null; // { branch, until } red flash when too poor

    const L = SHOP.tree;
    const colW = L.colWidth;
    const startX = width() / 2 - (branches.length * colW + (branches.length - 1) * L.colGap) / 2;
    const colX = (i) => startX + i * (colW + L.colGap);
    const nodeAt = (b, lvl) => {
      // lvl 1 at the bottom, maxLevel at the top
      const span = L.nodesBottom - L.nodesTop;
      const step = b.opt.maxLevel > 1 ? span / (b.opt.maxLevel - 1) : 0;
      return vec2(colX(branches.indexOf(b)) + colW / 2, L.nodesBottom - (lvl - 1) * step);
    };
    const skipRect = { x: width() / 2 - 160, y: L.skipY, w: 320, h: 44 };

    ui = add([
      pos(0, 0),
      fixed(),
      z(1000), // over the HUD, like the level-up screen
      "shop-ui",
      {
        draw() {
          drawRect({ pos: vec2(0, 0), width: width(), height: height(), color: rgb(12, 10, 20), opacity: 0.86 });

          // title + coins + price
          drawText({ text: "GOLEM UPGRADES", size: 34, pos: vec2(width() / 2, 30), anchor: "top", color: rgb(...GOLD) });
          drawText({
            text: `Coins ${getCoins()}   ·   next upgrade costs ${costNow()}`,
            size: 16,
            pos: vec2(width() / 2, 74),
            anchor: "top",
            color: rgb(210, 210, 225),
          });
          drawText({
            text: "One upgrade per break. Press the key next to a glowing node (1-4), or click it.",
            size: 13,
            pos: vec2(width() / 2, 98),
            anchor: "top",
            color: rgb(150, 150, 170),
          });

          branches.forEach((b, i) => drawBranch(b, i));
          drawSkip();
        },
      },
    ]);

    function drawBranch(b, i) {
      const x = colX(i);
      const lvl = levels[b.opt.id] ?? 0;
      const max = lvl >= b.opt.maxLevel;
      const cost = costNow();
      const canAfford = getCoins() >= cost;
      const col = rgb(...b.color);
      const isHover = hover === b;
      const flash = refused?.branch === b && clock < refused.until;

      // column card
      drawRect({
        pos: vec2(x, L.headerY),
        width: colW,
        height: L.skipY - 20 - L.headerY,
        radius: 10,
        color: rgb(30, 26, 44),
        opacity: isHover ? 0.95 : 0.75,
        outline: { width: 2, color: isHover ? rgb(...GOLD) : rgb(70, 62, 96) },
      });
      // header: icon, name, branch label, description
      if (getSprite(b.opt.icon)) drawSprite({ sprite: b.opt.icon, pos: vec2(x + 30, L.headerY + 30), anchor: "center", scale: 2.5 });
      drawText({ text: b.opt.name, size: 20, pos: vec2(x + 56, L.headerY + 14), color: col });
      drawText({ text: b.label, size: 10, pos: vec2(x + 56, L.headerY + 38), color: rgb(150, 150, 170) });
      drawText({
        text: b.opt.desc.replace(/\n/g, " "),
        size: 12,
        width: colW - 24,
        pos: vec2(x + 12, L.headerY + 62),
        color: rgb(200, 200, 215),
      });
      drawText({
        text: max ? "MAX" : `Lv ${lvl} / ${b.opt.maxLevel}`,
        size: 12,
        pos: vec2(x + colW - 12, L.headerY + 38),
        anchor: "topright",
        color: max ? rgb(...GOLD) : rgb(180, 180, 200),
      });

      // links between nodes
      for (let l = 1; l < b.opt.maxLevel; l++) {
        drawLine({ p1: nodeAt(b, l), p2: nodeAt(b, l + 1), width: 4, color: l < lvl ? col : rgb(60, 54, 80) });
      }

      // nodes
      for (let l = 1; l <= b.opt.maxLevel; l++) {
        const at = nodeAt(b, l);
        const r = L.nodeRadius;
        if (l === lvl + 1) {
          // the next node: glowing, its level inside, the key hint badge to
          // the left and the price to the right
          const pulse = 0.5 + 0.5 * Math.sin(clock * 5);
          const ring = flash ? rgb(235, 70, 60) : canAfford ? rgb(...GOLD) : rgb(150, 110, 110);
          drawCircle({ pos: at, radius: r + 5 + 2 * pulse, color: ring, opacity: canAfford || flash ? 0.35 : 0.15 });
          drawCircle({ pos: at, radius: r, color: rgb(40, 34, 56), outline: { width: 3, color: ring } });
          drawText({ text: String(l), size: 14, pos: at, anchor: "center", color: canAfford ? rgb(...GOLD) : rgb(170, 140, 140) });
          const kb = at.add(-(r + 22), 0);
          drawRect({ pos: kb, width: 24, height: 24, anchor: "center", radius: 5, color: canAfford ? rgb(...GOLD) : rgb(120, 100, 100) });
          drawText({ text: b.key, size: 16, pos: kb, anchor: "center", color: rgb(...DARK) });
          drawText({
            text: `${cost} coins`,
            size: 13,
            pos: at.add(r + 10, 0),
            anchor: "left",
            color: flash ? rgb(255, 110, 100) : canAfford ? rgb(140, 230, 140) : rgb(220, 110, 100),
          });
          if (flash) drawText({ text: "Not enough coins", size: 12, pos: at.add(r + 10, 16), anchor: "left", color: rgb(255, 110, 100) });
        } else if (l <= lvl) {
          drawCircle({ pos: at, radius: r, color: col, outline: { width: 2, color: rgb(...DARK) } });
          drawText({ text: String(l), size: 13, pos: at, anchor: "center", color: rgb(...DARK) });
        } else {
          drawCircle({ pos: at, radius: r - 3, color: rgb(34, 30, 46), outline: { width: 2, color: rgb(70, 62, 96) } });
          drawText({ text: String(l), size: 11, pos: at, anchor: "center", color: rgb(90, 84, 110) });
        }
      }
    }

    function drawSkip() {
      const hot = hover === "skip";
      drawRect({
        pos: vec2(skipRect.x, skipRect.y),
        width: skipRect.w,
        height: skipRect.h,
        radius: 8,
        color: hot ? rgb(84, 74, 110) : rgb(60, 52, 80),
        outline: { width: 2, color: rgb(150, 140, 180) },
      });
      const keys = SHOP.skipKeys.map((k) => (k === "escape" ? "Esc" : k.toUpperCase())).join(" / ");
      drawText({ text: `Skip - no upgrade (${keys})`, size: 15, pos: vec2(width() / 2, skipRect.y + skipRect.h / 2), anchor: "center" });
    }

    // input: manual hit tests (the game is time-scaled to 0 behind the shop)
    const inSkip = (p) => p.x >= skipRect.x && p.x <= skipRect.x + skipRect.w && p.y >= skipRect.y && p.y <= skipRect.y + skipRect.h;
    const branchAt = (p) =>
      branches.find((b, i) => p.x >= colX(i) && p.x <= colX(i) + colW && p.y >= L.headerY && p.y <= L.skipY - 20);

    const handlers = [
      onUpdate(() => {
        clock += 1 / 60; // real frames: dt() is 0 while the shop pauses the game
      }),
      onMouseMove(() => {
        const p = mousePos();
        hover = inSkip(p) ? "skip" : branchAt(p) ?? null;
      }),
      onMousePress(() => {
        if (isFocusClick()) return; // the click that refocused the window
        const p = mousePos();
        if (inSkip(p)) return close();
        const b = branchAt(p);
        if (b) buy(b);
      }),
      ...branches.map((b) => onKeyPress(b.key, () => buy(b))),
    ];
    ui.onDestroy(() => handlers.forEach((h) => h.cancel()));

    function buy(b) {
      const opt = b.opt;
      const level = levels[opt.id] ?? 0;
      if (level >= opt.maxLevel) return;
      const cost = costNow();
      if (getCoins() < cost) {
        refused = { branch: b, until: clock + 0.8 };
        getTreeRoot().trigger("shop-refused", { id: opt.id, cost, coins: getCoins() });
        return;
      }
      addCoins(-cost);
      levels[opt.id] = level + 1;
      upgradesOwned += 1;
      close();
      getTreeRoot().trigger("shop-pick", {
        id: opt.id,
        quadrant: opt.quadrant,
        level: levels[opt.id],
        params: opt.params,
      });
    }
  }

  function close() {
    if (!ui) return;
    destroy(ui);
    ui = null;
    getTreeRoot().trigger("shop-close");
  }

  getTreeRoot().on("shop-open", open);

  // Free golem upgrade (a rare chest / treasure reward, chests.js): the next
  // node of a random branch that isn't maxed, at no cost and without raising
  // upgradesOwned (docs → "Chests (visible)").
  getTreeRoot().on("golem-upgrade-free", () => {
    const open = SHOP.options.filter((o) => (levels[o.id] ?? 0) < o.maxLevel);
    if (!open.length) return;
    const opt = choose(open);
    levels[opt.id] = (levels[opt.id] ?? 0) + 1;
    getTreeRoot().trigger("shop-pick", { id: opt.id, quadrant: opt.quadrant, level: levels[opt.id], params: opt.params, free: true });
    getTreeRoot().trigger("golem-upgraded-free", { id: opt.id, name: opt.name, level: levels[opt.id] });
  });

  // Skip without buying: SHOP.skipKeys or the Skip button. The cycle
  // director starts the next wave on shop-close, as after a pick.
  onKeyPress(SHOP.skipKeys, () => ui && close());

  return { open, close, isOpen, levels: () => ({ ...levels }), upgradesOwned: () => upgradesOwned };
}
