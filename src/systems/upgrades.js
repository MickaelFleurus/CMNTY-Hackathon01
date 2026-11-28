// Upgrade pool + level up screen (pick 1 of 3).
//
// Decision: level up is a paused overlay, not a separate scene. The game is
// frozen by pausing the whole object tree (getTreeRoot().paused = true), which
// stops every object update, onUpdate, loop() and wait(). Keyboard and mouse
// events still fire, so the cards are driven by global input handlers.
// (debug.timeScale = 0 was tried but crashes body() in kaplay 3001.0.19.)
//
// Contract: when the player picks a card this triggers
//   player.trigger("upgrade", { id, level })
// Owners of the stat apply the effect, e.g. in player.js:
//   player.on("upgrade", ({ id, level }) => { if (id === "move-speed") ... })
// "magnet" is applied here since pickup radius belongs to xp.js.
import { xpState } from "./xp.js";
import { UPGRADE } from "../config.js";
import { isFocusClick } from "../util/focusClick.js";

// Upgrade data shape: { id, name, description, icon, maxLevel, tint?, iconPath?, levels? }
// tint: optional [r, g, b] on the card icon (placeholder art, e.g. the Plank)
// iconPath: optional override when the icon is not in the Survivors pack
// levels: optional card text for Lv2, Lv3… (weapons: what that level adds,
//         docs/game-design-v2.md → "Weapons"); description is the Lv1 text
export const UPGRADES = [
  { id: "max-hp", name: "Max HP", description: "+20 max health", icon: "Icon_Max_HP", maxLevel: 5 },
  { id: "move-speed", name: "Move Speed", description: "+10% movement speed", icon: "Icon_Move_Speed", maxLevel: 5 },
  { id: "might", name: "Might", description: "+15% weapon damage", icon: "Icon_Might", maxLevel: 5 },
  { id: "cooldown", name: "Cooldown", description: "Weapons fire 10% faster", icon: "Icon_Cooldown", maxLevel: 5 },
  { id: "magnet", name: "Magnet", description: "Pick up XP and coins from further away", icon: "Icon_Magnet", maxLevel: 3 },
  { id: "weapon-knife", name: "Knife", description: "New weapon: throws knives", icon: "Icon_Knife", maxLevel: 5,
    levels: ["+1 knife, +damage", "Knives go through 1 more enemy, +damage", "+1 knife, +damage", "Knives go through 1 more enemy, +damage"] },
  // the old starter auto-attack (weapons.js), now a card: shoots the nearest enemy
  { id: "weapon-pistol", name: "Pistol", description: "New weapon: shoots the nearest enemy", icon: "Icon_Magic_Bolt", maxLevel: 5,
    levels: ["+1 bullet, +damage", "Fires faster, +damage", "+1 bullet, +damage", "Fires faster, +damage"] },
  // STARTER weapon: granted at level 1 when the run starts (main.js → grantUpgrade)
  { id: "weapon-plank", name: "Spectral Scythe", description: "Sweeps through enemies in a ghostly arc", icon: "Icon_Ghoul_Plank", iconPath: "gfx/ghoul/Icon_Ghoul_Plank.png", maxLevel: 5,
    levels: ["Longer reach, +damage", "Chains a 2nd sweep behind you, +damage", "Longer reach, +damage", "Chains a 3rd sweep in front, +damage"] },
  { id: "weapon-axe", name: "Axe", description: "New weapon: thrown up, falls through the horde", icon: "Icon_Axe", maxLevel: 5,
    levels: ["+1 axe, +damage", "Axes thrown to both sides, +damage", "+1 axe, +damage", "+1 axe, +damage"] },
  { id: "weapon-boomerang", name: "Boomerang", description: "New weapon: flies out and comes back", icon: "Icon_Boomerang", maxLevel: 5,
    levels: ["+1 boomerang, +damage", "Flies further, +damage", "+1 boomerang, +damage", "Flies further, +damage"] },
];

// id -> current level
export const ownedUpgrades = {};

export function loadUpgradeAssets() {
  for (const u of UPGRADES) {
    loadSprite(u.icon, u.iconPath ?? `gfx/SurvivorsStarterKit_v1.0/Weapons/Icons/${u.icon}.png`);
  }
}

