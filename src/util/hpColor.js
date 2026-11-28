// HP colors (docs/game-design-v2.md → "HUD redesign"): bars go green → amber
// → red as they empty, and the empty part is dark gray, never pure black.

/** Fill color for an HP fraction (0..1). Below `low` it's red. */
export function hpColor(ratio, low = 0.25) {
  if (ratio > 0.5) return rgb(90, 210, 110); // green
  if (ratio > low) return rgb(240, 180, 60); // amber
  return rgb(235, 70, 60); // red
}

/** The empty part of an HP bar. */
export const HP_EMPTY = [60, 60, 70];
