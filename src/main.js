import kaplay from "kaplay";
import { CFG } from "./config.js";
import { buildGridBackground } from "./systems/background.js";
import { followCamera } from "./systems/camera.js";
import { makePlayer } from "./systems/player.js";
import { makeWeapon } from "./systems/weapons.js";
import { loadEnemySprites, startEnemyDirector } from "./systems/enemies.js";

kaplay({
  background: [26, 26, 38],
  width: CFG.viewport.width,
  height: CFG.viewport.height,
  crisp: true,
  // Collision broadphase cell size (default 64). Enemies are ~24px and pack
  // densely around the player; 32px cells cut the pair checks roughly in half
  // (~38 → 60 fps at 300 enemies).
  hashGridSize: 32,
});

// --- assets (Survivors Starter Kit, see docs/assets.md) ---
// full character sheet (96x64): 6 cols x 4 rows, one animation per row
// idle r0(4f) walk r1(4f) hit r2(2f) death r3(6f) — frame indices for sliceX:6
loadSprite("hero-knight", "gfx/SurvivorsStarterKit_v1.0/Heroes/Hero_Knight.png", {
  sliceX: 6,
  sliceY: 4,
  anims: {
    idle: { from: 0, to: 3, loop: true, speed: 6 },
    walk: { from: 6, to: 9, loop: true, speed: 10 },
    hit: { from: 12, to: 13, speed: 12 },
    death: { from: 18, to: 23, speed: 12 },
  },
});
loadSprite("tiles-grass", "gfx/SurvivorsStarterKit_v1.0/Tiles/Tiles_Grass_16px.png", {
  sliceY: 2, // row 0: 4 seamless variants; row 1: decorated
  sliceX: 4,
});
loadSprite("proj-knife", "gfx/SurvivorsStarterKit_v1.0/Weapons/Projectiles/Proj_Knife.png", {
  sliceX: 4,
  anims: { spin: { from: 0, to: 3, loop: true, speed: 10 } },
});
loadEnemySprites();

// Light grid instead of the grass band (systems/map.js is kept for when real
// map art comes back).
buildGridBackground();
const player = makePlayer();
followCamera(player);
makeWeapon(player);
const enemyDirector = startEnemyDirector();

// TEMP until the cycle director (portal → shop → next wave) exists:
// start wave 1, and start the next wave a few seconds after each one ends.
const TEMP_WAVE_GAP = 3; // s
enemyDirector.startWave(1);
getTreeRoot().on("wave-end", ({ wave, reason, kills }) => {
  console.log(`wave ${wave} ended (${reason}), ${kills} kills`);
  wait(TEMP_WAVE_GAP, () => {
    enemyDirector.clear();
    enemyDirector.startWave(wave + 1);
  });
});

add([
  text("Wave 1 — WASD/arrows to move\n(pistol auto-fires at zombies)", {
    size: 20,
  }),
  color(40, 44, 56), // dark text on the light grid
  pos(16, 16),
  fixed(),
]);

const debugLabel = add([text("", { size: 18 }), color(40, 44, 56), pos(24, 90), fixed()]);
debugLabel.onUpdate(() => {
  const types = enemyDirector.activeTypes().map((t) => `${t} ${enemyDirector.alive(t)}`);
  const d = enemyDirector;
  const status = d.inWave()
    ? `wave ${d.wave()} · ${Math.ceil(d.timeLeft())}s left · ${d.remaining()} remaining`
    : `wave ${d.wave()} over — next wave soon`;
  debugLabel.text = `${status}\nenemy lvl ${d.level()} · alive ${d.alive()} · ${types.join(" · ")}`;
});
