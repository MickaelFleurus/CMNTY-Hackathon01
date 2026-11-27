// Pause toggle: Space or Esc freezes the whole game behind an overlay
// (docs/game-design-v2.md → "Pause"). KAPLAY's debug.paused stops update
// and animation everywhere but keeps rendering, so this is one flag and
// nothing else - no per-system checks needed.
//
// Contract:
//   - getTreeRoot().paused is the single source of truth (main.js's debug
//     keys and devtools already skip on it).
//   - Pausing is a no-op while the shop or the level-up screen is open
//     (they hold the game themselves) and on the game-over screen (the run
//     is frozen; only Restart works there).
//   - Root events: "game-paused" / "game-unpaused" for anything that cares.
export function startPause() {
  const PAUSE_KEYS = ["space", "escape"];
  const overlayText = add([
    text("PAUSED", { size: 64 }),
    pos(center()),
    anchor("center"),
    fixed(),
    z(1001),
    color(255, 255, 255),
  ]);
  overlayText.hidden = true;

  // Blocks pausing: already paused, player down (respawn should keep
  // counting), a screen that holds the game itself, or the run is over.
  const blocked = () =>
    get("player")[0]?.down === true ||
    get("shop-ui").length > 0 ||
    get("levelup-ui").length > 0 ||
    get("gameover").length > 0;

  const toggle = () => {
    const root = getTreeRoot();
    if (root.paused) {
      root.paused = false;
      overlayText.hidden = true;
      getTreeRoot().trigger("game-unpaused");
    } else if (!blocked()) {
      root.paused = true;
      overlayText.hidden = false;
      getTreeRoot().trigger("game-paused");
    }
  };

  // The game-over screen restarts on Space - pause must never eat that key
  // after the run ends. Its overlay also sits at z(990)/z(1000).
  getTreeRoot().on("run-over", () => {
    getTreeRoot().paused = false;
    overlayText.hidden = true;
  });

  getTreeRoot().on("run-frozen", () => {
    if (getTreeRoot().paused) {
      getTreeRoot().paused = false;
      overlayText.hidden = true;
    }
  });

  for (const k of PAUSE_KEYS) onKeyPress(k, toggle);
}
