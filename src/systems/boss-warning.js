// Boss warning (docs/game-design-v2.md → "Boss + gimmick sketch": boss waves
// are announced a wave ahead so the player can shop with intent).
//
//   - "boss-incoming" (enemies.js, fired when the wave BEFORE a boss wave
//     ends): big "BOSS NEXT WAVE" banner with the boss's name, then a small
//     reminder under the HUD timer for the whole break (shop included),
//     until the boss wave starts.
//   - "boss-wave" (the boss wave starts): short "BOSS WAVE" banner.
//   - "run-over" / "golem-dying": everything hides.
//
// The boss name follows the same art rotation as enemies.js (one sprite per
// boss wave, ENEMY_TYPES boss → sprites).
// Banners time on the real clock: the shop pauses the game (timeScale 0) and
// a banner must not stay frozen on screen behind it.
import { BOSS_WARNING as CFG, ENEMY_TYPES, ENEMY_WAVES } from "../config.js";

/** "Vampire Lord" for the boss of `wave`. */
function bossName(wave) {
  const boss = ENEMY_TYPES.find((t) => t.id === "boss");
  const sprites = boss?.sprites ?? (boss?.sprite ? [boss.sprite] : []);
  if (!sprites.length) return "";
  const n = Math.max(1, Math.round(wave / (ENEMY_WAVES.boss?.every || 1)));
  return sprites[(n - 1) % sprites.length].replace(/^(Boss|Enemy)_|\.png$/g, "").replace(/_/g, " ");
}

export function startBossWarning() {
  const root = getTreeRoot();
  const now = () => performance.now() / 1000;
  let banner = null; // { title, sub, from, until }
  let reminder = null; // boss name while the next wave is a boss wave
  let over = false;

  root.on("boss-incoming", ({ wave } = {}) => {
    if (over) return;
    const name = bossName(wave);
    reminder = name || "BOSS";
    banner = { title: "BOSS NEXT WAVE", sub: name ? `The ${name} is coming. Get ready in the shop!` : "Get ready in the shop!", from: now(), until: now() + CFG.bannerTime };
  });
  root.on("boss-wave", ({ wave } = {}) => {
    if (over) return;
    reminder = null;
    const name = bossName(wave);
    banner = { title: "BOSS WAVE", sub: name ? `The ${name} attacks your golem!` : "", from: now(), until: now() + CFG.startBannerTime };
  });
  const hideAll = () => {
    over = true;
    banner = null;
    reminder = null;
  };
  root.on("run-over", hideAll);
  root.on("golem-dying", hideAll);

  add([
    pos(0, 0),
    fixed(),
    z(906), // with the HUD, under the level up / shop / game over screens
    {
      draw() {
        const t = now();
        if (banner && t >= banner.until) banner = null;
        if (banner) drawBanner(banner, t);
        else if (reminder) drawReminder(reminder, t);
      },
    },
  ]);
}

function drawBanner(b, t) {
  const shown = t - b.from;
  const left = b.until - t;
  const alpha = Math.min(1, shown / 0.2, left / 0.6); // quick fade in, slow fade out
  const pop = 1 + 0.25 * Math.max(0, 1 - shown / 0.25); // starts a bit big, settles
  const pulse = 0.85 + 0.15 * Math.sin(t * 10);
  const c = vec2(width() / 2, CFG.bannerY);
  const w = CFG.bannerWidth * pop;
  const h = (b.sub ? 92 : 64) * pop;
  drawRect({ pos: c.add(4, 5), width: w, height: h, anchor: "center", radius: 12, color: rgb(10, 6, 14), opacity: 0.5 * alpha });
  drawRect({ pos: c, width: w, height: h, anchor: "center", radius: 12, color: rgb(90, 16, 40), opacity: 0.9 * alpha, outline: { width: 3, color: rgb(255, 120 * pulse, 90) } });
  const titleY = b.sub ? c.y - 16 * pop : c.y;
  drawText({ text: b.title, size: 40 * pop, pos: vec2(c.x + 3, titleY + 3), anchor: "center", color: rgb(20, 10, 20), opacity: 0.7 * alpha });
  drawText({ text: b.title, size: 40 * pop, pos: vec2(c.x, titleY), anchor: "center", color: rgb(255, 225 * pulse, 120 * pulse), opacity: alpha });
  if (b.sub) drawText({ text: b.sub, size: 18 * pop, pos: vec2(c.x, c.y + 26 * pop), anchor: "center", color: rgb(255, 210, 210), opacity: alpha });
}

function drawReminder(name, t) {
  const label = `BOSS NEXT WAVE: ${name.toUpperCase()}`;
  const size = 16;
  const w = label.length * size * 0.62 + 28;
  const h = size + 12;
  const c = vec2(width() / 2, CFG.reminderY);
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * CFG.reminderHz);
  drawRect({ pos: c, width: w, height: h, anchor: "center", radius: h / 2, color: rgb(90, 16, 40), opacity: 0.8, outline: { width: 2, color: rgb(255, 90 + 80 * pulse, 80) } });
  drawText({ text: label, size, pos: c, anchor: "center", color: rgb(255, 220, 200) });
}
