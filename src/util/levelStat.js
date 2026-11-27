// Level-scaled stats for the base effects (auras, regen, tower).
//
// A stat in config is either a plain number, or { base, perLevel, min?, max? }
// giving base + perLevel * (level - 1), clamped. A shop pick's `params` can
// override any stat with a plain number (or its own { base, perLevel } object).

export function levelStat(spec, level) {
  if (typeof spec === "number") return spec;
  const v = spec.base + (spec.perLevel ?? 0) * (level - 1);
  return Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, v));
}

/** Resolve every stat of `defs` (config section) for a level, params win. */
export function resolveStats(defs, level, params = {}) {
  const out = {};
  for (const key of Object.keys(defs)) {
    const spec = key in params ? params[key] : defs[key];
    out[key] = typeof spec === "object" && !Array.isArray(spec) && spec !== null
      ? levelStat(spec, level)
      : spec;
  }
  return out;
}
