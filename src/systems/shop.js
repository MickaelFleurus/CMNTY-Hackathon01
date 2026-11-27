// Shop: opens at the base when the player enters a portal, shows the 2x2
// grid (passive-defense / passive-offense / active-defense / active-offense,
// see docs/game-design-v2.md), and sells exactly one pick per cycle.
//
// The shop only SELLS: it deducts coins and fires the root event
//   getTreeRoot().trigger("shop-pick", pick)
// with pick = { id, quadrant, level, params } — the effect systems
// (auras/regen/tower, tasks-v2 #3, Mickael) apply the params. The pick's
// level comes from this shop's purchase history (upgrading = buying the
// same option again).
//
// Contract:
//   - getTreeRoot().on("shop-open", () => …)        opened by the cycle flow
//   - getTreeRoot().on("shop-close", () => …)       fired here after a pick
//   - Enemies are cleared and the next wave starts by the cycle director
//     when it hears "shop-close".
//   - While the shop is open the game keeps running (enemies may still be
//     around after a timeout wave); player input is NOT disabled.
import { CFG, SHOP } from "../config.js";
import { getCoins, addCoins } from "./base.js";

let spritesLoaded = false;

export function loadShopSprites() {
  if (spritesLoaded) return;
  spritesLoaded = true;
  // 20 upgrade icons in one sheet? No — individual Icon_*.png files.
  const icons = ["Armor", "Might", "Regen", "Lightning"];
  for (const name of icons) {
    loadSprite(
      "icon-" + name.toLowerCase(),
      `gfx/SurvivorsStarterKit_v1.0/Weapons/Icons/Icon_${name}.png`,
    );
  }
}

export function makeShop() {
  // levels: purchases per option id, across the whole run
  const levels = {};
  let ui = null;

  function isOpen() {
    return ui !== null;
  }

  function open() {
    if (ui) return;
    // opened by the cycle director when the player is at the golem (no teleport)
    ui = add([pos(0, 0), z(50), fixed(), "shop-ui"]);
    ui.add([
      rect(CFG.viewport.width, CFG.viewport.height),
      color(20, 18, 30),
      opacity(0.82),
      anchor("topleft"),
    ]);
    ui.add([
      text("SHOP — pick one (coins: " + getCoins() + ")", { size: 26 }),
      pos(60, 40),
    ]);

    const q = SHOP.options;
    const cells = [
      { x: 120, y: 120, opt: q.find((o) => o.quadrant === "passive-defense") },
      { x: 480, y: 120, opt: q.find((o) => o.quadrant === "passive-offense") },
      { x: 120, y: 330, opt: q.find((o) => o.quadrant === "active-defense") },
      { x: 480, y: 330, opt: q.find((o) => o.quadrant === "active-offense") },
    ];

    for (const c of cells) {
      if (!c.opt) continue;
      buildCell(ui, c.opt, c.x, c.y, levels, buy);
    }
  }

  function buy(opt) {
    const level = levels[opt.id] ?? 0;
    if (level >= opt.maxLevel) return;
    const cost = Math.floor(opt.baseCost * Math.pow(opt.costGrowth, level));
    if (getCoins() < cost) return;
    addCoins(-cost);
    levels[opt.id] = level + 1;
    close();
    getTreeRoot().trigger("shop-pick", {
      id: opt.id,
      quadrant: opt.quadrant,
      level: levels[opt.id],
      params: opt.params,
    });
  }

  function close() {
    if (!ui) return;
    destroy(ui);
    ui = null;
    getTreeRoot().trigger("shop-close");
  }

  getTreeRoot().on("shop-open", open);

  // E closes the shop without buying (skip pick for now — cycle director
  // decides what happens; for MVP the next wave starts on pick OR skip)
  onKeyPress("e", () => ui && close());

  return { open, close, isOpen, levels: () => ({ ...levels }) };
}

function buildCell(ui, opt, x, y, levels, buy) {
  const level = levels[opt.id] ?? 0;
  const cost = Math.floor(opt.baseCost * Math.pow(opt.costGrowth, level));
  const affordable = getCoins() >= cost && level < opt.maxLevel;

  const cell = ui.add([
    pos(x, y),
    rect(300, 180),
    area({ scale: 1 }),
    fixed(),
    color(affordable ? 40 : 32, affordable ? 44 : 30, 60),
    opacity(0.95),
    anchor("topleft"),
    "shop-cell",
    { opt },
  ]);
  cell.add([sprite(opt.icon), pos(26, 30), anchor("center"), scale(2)]);
  cell.add([text(opt.name, { size: 18 }), pos(50, 18)]);
  cell.add([text(opt.desc, { size: 11 }), pos(16, 60)]);
  cell.add([
    text(
      level >= opt.maxLevel
        ? "MAX"
        : `lv ${level} — cost ${cost}`,
      { size: 14 },
    ),
    pos(16, 140),
    color(affordable ? [120, 220, 120] : [200, 90, 90]),
  ]);
  cell.onClick(() => buy(opt));
}
