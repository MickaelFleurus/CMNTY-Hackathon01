// HUD (docs/game-design-v2.md → "HUD redesign"). Screen parts are fixed() so
// they ignore the camera.
//
//   bottom left   HP orb (Diablo-style: red liquid in a dark glass ball, value
//                 on top, blue shield ring; grey with the respawn countdown
//                 while dead), level badge, weapon slots (icon + level pips),
//                 a row of stat upgrade icons, and the XP bar as the slots'
//                 underline. "Next death" cost above them.
//   top center    wave number + survival timer (the golem HP bar under them
//                 is base-alert.js)
//   top right     coins and kills, icon + number
//   world         small HP bar under the player, green → amber → red
//
// It sits bottom left (Diablo-style), keeping the top for wave, timer and
// the golem bar. HUD.orb / HUD.slot in config.js move it.
//
// The survival timer runs on dt(), so it stops while the game is paused
// (level up screen, shop) and when the run is over (player.frozen).
//
// Reads (no imports from other owners' systems):
//   - getTreeRoot().on("wave-start", n)              wave number (enemies.js)
//   - on("killed", "enemy", ...)                      kill count (enemies.js)
//   - getTreeRoot().on("coins-changed", n)           coin total (base.js)
//   - player.hp() / player.maxHP()                    player object
//   - player.shield                                   from regen.js (ring on the orb)
//   - player.down / respawnIn / nextRespawn           from respawn.js
//   - player.canRespawn                               false in wave 1 (respawn.js)
//   - "pickup-coin" sprite (base.js), "enemy-zombie-0" sprite (enemies.js)
//   (golem HP is drawn by base-alert.js as a bar under the timer)
import { xpState } from "./xp.js";
import { UPGRADES, ownedUpgrades } from "./upgrades.js";
import { HUD } from "../config.js";
import { hpColor, HP_EMPTY } from "../util/hpColor.js";
import { iconScale } from "../util/iconScale.js";

export const hudState = {
  wave: 0,
  kills: 0,
  coins: 0,
  time: 0, // s survived this run
};

// 83 -> "1:23"
export function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const DARK = [20, 14, 28];

export function initHud() {
  hudState.wave = 0;
  hudState.kills = 0;
  hudState.coins = 0;
  hudState.time = 0;

  getTreeRoot().on("wave-start", (n) => {
    hudState.wave = n;
  });
  on("killed", "enemy", () => {
    hudState.kills += 1;
  });
  getTreeRoot().on("coins-changed", (n) => {
    hudState.coins = n;
  });

  const hud = add([fixed(), z(900), "hud"]);

  const waveLabel = hud.add([
    text("", { size: HUD.textSize + 10 }),
    pos(width() / 2, HUD.xpBarHeight + HUD.margin),
    anchor("top"),
  ]);
  const timeLabel = hud.add([
    text("", { size: HUD.textSize }),
    pos(width() / 2, HUD.xpBarHeight + HUD.margin + HUD.textSize + 16),
    anchor("top"),
    color(200, 200, 220),
  ]);

  hud.onUpdate(() => {
    const p = get("player")[0];
    // keep centered when the screen size changes (phone rotation, fill mode)
    waveLabel.pos.x = timeLabel.pos.x = width() / 2;
    waveLabel.text = hudState.wave > 0 ? `WAVE ${hudState.wave}` : "";
    if (!p?.frozen) hudState.time += dt();
    timeLabel.text = formatTime(hudState.time);
  });

  // everything else is drawn each frame
  hud.add([
    pos(0, 0),
    {
      draw() {
        const p = get("player")[0];
        if (!p) return;
        drawOrb(p);
        drawSlots(p);
        drawCounters();
      },
    },
  ]);

  // small hp bar that follows the player (world space)
  add([
    pos(0, 0),
    z(50),
    {
      draw() {
        const p = get("player")[0];
        if (!p?.hp || p.down) return;
        const ratio = Math.max(0, Math.min(1, p.hp() / (p.maxHP() || 1)));
        const at = p.pos.add(-HUD.hpBarWidth / 2, HUD.hpBarOffset);
        drawRect({ pos: at.sub(1, 1), width: HUD.hpBarWidth + 2, height: HUD.hpBarHeight + 2, color: rgb(...DARK), opacity: 0.8 });
        drawRect({ pos: at, width: HUD.hpBarWidth, height: HUD.hpBarHeight, color: rgb(...HP_EMPTY) });
        if (ratio > 0) drawRect({ pos: at, width: HUD.hpBarWidth * ratio, height: HUD.hpBarHeight, color: hpColor(ratio) });
      },
    },
  ]);
}

