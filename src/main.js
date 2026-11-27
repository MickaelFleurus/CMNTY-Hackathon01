import kaplay from "kaplay";
import { CFG, SHOP } from "./config.js";
import { buildGround } from "./systems/map.js";
import { followCamera } from "./systems/camera.js";
import { makePlayer } from "./systems/player.js";
import { makeWeapon } from "./systems/weapons.js";
import { loadEnemySprites, startEnemyDirector } from "./systems/enemies.js";
import { loadXpAssets, initXp } from "./systems/xp.js";
import { loadUpgradeAssets, initUpgrades } from "./systems/upgrades.js";
import { initHud } from "./systems/hud.js";
import { startAuras } from "./systems/auras.js";
import { startRegen } from "./systems/regen.js";
import { loadTowerSprites, startTower } from "./systems/tower.js";
import { startRespawn } from "./systems/respawn.js";
import { startRunState } from "./systems/runstate.js";
import { targetCounts } from "./systems/enemies.js";
import { loadBaseSprites, makeBase, addCoins } from "./systems/base.js";
import { loadPortalSprites, makePortal } from "./systems/portal.js";
import { loadShopSprites, makeShop } from "./systems/shop.js";

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
loadXpAssets();
loadUpgradeAssets();
loadTowerSprites();
loadBaseSprites();
loadPortalSprites();
loadShopSprites();

buildGround();
const player = makePlayer();
followCamera(player);
makeWeapon(player);
initXp();
initUpgrades();
initHud();
const enemyDirector = startEnemyDirector();
startAuras();
startRegen();
startTower();
startRespawn(player);
startRunState(player);

// TEMP until the shop UI lands: keys 1-4 fire a shop pick (level +1 each time).
const TEMP_PICK_KEYS = {
  1: "passive-defense",
  2: "passive-offense",
  3: "active-defense",
  4: "active-offense",
};
const tempPickLevels = {};
for (const [key, quadrant] of Object.entries(TEMP_PICK_KEYS)) {
  onKeyPress(key, () => {
    const level = (tempPickLevels[quadrant] = (tempPickLevels[quadrant] ?? 0) + 1);
    getTreeRoot().trigger("shop-pick", { id: `temp-${quadrant}`, quadrant, level, params: {} });
    console.log(`shop-pick ${quadrant} lvl ${level}`);
  });
}

// TEMP until a game-over screen exists.
getTreeRoot().on("run-over", ({ reason }) => {
  console.log("RUN OVER:", reason);
  add([text(`RUN OVER — ${reason}`, { size: 36 }), pos(center()), anchor("center"), fixed(), z(1000)]);
});

makeBase();
makePortal();
makeShop();

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
  pos(16, 16),
  fixed(),
]);

// TEMP debug for the base/shop PR: N fires the wave-end→portal→shop chain
// (cycle director replaces this). P teleports home. C grants 50 coins.
onKeyPress("n", () => {
  getTreeRoot().trigger("wave-end", { wave: enemyDirector.wave(), reason: "debug", kills: 0 });
  getTreeRoot().trigger("portal-enter");
});
onKeyPress("c", () => addCoins(50));
onKeyPress("p", () => {
  const p = get("player")[0];
  if (p) p.pos = vec2(SHOP.home.x + 80, SHOP.home.y);
});

const debugLabel = add([text("", { size: 18 }), pos(24, 90), fixed()]);
debugLabel.onUpdate(() => {
  const types = enemyDirector.activeTypes().map((t) => `${t} ${enemyDirector.alive(t)}`);
  const d = enemyDirector;
  const status = d.isOver()
    ? `RUN OVER on wave ${d.wave()} · timer stopped at ${Math.ceil(d.timeLeft())}s`
    : d.inWave()
    ? `wave ${d.wave()} · ${Math.ceil(d.timeLeft())}s left · ${d.remaining()} remaining`
    : `wave ${d.wave()} over — next wave soon`;
  const tc = targetCounts();
  const respawn = player.down
    ? `DEAD — respawn in ${player.respawnIn.toFixed(1)}s`
    : `next death: ${player.nextRespawn}s respawn`;
  debugLabel.text = `${status}\nenemy lvl ${d.level()} · alive ${d.alive()} · ${types.join(" · ")}` +
    `\ntargeting: player ${tc.player} · tower ${tc.tower} · ${respawn}`;
});
