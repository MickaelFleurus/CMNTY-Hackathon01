// Light grid background: a flat light fill with thin grid lines, drawn only
// for the visible area each frame (infinite in every direction, ~40 lines).
// Gives a clear sense of movement and keeps dark-outlined sprites readable.
import { GRID_BG } from "../config.js";

export function buildGridBackground() {
  const { cell, majorEvery, lineWidth } = GRID_BG;
  const fill = rgb(...GRID_BG.color);
  const minor = rgb(...GRID_BG.minorColor);
  const major = rgb(...GRID_BG.majorColor);

  return add([
    pos(0, 0),
    z(-100),
    "background",
    {
      draw() {
        const c = getCamPos();
        const w = width();
        const h = height();
        const left = c.x - w / 2;
        const top = c.y - h / 2;

        drawRect({ pos: vec2(left, top), width: w, height: h, color: fill });

        // first grid line at or before the visible edge
        const x0 = Math.floor(left / cell);
        const y0 = Math.floor(top / cell);
        for (let i = x0; i * cell <= left + w; i++) {
          const isMajor = i % majorEvery === 0;
          drawLine({
            p1: vec2(i * cell, top),
            p2: vec2(i * cell, top + h),
            width: isMajor ? lineWidth * 2 : lineWidth,
            color: isMajor ? major : minor,
          });
        }
        for (let j = y0; j * cell <= top + h; j++) {
          const isMajor = j % majorEvery === 0;
          drawLine({
            p1: vec2(left, j * cell),
            p2: vec2(left + w, j * cell),
            width: isMajor ? lineWidth * 2 : lineWidth,
            color: isMajor ? major : minor,
          });
        }
      },
    },
  ]);
}
