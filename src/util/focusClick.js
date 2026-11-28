// "Was this mouse press only the click that brought the game window back
// into focus?" Clicking an unfocused browser window both focuses it and
// sends the press to the page. The paused screens pick on any press over a
// card / button, so without this check, the click you make to come back to
// the game would pick a level up card at random (and the game resumes
// without you seeing the screen), buy a shop node, or restart the run.
//
// Used by the click handlers of upgrades.js, golem-styles.js, shop.js and
// gameover.js. Keys (1-3, Space…) are never affected.
const GRACE_MS = 300; // the press arrives right after the window's focus event

let focusedAt = -Infinity;
let mouseDownWhileBlurred = false;
addEventListener("focus", () => (focusedAt = performance.now()));
// capture phase: runs before KAPLAY's own listener sees the press
addEventListener("mousedown", () => (mouseDownWhileBlurred = !document.hasFocus()), true);
addEventListener("touchstart", () => (mouseDownWhileBlurred = false), true);

/** True when the current mouse press is the one that focused the window. */
export function isFocusClick() {
  return mouseDownWhileBlurred || performance.now() - focusedAt < GRACE_MS;
}