/** HP orb: liquid height = HP / max HP, drawn as horizontal slices of the circle. */
function drawOrb(p) {
  const { x, y, r } = HUD.orb;
  const c = vec2(x, height() - y);
  const dead = !!p.down;
  const ratio = dead ? 0 : Math.max(0, Math.min(1, p.hp() / (p.maxHP() || 1)));

  drawCircle({ pos: c, radius: r + 4, color: rgb(...DARK), opacity: 0.9 }); // rim
  drawCircle({ pos: c, radius: r, color: rgb(40, 34, 52) }); // dark glass

  // liquid: slices from the bottom up to the fill line
  const top = c.y + r - ratio * 2 * r;
  const step = 2;
  const liquid = ratio <= 0.25 ? rgb(235, 60, 50) : rgb(200, 30, 40);
  for (let sy = c.y + r - step; sy >= top - 0.01; sy -= step) {
    const dy = sy + step / 2 - c.y;
    const half = Math.sqrt(Math.max(0, r * r - dy * dy));
    if (half <= 0) continue;
    drawRect({ pos: vec2(c.x - half, sy), width: half * 2, height: step, color: liquid });
  }
  // a little wave on the surface, and a glass highlight
  if (ratio > 0.02 && ratio < 0.98) {
    const dy = top - c.y;
    const half = Math.sqrt(Math.max(0, r * r - dy * dy));
    const wob = Math.sin(time() * 3) * 1.5;
    drawRect({ pos: vec2(c.x - half, top - 2 + wob), width: half * 2, height: 2, color: rgb(255, 120, 110), opacity: 0.7 });
  }
  drawCircle({ pos: c.add(-r * 0.35, -r * 0.4), radius: r * 0.22, color: rgb(255, 255, 255), opacity: 0.12 });

  // shield (regen.js): blue ring around the orb
  if (!dead && p.shield > 0) {
    drawCircle({ pos: c, radius: r + 4, fill: false, outline: { width: 4, color: rgb(110, 190, 255) } });
  }

  // value on top
  const label = dead ? `${Math.ceil(p.respawnIn ?? 0)}s` : `${Math.max(0, Math.ceil(p.hp()))}/${p.maxHP()}`;
  const size = dead ? 26 : 18;
  drawText({ text: label, size, pos: c.add(1, 1), anchor: "center", color: rgb(...DARK) });
  drawText({ text: label, size, pos: c, anchor: "center", color: rgb(255, 255, 255) });
  if (dead) drawText({ text: "RESPAWN", size: 11, pos: c.add(0, 20), anchor: "center", color: rgb(220, 220, 230) });
}

