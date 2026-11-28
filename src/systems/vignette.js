// Screen vignette: the screen corners darken a little, framing the action
// around the hero. When the player's HP is low a dark red vignette fades in
// on top (deeper, reaching further in), as extra "you're in danger" feedback.
//
// Each vignette is painted ONCE into an image (radial gradient on a hidden
// 2D canvas, loaded as a sprite) and drawn stretched over the screen (resized
// every frame: on phones the view follows rotation, width() / height() change
// live - config.js pickViewport), BETWEEN
// the world and the HUD (z 850; HUD is 900+), so the minimap, HP orb and
// banners stay unshaded. Tuning: VIGNETTE in config.js.
//
// Reads the "player" (hp() / maxHP(), down). The golem-danger red edge pulse
// (base-alert.js) is separate and stays on top.
import { VIGNETTE as CFG } from "../config.js";

const SIZE = 256; // texture size; smooth gradient, stretched to the screen

/** Radial gradient: transparent inside `inner`, `color` at `strength` in the corners. */
function vignetteImage({ strength, inner, color }) {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d");
  const mid = SIZE / 2;
  const corner = Math.hypot(mid, mid);
  const grad = g.createRadialGradient(mid, mid, corner * inner, mid, mid, corner);
  const [r, gr, b] = color;
  // eased ramp (a few stops ≈ smoothstep²) so there's no visible ring
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const k = t * t * (3 - 2 * t);
    grad.addColorStop(t, `rgba(${r}, ${gr}, ${b}, ${(k * k * strength).toFixed(3)})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, SIZE, SIZE);
  return c.toDataURL();
}

export function loadVignette() {
  loadSprite("vignette", vignetteImage(CFG));
  loadSprite("vignette-low", vignetteImage(CFG.lowHp));
}

export function startVignette() {
  let low = 0; // 0..1, eased toward the low-HP amount
  const layer = (name) =>
    add([
      sprite(name, { width: width(), height: height() }),
      pos(0, 0),
      fixed(),
      z(850),
      opacity(1),
    ]);
  const dark = layer("vignette");
  const red = layer("vignette-low");
  red.opacity = 0;

  // runs while paused too (level up / shop), so a rotation then still resizes
  onDraw(() => {
    for (const l of [dark, red]) {
      if (l.width !== width()) l.width = width();
      if (l.height !== height()) l.height = height();
    }
  });

  red.onUpdate(() => {
    const p = get("player")[0];
    const ratio = p && !p.down && typeof p.hp === "function" ? p.hp() / p.maxHP() : 1;
    // 0 above CFG.lowHp.below, 1 at 0 HP
    const goal = Math.max(0, Math.min(1, 1 - ratio / CFG.lowHp.below));
    low += (goal - low) * Math.min(1, dt() * 4);
    red.opacity = low;
  });
}
