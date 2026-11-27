// End of run: when the tower falls ("run-over"), the game stops behind the
// game-over screen (docs/game-design-v2.md → "Game over screen").
//
// Freezes gameplay WITHOUT pausing the whole scene, so keyboard / mouse /
// touch input keeps working for the game-over UI (Restart button). Pausing
// getTreeRoot() would also block every input handler.
//
// Contract (no imports between systems):
//   - player.frozen = true after the run is over: movement (player.js),
//     weapons (weapons.js) and regen skip a frozen player. Any new
//     player-driven system must check it (like player.down).
//   - world objects with a tag in FROZEN_TAGS are paused in place (their own
//     update and animation stop; they still draw).
//   - the enemy/wave director freezes itself on "run-over" (enemies.js).
//   - getTreeRoot().on("run-frozen", () => …) fires once everything is frozen:
//     the game-over screen can open on it (or on "run-over" directly).

// Objects that move or animate on their own and must stop with the run.
const FROZEN_TAGS = ["projectile", "coin", "portal", "aura"];

export function startRunState(player) {
  let over = false;
  player.frozen = false;

  getTreeRoot().on("run-over", () => {
    if (over) return;
    over = true;
    player.frozen = true;
    if (player.curAnim?.() === "walk") player.play("idle");
    player.paused = true; // stop its animation too

    for (const tag of FROZEN_TAGS) for (const o of get(tag)) o.paused = true;
    // anything spawned later (e.g. a coin from the last kill this frame)
    for (const tag of FROZEN_TAGS) onAdd(tag, (o) => (o.paused = true));

    getTreeRoot().trigger("run-frozen");
  });
}
