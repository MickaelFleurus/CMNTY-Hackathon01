// Plank: the STARTER melee weapon (main.js grants it at level 1 when the run
// starts; the "weapon-plank" level up card levels it up). A long poke in the
// direction the player faces (docs/game-design-v2.md → Weapons).
// Every level: +damage. The path alternates: Lv2 +length → Lv3 a chained poke
// the other way → Lv4 +length → Lv5 another chained poke (the other way again:
// front, back, front).
//
// ART PLACEHOLDER: there's no plank sprite in the pack yet, so the poke is
// the knife sprite recolored bright pink (a small shader) and stretched to
// the plank's length (PLANK.tint / length / thickness).
// Replace it when real art exists - listed in docs/assets.md →
// "Placeholder art to replace".
//
// Damage goes through the shared projectile contract (enemies.js reads
// `damage`, `pierce`, `hitRadius`): a row of invisible hit circles along the
// plank, sharing ONE `hitEnemies` set, so a poke hits every enemy along its
// length exactly once.
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
  // the run's first poke waits for the start countdown ("3, 2, 1, GO!")
  let cooldown = PLANK.startCountdown;
  startCountdown(player, PLANK.startCountdown);

  player.on("upgrade", ({ id, level: lvl }) => {
    if (id === "weapon-plank") level = lvl;
  });

  // chained pokes still to come in the current attack: { in: s, side, length, damage }
  let chain = [];

  onUpdate(() => {
    if (level === 0) return;
    cooldown -= dt();
    // no attacking while dead (respawn.js), after the run is over (runstate.js)
    // or with the dev playtest switch on (devtools.js, K / ?noattack)
    const blocked = player.down || player.frozen || player.attackDisabled;
    if (blocked) chain = [];
    for (const c of chain) c.in -= dt();
    for (const c of chain.filter((c) => c.in <= 0)) poke(player, c.side, c.length, c.damage);
    chain = chain.filter((c) => c.in > 0);
    if (cooldown > 0 || blocked) return;

    const buffs = player.buffs ?? {};
    const stats = player.stats ?? {};
    cooldown = PLANK.interval / (buffs.attackSpeedMult ?? 1) / (stats.attackSpeedMult ?? 1);
    const base = PLANK.damage + PLANK.damagePerLevel * (level - 1);
    const damage = base * (buffs.damageMult ?? 1) * (stats.damageMult ?? 1);
    const length = PLANK.length + PLANK.lengthBonus * Math.floor(level / 2); // +length at Lv2, Lv4
    const pokes = 1 + Math.floor((level - 1) / 2); // +1 chained poke at Lv3, Lv5

    // front first, then each chained poke flips side: front, back, front
    const facing = player.flipX ? -1 : 1;
    for (let i = 0; i < pokes; i++) {
      const side = i % 2 === 0 ? facing : -facing;
      if (i === 0) poke(player, side, length, damage);
      else chain.push({ in: i * PLANK.chainDelay, side, length, damage });
    }
  });
}

/**
 * "3, 2, 1, GO!" popping just below the player while the first poke waits
 * (below, because the run starts right under the golem).
 * Runs on dt(), so it pauses with the game (level up, shop, pause).
 */
function startCountdown(player, secs) {
  if (secs <= 0) return;
  let t = 0;
  const style = [anchor("center"), scale(1), opacity(1), "fx"]; // "fx": cleared if the run ends (runstate.js)
  const shadow = add([text("", { size: 52 }), pos(player.pos), color(20, 14, 28), z(59), ...style]);
  const label = add([text("", { size: 52 }), pos(player.pos), color(255, 214, 120), z(60), ...style]);
  label.onUpdate(() => {
    t += dt();
    const left = secs - t;
    const sub = t % 1; // where we are inside the current second
    label.pos = player.pos.add(0, 64);
    if (left > 0) {
      label.text = String(Math.ceil(left));
      label.scale = vec2(1.6 - 0.6 * Math.min(1, sub * 4)); // pops in, settles
      label.opacity = 1 - 0.3 * sub;
    } else {
      label.text = "GO!";
      const k = Math.min(1, -left / 0.6);
      label.scale = vec2(1.4 + 0.4 * k);
      label.opacity = 1 - k;
    }
    // dark copy just behind, offset, so it reads on grass and flowers
    shadow.text = label.text;
    shadow.pos = label.pos.add(3, 3);
    shadow.scale = label.scale;
    shadow.opacity = label.opacity * 0.7;
    if (left <= -0.6) {
      destroy(shadow);
      destroy(label);
    }
  });
}

const KNIFE_ART_PX = 14; // drawn length of the knife art inside its 16 px frame

/**
 * One poke: a plank `length` px long, starting just off the player, slides
 * out by PLANK.thrust and back, following the player.
 */
function poke(player, side, length, damage) {
  let t = 0;
  const dir = vec2(side, 0);
  const placeAt = (out) => player.pos.add(dir.scale(14 + PLANK.thrust * out)); // plank's near end

  // the look (no hits): the stretched pink knife
  const look = add([
    sprite("proj-knife", { frame: 0 }), // PLACEHOLDER art (pink knife)
    shader(PINK_SHADER, (pinkUniform ??= { u_tint: rgb(...PLANK.tint) })),
    scale(length / KNIFE_ART_PX, PLANK.thickness),
    pos(placeAt(0).add(dir.scale(length / 2))),
    anchor("center"),
    rotate(dir.angle()),
    z(6),
    "plank",
    "fx", // cleared with the projectiles when the run is over (runstate.js)
  ]);

  // the hits: circles along the plank, one shared hit list per poke
  const hitEnemies = new Set();
  const n = Math.max(1, Math.ceil(length / (PLANK.hitRadius * 1.6)));
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(add([
      pos(look.pos),
      "projectile",
      "plank-hit",
      { damage, pierce: Infinity, hitRadius: PLANK.hitRadius, hitEnemies },
    ]));
  }

  look.onUpdate(() => {
    t += dt();
    const k = Math.min(1, t / PLANK.pokeTime);
    const near = placeAt(Math.sin(k * Math.PI)); // 0 → 1 → 0: thrust out and pull back
    look.pos = near.add(dir.scale(length / 2));
    parts.forEach((p, i) => (p.pos = near.add(dir.scale(((i + 0.5) / n) * length))));
    if (k >= 1) {
      parts.forEach((p) => p.exists() && destroy(p));
      destroy(look);
    }
  });
}
