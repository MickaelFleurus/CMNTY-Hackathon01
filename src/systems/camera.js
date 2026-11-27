// Camera follow: keeps the player centered with frame-rate independent
// smoothing, plus a small lookahead in the movement direction that eases in
// when the player changes direction.
import { CAMERA } from "../config.js";

/** Exponential smoothing factor for this frame (rate in 1/s). */
const smooth = (rate) => 1 - Math.exp(-rate * dt());

export function followCamera(target) {
  let cam = target.pos.clone();
  let look = vec2(0); // current lookahead offset
  let lastPos = target.pos.clone();
  setCamPos(cam);

  // Run over: the view stops dead, otherwise the follow/lookahead easing keeps
  // sliding the screen for a moment and frozen enemies look like they move.
  let frozen = false;
  getTreeRoot().on("run-over", () => (frozen = true));

  onUpdate(() => {
    if (frozen || !target.exists()) return;

    // Movement direction from actual displacement, so it works for keyboard,
    // joystick, knockback… without knowing how the player moves.
    const moved = target.pos.sub(lastPos);
    lastPos = target.pos.clone();
    const moving = moved.len() > 0.01;
    const lookGoal = moving ? moved.unit().scale(CAMERA.lookahead) : look;

    // Standing still keeps the last lookahead instead of snapping back, so
    // stop/start doesn't make the view bob.
    look = look.lerp(lookGoal, smooth(CAMERA.lookaheadRate));
    cam = cam.lerp(target.pos.add(look), smooth(CAMERA.followRate));
    setCamPos(cam);
  });
}
