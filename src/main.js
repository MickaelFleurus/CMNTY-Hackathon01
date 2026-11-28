import kaplay from "kaplay";
import { CFG, SHOP } from "./config.js";
import { enableMobileFullscreen } from "./util/fullscreen.js";
import { buildGround } from "./systems/map.js";
import { followCamera } from "./systems/camera.js";
import { makePlayer } from "./systems/player.js";
import { makeWeapon } from "./systems/weapons.js";
import { loadEnemySprites, startEnemyDirector } from "./systems/enemies.js";
import { loadXpAssets, initXp } from "./systems/xp.js";
import { loadUpgradeAssets, initUpgrades, grantUpgrade } from "./systems/upgrades.js";
import { startRunStats } from "./systems/run-stats.js";
import { loadSounds, startSounds } from "./systems/sounds.js";
import { initHud } from "./systems/hud.js";
import { initUpgradeEffects } from "./systems/upgrade-effects.js";
import { initKnife } from "./systems/knife.js";
import { initPlank } from "./systems/plank.js";
import { initAxe } from "./systems/axe.js";
import { initBoomerang } from "./systems/boom-stick.js";
import { startAuras } from "./systems/auras.js";
import { startRegen } from "./systems/regen.js";
import { loadTowerSprites, startTower } from "./systems/tower.js";
import { startRespawn } from "./systems/respawn.js";
import { startInvuln } from "./systems/invuln.js";
import { startRunState } from "./systems/runstate.js";
import { startDevTools } from "./systems/devtools.js";
import { startCycle } from "./systems/cycle.js";
import { startGameOver } from "./systems/gameover.js";
import { startPause } from "./systems/pause.js";
import { startDamageNumbers } from "./systems/damage-numbers.js";
import { startGolemShockwave } from "./systems/golem-shockwave.js";
import { startGolemStyles } from "./systems/golem-styles.js";
import { startGolemGuardian } from "./systems/golem-guardian.js";
import { startGolemBerserker } from "./systems/golem-berserker.js";
import { startGolemWarden } from "./systems/golem-warden.js";
import { startGuideArrow } from "./systems/guide-arrow.js";
import { startMinimap } from "./systems/minimap.js";
import { loadChestAssets, startChests } from "./systems/chests.js";
import { loadBonusAssets, startBonusDrops } from "./systems/bonus.js";
import { startBaseAlert } from "./systems/base-alert.js";
import { startBossWarning } from "./systems/boss-warning.js";
import { loadBaseSprites, makeBase, addCoins } from "./systems/base.js";
import { loadPortalSprites, makePortal } from "./systems/portal.js";
import { loadShopSprites, makeShop } from "./systems/shop.js";

kaplay({
  background: [26, 26, 38],
  // Desktop: a fixed 1280x720 view letterboxed in #game-root (black bars).
  // Phones (CFG.viewport.fill, pickViewport in config.js): no fixed size -
  // the canvas fills the whole screen in any shape and follows rotation,
  // with `scale` keeping the short side at 720 game px.
  ...(CFG.viewport.fill
    ? { scale: CFG.viewport.scale }
    : { width: CFG.viewport.width, height: CFG.viewport.height, letterbox: true }),
  root: document.getElementById("game-root"),
  crisp: true,
  // Collision broadphase cell size (default 64). Enemies are ~24px and pack
  // densely around the player; 32px cells cut the pair checks roughly in half
  // (~38 → 60 fps at 300 enemies).
  hashGridSize: 32,
});

// Phones: real fullscreen on the first touch (Android); see util/fullscreen.js
enableMobileFullscreen(CFG.viewport.fill);

// --- assets (Survivors Starter Kit, see docs/assets.md) ---
// Ghoul hero sheet (384x256, 64px cells): 6 cols x 4 rows, one animation per row.
// idle r0(4f) walk r1(4f) hit r2(2f) death r3(6f) - frame indices for sliceX:6.
// 64px art at CFG.player.scale 1: about twice the old hero's on-screen size.
loadSprite("hero-ghoul", "gfx/ghoul/ghoul-hero.png", {
  sliceX: 6,
  sliceY: 4,
  anims: {
    idle: { from: 0, to: 3, loop: true, speed: 6 },
    walk: { from: 6, to: 9, loop: true, speed: 10 },
    // One-shot strike pose: extended arm from the walk row, held through
    // PLANK.attackPoseTime by player.js, then released back to idle/walk.
    attack: { frames: [8, 9], speed: 18 },
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
loadSounds();
loadSprite("proj-axe", "gfx/SurvivorsStarterKit_v1.0/Weapons/Projectiles/Proj_Axe.png", {
  sliceX: 4,
  anims: { spin: { from: 0, to: 3, loop: true, speed: 10 } },
});
loadSprite("proj-boomerang", "gfx/SurvivorsStarterKit_v1.0/Weapons/Projectiles/Proj_Boomerang.png", {
  sliceX: 4,
  anims: { spin: { from: 0, to: 3, loop: true, speed: 14 } },
});
loadEnemySprites();
loadXpAssets();
loadUpgradeAssets();
loadTowerSprites();
loadBaseSprites();
loadPortalSprites();
loadShopSprites();
loadBonusAssets();
loadChestAssets();

buildGround();
const player = makePlayer();
followCamera(player);
makeWeapon(player);
initXp();
initUpgrades();
initHud();
initUpgradeEffects(player);
initKnife(player);
initPlank(player);
initAxe(player);
initBoomerang(player);
grantUpgrade("weapon-plank"); // the starter weapon (Plank Lv1)
startRunStats(player); // after the starter grant: it isn't a "picked" card
startSounds(player);
startEnemyDirector();
startAuras();
startRegen();
startTower();
startRespawn(player);
startInvuln(player);
// game-over listens for run-over BEFORE startRunState: runstate fires
// "run-frozen" synchronously, so the stats snapshot must exist by then.
startGameOver();
startRunState(player);
startPause();
startDamageNumbers();
startGolemShockwave();
startGolemStyles();
startGolemGuardian();
startGolemBerserker();
startGolemWarden();
startGuideArrow();
startMinimap();
startChests(player);
startBonusDrops(player);
startBaseAlert();
startBossWarning();
startDevTools(player);

// Global key handlers still fire while the level up screen pauses the game
// (upgrades.js uses keys 1-3) and while the golem upgrade tree (shop.js) is
// open, where 1-4 buy nodes.
const gamePaused = () => getTreeRoot().paused || get("shop-ui").length > 0;

makeBase();
makePortal();
makeShop();

// Cycle director: wave → break (portal if far / walk home) → shop → next wave.
const cycle = startCycle();
cycle.start();
getTreeRoot().on("wave-end", ({ wave, reason, kills }) => {
  console.log(`wave ${wave} ended (${reason}), ${kills} kills`);
});

// TEMP debug: P teleports home. C grants 50 coins.
onKeyPress("c", () => {
  if (!gamePaused()) addCoins(50);
});
onKeyPress("p", () => {
  if (gamePaused()) return;
  const p = get("player")[0];
  if (p) p.pos = vec2(SHOP.home.x + 80, SHOP.home.y);
});

