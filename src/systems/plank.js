// Plank: melee weapon unlocked by the "weapon-plank" level up card. A short
// poke in the direction the player faces (docs/game-design-v2.md → Weapons).
// Level path: Lv2 +damage → Lv3 +reach → Lv4 also pokes behind → Lv5 +damage.
//
// ART PLACEHOLDER: there's no plank sprite in the pack yet, so the poke is
// the knife sprite recolored bright pink (a small shader) and scaled up
// (PLANK.tint / scale).
// Replace it when real art exists - listed in docs/assets.md →
// "Placeholder art to replace".
//
// Damage goes through the shared projectile contract (enemies.js reads
// `damage`, `pierce`, `hitRadius`): the poke hits every enemy it touches once.
import { PLANK } from "../config.js";

// PLACEHOLDER recolor: paints the (grey) knife bright pink while keeping its
// shading. A plain color() multiplies and would turn it dark magenta.
const PINK_SHADER = "plank-placeholder-pink";
const PINK_FRAG = `
uniform vec3 u_tint; // 0..255
vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
  vec4 c = def_frag();
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  return vec4(clamp(u_tint / 255.0 * (0.55 + 0.75 * l), 0.0, 1.0), c.a);
}
`;
let pinkUniform = null;

export function loadPlankAssets() {
  loadShader(PINK_SHADER, null, PINK_FRAG);
}

export function initPlank(player) {
  let level = 0;
  let cooldown = 0;

  player.on("upgrade", ({ id, level: lvl }) => {
    if (id === "weapon-plank") level = lvl;
  });

  onUpdate(() => {
    if (level === 0) return;
    cooldown -= dt();
    // no attacking while dead (respawn.js), after the run is over (runstate.js)
    // or with the dev playtest switch on (devtools.js, K / ?noattack)
    if (cooldown > 0 || player.down || player.frozen || player.attackDisabled) return;

    const buffs = player.buffs ?? {};
    const stats = player.stats ?? {};
    cooldown = PLANK.interval / (buffs.attackSpeedMult ?? 1) / (stats.attackSpeedMult ?? 1);
    const base = PLANK.damage + (level >= 2 ? PLANK.damagePerLevel : 0) + (level >= 5 ? PLANK.damagePerLevel : 0);
    const damage = base * (buffs.damageMult ?? 1) * (stats.damageMult ?? 1);
    const reach = PLANK.reach + (level >= 3 ? PLANK.reachBonus : 0);

    const facing = player.flipX ? -1 : 1;
    poke(player, facing, reach, damage);
    if (level >= 4) poke(player, -facing, reach, damage); // Lv4: behind too
  });
}

/** One poke: slides out from the player to `reach` and back in, following them. */
function poke(player, side, reach, damage) {
  let t = 0;
  const dir = vec2(side, 0);
  const p = add([
    sprite("proj-knife", { frame: 0 }), // PLACEHOLDER art (pink knife)
    shader(PINK_SHADER, (pinkUniform ??= { u_tint: rgb(...PLANK.tint) })),
    scale(PLANK.scale),
    pos(player.pos),
    anchor("center"),
    rotate(dir.angle()),
    z(6),
    "projectile",
    "plank",
    { damage, pierce: Infinity, hitRadius: PLANK.hitRadius },
  ]);
  p.onUpdate(() => {
    t += dt();
    const k = Math.min(1, t / PLANK.pokeTime);
    const out = Math.sin(k * Math.PI); // 0 → 1 → 0: thrust out and pull back
    p.pos = player.pos.add(dir.scale(16 + (reach - 16) * out));
    if (k >= 1) destroy(p);
  });
}
