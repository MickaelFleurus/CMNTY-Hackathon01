// HUD: xp bar, wave number, level, HP, coins, kills, plus a small HP bar
// under the player. Screen parts use fixed() so they ignore the camera.
//
// Reads (no imports from other owners' systems):
//   - getTreeRoot().on("wave-start", n)              wave number (enemies.js)
//   - on("killed", "enemy", ...)                      kill count (enemies.js)
//   - player.hp() / player.maxHP() / player.coins     player object
//   - player.shield                                   from regen.js (shown when > 0)
import { xpState } from "./xp.js";
import { HUD } from "../config.js";

export const hudState = {
  wave: 0,
  kills: 0,
};

export function initHud() {
  hudState.wave = 0;
  hudState.kills = 0;

  getTreeRoot().on("wave-start", (n) => {
    hudState.wave = n;
  });
  on("killed", "enemy", () => {
    hudState.kills += 1;
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

  const stats = hud.add([
    text("", { size: HUD.textSize, align: "right" }),
    pos(width() - HUD.margin, HUD.xpBarHeight + HUD.margin),
    anchor("topright"),
  ]);

  hud.onUpdate(() => {
    const p = get("player")[0];
    xpBar.width = width() * (xpState.xp / xpState.toNext);
    waveLabel.text = hudState.wave > 0 ? `WAVE ${hudState.wave}` : "";
    const hp = p?.hp ? `HP ${Math.max(0, Math.ceil(p.hp()))}/${p.maxHP()}` : "";
    const shield = p?.shield > 0 ? `\nShield ${Math.ceil(p.shield)}` : "";
    stats.text = `LV ${xpState.level}\n${hp}${shield}\nCoins ${p?.coins ?? 0}\nKills ${hudState.kills}`;
  });

  // small hp bar that follows the player (world space)
  const hpBg = add([rect(HUD.hpBarWidth, HUD.hpBarHeight), anchor("left"), color(40, 10, 10), z(50)]);
  const hpFill = add([rect(HUD.hpBarWidth, HUD.hpBarHeight), anchor("left"), color(220, 50, 50), z(51)]);
  hpFill.onUpdate(() => {
    const p = get("player")[0];
    const visible = !!p?.hp;
    hpBg.hidden = hpFill.hidden = !visible;
    if (!visible) return;
    const at = p.pos.add(-HUD.hpBarWidth / 2, HUD.hpBarOffset);
    hpBg.pos = at;
    hpFill.pos = at;
    hpFill.width = HUD.hpBarWidth * Math.max(0, p.hp() / (p.maxHP() || 1));
  });
}
