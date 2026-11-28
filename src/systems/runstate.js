// End of run: when the tower falls or the player dies in wave 1 ("run-over"), the game stops behind the
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
//     update and animation stop; they still draw). Objects tagged
//     "projectile" or "fx" (short-lived, lifespan()) are removed instead.
//   - the enemy/wave director freezes itself on "run-over" (enemies.js), and
//     the camera stops following (camera.js) so the view doesn't drift.
//   - getTreeRoot().on("run-frozen", () => …) fires once everything is frozen:
//     the game-over screen opens on it. When the PLAYER died (reason
//     "player-died"), the world freezes at once but the hero first plays its
//     death animation, then RUN_OVER.afterDeathPause s of stillness, and only
//     then "run-frozen" (so the game-over screen comes after the death).

import { RUN_OVER } from "../config.js";

// Objects that move or animate on their own: paused in place with the run.
// (The camera stops itself on "run-over" in camera.js.)
const FROZEN_TAGS = ["coin", "portal", "aura", "base", "xp-gem", "pickup"];

// Short-lived objects with lifespan(): KAPLAY destroys those from a global
// timer that pausing doesn't stop, so a "frozen" knife would still vanish a
// moment later. Remove them at once instead (and any spawned this frame).
const CLEARED_TAGS = ["projectile", "fx"];

export function startRunState(player) {
  let over = false;
  player.frozen = false;

  // The golem is falling (tower.js plays its death, then fires "run-over"):
  // the player can't act any more, but the scene keeps running for the FX.
  getTreeRoot().on("golem-dying", () => {
    player.frozen = true;
    if (player.curAnim?.() === "walk") player.play("idle");
  });

  getTreeRoot().on("run-over", ({ reason } = {}) => {
    if (over) return;
    over = true;
    player.frozen = true;
    const died = reason === "player-died";
    if (died) {
      player.hidden = false;
      player.play("death"); // not looping: stays on its last frame
    } else {
      if (player.curAnim?.() === "walk") player.play("idle");
      player.paused = true; // stop its animation too
    }

    for (const tag of FROZEN_TAGS) for (const o of get(tag)) o.paused = true;
    for (const tag of CLEARED_TAGS) for (const o of get(tag)) destroy(o);
    // anything spawned later (e.g. a coin from the last kill this frame)
    for (const tag of FROZEN_TAGS) onAdd(tag, (o) => (o.paused = true));
    for (const tag of CLEARED_TAGS) onAdd(tag, (o) => destroy(o));

    if (!died) {
      getTreeRoot().trigger("run-frozen");
      return;
    }
    // death animation, a short silence, then the game-over screen
    wait(RUN_OVER.deathAnimTime + RUN_OVER.afterDeathPause, () => {
      player.paused = true;
      getTreeRoot().trigger("run-frozen");
    });
  });
}