function rollChoices() {
  const available = UPGRADES.filter((u) => (ownedUpgrades[u.id] ?? 0) < u.maxLevel);
  return shuffle(available).slice(0, UPGRADE.choices);
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randi(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Give an upgrade without the level up screen (e.g. the starter weapon). */
export function grantUpgrade(id) {
  const upgrade = UPGRADES.find((u) => u.id === id);
  if (upgrade && (ownedUpgrades[id] ?? 0) < upgrade.maxLevel) applyUpgrade(upgrade);
}

function applyUpgrade(upgrade) {
  const level = (ownedUpgrades[upgrade.id] ?? 0) + 1;
  ownedUpgrades[upgrade.id] = level;
  const player = get("player")[0];
  if (upgrade.id === "magnet") {
    xpState.pickupRadius += UPGRADE.magnetBonus;
    // coins (base.js) read the same bonus off the player
    if (player) player.magnetBonus = UPGRADE.magnetBonus * level;
  }
  if (player) player.trigger("upgrade", { id: upgrade.id, level });
}

let pending = 0;
let menuOpen = false;
let shopOpen = false;

export function initUpgrades() {
  for (const key of Object.keys(ownedUpgrades)) delete ownedUpgrades[key];
  pending = 0;
  menuOpen = false;

  on("levelup", "player", () => {
    pending += 1;
    if (!menuOpen && canOpenMenu()) openMenu();
  });
  // level ups are for field waves: one earned while the shop is open
  // (cycle.js / shop.js) waits until the shop closes
  shopOpen = false;
  getTreeRoot().on("shop-open", () => {
    shopOpen = true;
  });
  getTreeRoot().on("shop-close", () => {
    shopOpen = false;
    openPending();
  });
  // a level up earned right before dying waits for the respawn
  getTreeRoot().on("player-respawn", openPending);
  // a free card from a chest (chests.js): pick 1 of 3, the level doesn't change
  getTreeRoot().on("free-level-up-card", () => {
    pending += 1;
    openPending();
  });
  // another screen held the pause (golem style pick, golem chest): try again
  getTreeRoot().on("golem-style-pick", () => queueMicrotask(openPending));
  getTreeRoot().on("golem-chest-closed", () => queueMicrotask(openPending));
}

function openPending() {
  if (pending > 0 && !menuOpen && canOpenMenu()) openMenu();
}

// Other paused screens: never open on top of them (they own getTreeRoot().paused)
const OTHER_SCREENS = ["golem-style-ui", "golem-chest-ui"];

// no level up screen while dead (respawn.js), after the run is over
// (runstate.js), while the shop is open or another screen holds the pause
function canOpenMenu() {
  const p = get("player")[0];
  if (OTHER_SCREENS.some((tag) => get(tag).length > 0)) return false;
  return !!p && !p.down && !p.frozen && !shopOpen;
}

function openMenu() {
  const choices = rollChoices();
  if (choices.length === 0) {
    // everything is maxed out
    pending = 0;
    getTreeRoot().paused = false;
    return;
  }
  menuOpen = true;
  const root = getTreeRoot();
  root.paused = true;

  const ui = add([fixed(), z(1000), "levelup-ui"]);
  const handlers = [];
  const close = (picked) => {
    handlers.forEach((h) => h.cancel());
    ui.destroy();
    menuOpen = false;
    pending -= 1;
    applyUpgrade(picked);
    if (pending > 0) {
      // open the next menu after this input event finishes, otherwise the
      // same click/keypress would also pick a card in the new menu
      queueMicrotask(openMenu);
    } else {
      root.paused = false;
    }
  };

  // dim background
  ui.add([rect(width(), height()), color(0, 0, 0), opacity(0.6)]);
  ui.add([
    text(`LEVEL ${xpState.level}!`, { size: 48 }),
    pos(width() / 2, height() * 0.2),
    anchor("center"),
    color(255, 220, 90),
  ]);
  ui.add([
    text("Choose an upgrade (click or press 1-3)", { size: 20 }),
    pos(width() / 2, height() * 0.2 + 50),
    anchor("center"),
  ]);

  // fit 3 cards on a 720 px wide portrait phone too (CFG.viewport.portrait)
  const gap = width() < 900 ? 12 : 30;
  const cardW = Math.min(260, (width() - 32 - (choices.length - 1) * gap) / choices.length);
  const cardH = 300;
  const totalW = choices.length * cardW + (choices.length - 1) * gap;
  const startX = width() / 2 - totalW / 2 + cardW / 2;
  const cardY = height() * 0.58;
  const idleOutline = rgb(120, 110, 160);
  const hoverOutline = rgb(255, 220, 90);

  const cards = choices.map((u, i) => {
    const level = (ownedUpgrades[u.id] ?? 0) + 1;
    const center = vec2(startX + i * (cardW + gap), cardY);
    const card = ui.add([
      rect(cardW, cardH, { radius: 12 }),
      pos(center),
      anchor("center"),
      color(40, 36, 60),
      outline(3, idleOutline),
    ]);
    card.add([sprite(u.icon), anchor("center"), pos(0, -80), scale(5), ...(u.tint ? [color(...u.tint)] : [])]);
    card.add([text(u.name, { size: 26 }), anchor("center"), pos(0, 10)]);
    card.add([
      text(level === 1 ? "NEW" : `Level ${level}`, { size: 16 }),
      anchor("center"),
      pos(0, 42),
      color(255, 220, 90),
    ]);
    card.add([
      text((level > 1 && u.levels?.[level - 2]) || u.description, { size: 16, width: cardW - 30, align: "center" }),
      anchor("center"),
      pos(0, 90),
      color(200, 200, 220),
    ]);
    card.add([text(`Press ${i + 1}`, { size: 16 }), anchor("center"), pos(0, cardH / 2 - 20), opacity(0.6)]);
    return { card, center, upgrade: u };
  });

  // manual hit test: object hover/click events don't fire while paused
  const cardAt = (p) =>
    cards.find(({ center }) =>
      Math.abs(p.x - center.x) <= cardW / 2 && Math.abs(p.y - center.y) <= cardH / 2);

  handlers.push(
    onMouseMove(() => {
      const hit = cardAt(mousePos());
      cards.forEach((c) => { c.card.outline.color = c === hit ? hoverOutline : idleOutline; });
    }),
    onMousePress(() => {
      if (isFocusClick()) return; // the click that refocused the window: look first
      const hit = cardAt(mousePos());
      if (hit) close(hit.upgrade);
    }),
    ...choices.map((u, i) => onKeyPress(String(i + 1), () => close(u))),
  );
}
