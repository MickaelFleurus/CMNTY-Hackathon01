// Scale that draws an icon sprite at `targetPx` (its longest side), whatever
// the file's size: the Survivors pack icons are 16 px, custom art (e.g.
// gfx/ghoul/Icon_Ghoul_Plank.png) can be 64 px or more. Without this, a big
// icon drawn with a 16-px scale filled half the screen (HUD slot, level-up card).
export function iconScale(name, targetPx) {
  const data = getSprite(name)?.data;
  const w = data?.width ?? 16;
  const h = data?.height ?? 16;
  return targetPx / Math.max(w, h, 1);
}
