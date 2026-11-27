// HUD: xp bar, wave number, survival timer, level, HP, coins, kills, plus a
// small HP bar under the player. Screen parts use fixed() so they ignore the
// camera. The survival timer runs on dt(), so it stops while the game is
// paused (level up screen, shop) and when the run is over (player.frozen).
//
// Reads (no imports from other owners' systems):
//   - getTreeRoot().on("wave-start", n)              wave number (enemies.js)
//   - on("killed", "enemy", ...)                      kill count (enemies.js)
//   - getTreeRoot().on("coins-changed", n)           coin total (base.js)
//   - player.hp() / player.maxHP()                    player object
//   - player.shield                                   from regen.js (shown when > 0)
//   - player.down / respawnIn / nextRespawn           from respawn.js
//   - get("base")[0].hp() / maxHP()                   the base is the tower (base.js)
import { xpState } from "./xp.js";
import { HUD } from "../config.js";

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

  // xp bar along the top edge
  hud.add([rect(width(), HUD.xpBarHeight), pos(0, 0), color(30, 30, 50)]);
  const xpBar = hud.add([rect(0, HUD.xpBarHeight), pos(0, 0), color(80, 170, 255)]);

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

  const stats = hud.add([
    text("", { size: HUD.textSize, align: "right" }),
    pos(width() - HUD.margin, HUD.xpBarHeight + HUD.margin),
    anchor("topright"),
  ]);

  hud.onUpdate(() => {
    const p = get("player")[0];
    xpBar.width = width() * (xpState.xp / xpState.toNext);
    waveLabel.text = hudState.wave > 0 ? `WAVE ${hudState.wave}` : "";
    if (!p?.frozen) hudState.time += dt();
    timeLabel.text = formatTime(hudState.time);
    let hp = "";
    if (p?.down) {
      hp = `DEAD - respawn in ${Math.ceil(p.respawnIn ?? 0)}s`;
    } else if (p?.hp) {
      hp = `HP ${Math.max(0, Math.ceil(p.hp()))}/${p.maxHP()}`;
      if (p.shield > 0) hp += `\nShield ${Math.ceil(p.shield)}`;
      if (p.nextRespawn != null) hp += `\nNext death: ${p.nextRespawn}s`;
    }
    const base = get("base")[0];
    const baseHp = base?.hp ? `\nBase ${Math.max(0, Math.ceil(base.hp()))}/${base.maxHP()}` : "";
    stats.text = `LV ${xpState.level}\n${hp}${baseHp}\nCoins ${hudState.coins}\nKills ${hudState.kills}`;
  });

  // small hp bar that follows the player (world space)
  const hpBg = add([rect(HUD.hpBarWidth, HUD.hpBarHeight), anchor("left"), color(40, 10, 10), z(50)]);
  const hpFill = add([rect(HUD.hpBarWidth, HUD.hpBarHeight), anchor("left"), color(220, 50, 50), z(51)]);
  hpFill.onUpdate(() => {
    const p = get("player")[0];
    const visible = !!p?.hp && !p.down;
    hpBg.hidden = hpFill.hidden = !visible;
    if (!visible) return;
    const at = p.pos.add(-HUD.hpBarWidth / 2, HUD.hpBarOffset);
    hpBg.pos = at;
    hpFill.pos = at;
    hpFill.width = HUD.hpBarWidth * Math.max(0, p.hp() / (p.maxHP() || 1));
  });
}
