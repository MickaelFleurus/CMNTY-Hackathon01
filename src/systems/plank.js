// Plank: the STARTER melee weapon (main.js grants it at level 1 when the run
// starts; the "weapon-plank" level up card levels it up). A long poke in the
// direction the player faces (docs/game-design-v2.md → Weapons).
// Every level: +damage. The path alternates: Lv2 +length → Lv3 a chained poke
// the other way → Lv4 +length → Lv5 another chained poke (the other way again:
// front, back, front).
//
// The look is a procedural spectral scythe: a translucent violet shaft with a
// curved blade, bright core and soft glow, so nothing is stretched into blur.
//
// Damage goes through the shared projectile contract (enemies.js reads
// `damage`, `pierce`, `hitRadius`): a row of invisible hit circles along the
// plank, sharing ONE `hitEnemies` set, so a poke hits every enemy along its
// length exactly once.
import { PLANK } from "../config.js";

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

/**
 * One poke: a plank `length` px long, starting just off the player, slides
 * out by PLANK.thrust and back, following the player.
 */
function poke(player, side, length, damage) {
  let t = 0;
  const dir = vec2(side, 0);
  const placeAt = (out) => player.pos.add(dir.scale(14 + PLANK.thrust * out)); // plank's near end

  // the look (no hits): a translucent spectral scythe
  const look = add([
    pos(placeAt(0).add(dir.scale(length / 2))),
    rotate(dir.angle()),
    z(6),
    "plank",
    "fx", // cleared with the projectiles when the run is over (runstate.js)
  ]);

  look.onDraw(() => drawScythe(length, t));

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

/** Draw the spectral scythe in the look object's local space (+x = thrust). */
function drawScythe(length, t) {
  const v = PLANK.visual;
  const half = length / 2;
  const headBase = half - v.headLength;
  const tip = half;
  const pulse = 0.88 + 0.12 * Math.sin(t * 42);
  const glow = rgb(...v.color);
  const core = rgb(...v.coreColor);
  const sway = Math.sin(t * 26) * 2.5;

  // Wispy tail: strokes that taper into nothing behind the grip.
  drawLine({ p1: vec2(-half - 10, sway * 1.5), p2: vec2(-half + 18, 0), width: 5, color: glow, opacity: 0.2 * pulse });
  drawLine({ p1: vec2(-half - 4, -sway), p2: vec2(-half + 22, 0), width: 2, color: core, opacity: 0.28 * pulse });

  // Broad translucent aura, a tapered shaft body, and a bright core.
  drawLine({ p1: vec2(-half, 0), p2: vec2(headBase, 0), width: v.glowWidth, color: glow, opacity: v.glowOpacity * pulse });
  drawLine({ p1: vec2(-half, 0), p2: vec2(headBase, 0), width: v.shaftWidth, color: glow, opacity: v.shaftOpacity * pulse });
  drawLine({ p1: vec2(-half + 4, 0), p2: vec2(headBase, 0), width: v.coreWidth, color: core, opacity: v.coreOpacity * pulse });

  // Crescent blade made from layered Bezier strokes (a polygon here
  // triangulates into a blob because the crescent is concave).
  const blade = {
    pt1: vec2(headBase, 0),
    pt2: vec2(headBase + v.headLength * 0.35, -v.headWidth * 1.25),
    pt3: vec2(tip - 1, -v.headWidth * 0.85),
    pt4: vec2(tip, 0),
    segments: 18,
  };
  drawBezier({ ...blade, width: 9, color: glow, opacity: 0.28 * pulse });
  drawBezier({ ...blade, width: 4.5, color: glow, opacity: 0.62 * pulse });
  drawBezier({ ...blade, width: 1.6, color: core, opacity: 0.95 * pulse });

  // A shorter inner arc gives the blade a visible cutting edge.
  drawBezier({
    pt1: vec2(headBase + 4, -1),
    pt2: vec2(headBase + v.headLength * 0.45, -v.headWidth * 0.55),
    pt3: vec2(tip - 4, -v.headWidth * 0.4),
    pt4: vec2(tip - 2, -1),
    width: 1.4,
    color: core,
    opacity: 0.65 * pulse,
    segments: 14,
  });

  // Energy flare at the grip and motes drifting around the blade.
  drawCircle({ pos: vec2(-half, 0), radius: 5, color: glow, opacity: 0.45 * pulse });
  for (let i = 0; i < 3; i++) {
    const k = (t * 1.8 + i / 3) % 1;
    const x = headBase - 18 + k * (v.headLength + 26);
    const y = Math.sin(k * Math.PI) * (v.headWidth * 0.8 + i * 2) + sway * (i - 1) * 0.4;
    drawCircle({ pos: vec2(x, -y), radius: 1.6 + (1 - k) * 1.2, color: core, opacity: 0.55 * (1 - k) });
  }
}