/** Level badge + weapon slots (icon, level pips) + stat icons + XP underline. */
function drawSlots(p) {
  const { x: ox, y: oy, r } = HUD.orb;
  const s = HUD.slot;
  const x0 = ox + r + 18;
  const bottom = height() - oy + r; // aligned with the orb's bottom
  const slotsY = bottom - s.size - 14; // room for the XP line under the slots

  // level badge
  const badge = vec2(x0 + 18, slotsY + s.size / 2);
  drawCircle({ pos: badge, radius: 19, color: rgb(...DARK), opacity: 0.9 });
  drawCircle({ pos: badge, radius: 16, color: rgb(70, 120, 220) });
  drawText({ text: "LV", size: 9, pos: badge.add(0, -7), anchor: "center", color: rgb(220, 230, 255) });
  drawText({ text: String(xpState.level), size: 15, pos: badge.add(0, 5), anchor: "center", color: rgb(255, 255, 255) });

  // weapon slots: owned weapons in the order you got them, empty frames after
  const weapons = owned((id) => id.startsWith("weapon-"));
  const sx = x0 + 46;
  for (let i = 0; i < Math.max(s.weaponSlots, weapons.length); i++) {
    const at = vec2(sx + i * (s.size + s.gap), slotsY);
    drawRect({ pos: at, width: s.size, height: s.size, radius: 6, color: rgb(...DARK), opacity: 0.95 });
    drawRect({ pos: at, width: s.size, height: s.size, radius: 6, fill: false, outline: { width: 2, color: rgb(90, 80, 120) } });
    const w = weapons[i];
    if (!w) continue;
    drawIcon(w.upgrade, at.add(s.size / 2, s.size / 2 - 4), 2);
    // level pips under the icon
    for (let l = 0; l < w.upgrade.maxLevel; l++) {
      const pip = at.add(s.size / 2 + (l - (w.upgrade.maxLevel - 1) / 2) * 7, s.size - 6);
      drawCircle({ pos: pip, radius: 2.4, color: l < w.level ? rgb(255, 220, 90) : rgb(80, 75, 95) });
    }
  }

  // XP: the underline of the slot row
  const lineW = Math.max(s.weaponSlots, weapons.length) * (s.size + s.gap) - s.gap + 46;
  const lineY = slotsY + s.size + 6;
  const xp = Math.max(0, Math.min(1, xpState.xp / xpState.toNext));
  drawRect({ pos: vec2(x0, lineY), width: lineW, height: 6, radius: 3, color: rgb(...DARK), opacity: 0.85 });
  if (xp > 0) drawRect({ pos: vec2(x0, lineY), width: lineW * xp, height: 6, radius: 3, color: rgb(80, 170, 255) });

  // stat upgrades: small icons with their level, above the weapon slots
  const stats = owned((id) => !id.startsWith("weapon-"));
  stats.forEach((st, i) => {
    const at = vec2(sx + i * (s.statSize + 6), slotsY - s.statSize - 8);
    drawRect({ pos: at, width: s.statSize, height: s.statSize, radius: 4, color: rgb(...DARK), opacity: 0.95 });
    drawIcon(st.upgrade, at.add(s.statSize / 2, s.statSize / 2), 1.25);
    drawText({ text: String(st.level), size: 10, pos: at.add(s.statSize - 2, s.statSize - 1), anchor: "botright", color: rgb(255, 220, 90) });
  });

  // what the next death costs (respawn.js), above the stats
  let next = "";
  if (!p.down && p.canRespawn === false) next = "Next death: run over";
  else if (!p.down && p.nextRespawn != null) next = `Next death: ${p.nextRespawn}s`;
  if (next) {
    const y = slotsY - (stats.length ? s.statSize + 8 : 0) - 16;
    const col = p.canRespawn === false ? rgb(255, 140, 130) : rgb(200, 200, 220);
    drawText({ text: next, size: 13, pos: vec2(x0, y), anchor: "left", color: col });
  }
}

/** Coins and kills, top right: icon + number on a dark pill. */
function drawCounters() {
  const right = width() - HUD.margin;
  const y = HUD.counters.y;
  const rows = [
    { sprite: "pickup-coin", value: hudState.coins, color: rgb(255, 220, 90) },
    { sprite: "enemy-zombie-0", value: hudState.kills, color: rgb(230, 230, 240) },
  ];
  rows.forEach((row, i) => {
    const cy = y + i * 34;
    const label = String(row.value);
    const w = 44 + label.length * 12;
    drawRect({ pos: vec2(right - w, cy - 14), width: w, height: 28, radius: 14, color: rgb(...DARK), opacity: 0.75 });
    if (getSprite(row.sprite)) {
      drawSprite({ sprite: row.sprite, frame: 0, pos: vec2(right - w + 18, cy), anchor: "center", scale: 1.6 });
    }
    drawText({ text: label, size: 18, pos: vec2(right - 12, cy), anchor: "right", color: row.color });
  });
}

/** Owned upgrades matching `filter`, in the order they were picked. */
function owned(filter) {
  return Object.entries(ownedUpgrades)
    .filter(([id, level]) => level > 0 && filter(id))
    .map(([id, level]) => ({ upgrade: UPGRADES.find((u) => u.id === id), level }))
    .filter((o) => o.upgrade);
}

/** size = the scale a 16 px pack icon gets (2 -> 32 px); bigger art is fitted to that. */
function drawIcon(upgrade, at, size) {
  if (!getSprite(upgrade.icon)) return;
  drawSprite({
    sprite: upgrade.icon,
    pos: at,
    anchor: "center",
    scale: iconScale(upgrade.icon, 16 * size),
    color: upgrade.tint ? rgb(...upgrade.tint) : undefined,
  });
}
