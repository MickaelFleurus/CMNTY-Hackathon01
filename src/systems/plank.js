// Plank: the STARTER melee weapon (main.js grants it at level 1 when the run
// starts; the "weapon-plank" level up card levels it up). A long poke in the
// direction the player faces (docs/game-design-v2.md → Weapons).
// Every level: +damage. The path alternates: Lv2 +length → Lv3 a chained poke
// the other way → Lv4 +length → Lv5 another chained poke (the other way again:
// front, back, front).
//
// The look is a procedural spectral scythe: one curved violet crescent with a
// bright core and soft glow, so nothing is stretched into blur.
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
  // Put the hero into the extended-arm strike pose for the whole hit. The
  // player's normal idle/walk switcher respects this timer (player.js).
  player.attackPoseFor = Math.max(player.attackPoseFor ?? 0, PLANK.attackPoseTime);
  const placeAt = (out) => player.pos.add(dir.scale(14 + PLANK.thrust * out)); // plank's near end

  // the look (no hits): a translucent spectral scythe
  const look = add([
    pos(placeAt(0).add(dir.scale(length / 2))),
    rotate(dir.angle()),
    z(6),
    "plank",
    "fx", // cleared with the projectiles when the run is over (runstate.js)
  ]);

  look.onDraw(() => drawScythe(length, t, side));

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
    parts.forEach((p, i) => {
      const u = (i + 0.5) / n;
      const localY = scytheLocalY(length, u, side);
      p.pos = near.add(dir.scale(u * length)).add(vec2(-dir.y, dir.x).scale(localY));
    });
    if (k >= 1) {
      parts.forEach((p) => p.exists() && destroy(p));
      destroy(look);
    }
  });
}

/** Local y of the scythe curve at u (0 = grip, 1 = tip). +x is the thrust. */
function scytheLocalY(length, u, side) {
  return -side * length * PLANK.visual.curveLiftRatio * Math.sin(Math.PI * u);
}

/** Draw the spectral scythe in the look object's local space (+x = thrust). */
function drawScythe(length, t, side) {
  const v = PLANK.visual;
  const half = length / 2;
  const pulse = 0.88 + 0.12 * Math.sin(t * 42);
  const glow = rgb(...v.color);
  const core = rgb(...v.coreColor);

  // One continuous crescent: no straight shaft. Sample the same curve the
  // hit circles use, so the sweep and the damage line stay together.
  const points = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    points.push(vec2(-half + u * length, scytheLocalY(length, u, side)));
  }

  // Broad aura, blade body, then a crisp cutting core.
  drawLines({ pts: points, width: v.glowWidth, color: glow, opacity: v.glowOpacity * pulse, join: "round", cap: "round" });
  drawLines({ pts: points, width: v.bladeWidth, color: glow, opacity: v.bladeOpacity * pulse, join: "round", cap: "round" });
  drawLines({ pts: points, width: v.coreWidth, color: core, opacity: v.coreOpacity * pulse, join: "round", cap: "round" });

  // No fake hand/grip: the scythe is summoned spectral energy, so it fades
  // out of a soft flare at the player's side instead of being "held".
  drawCircle({ pos: points[0], radius: v.originRadius, color: glow, opacity: 0.32 * pulse });
  drawCircle({ pos: points[0], radius: v.originRadius * 0.45, color: core, opacity: 0.55 * pulse });

  // Bright tip and a few motes sliding along the crescent.
  drawCircle({ pos: points[steps], radius: 3, color: core, opacity: 0.8 * pulse });
  for (let i = 0; i < 4; i++) {
    const u = (t * 0.75 + i / 4) % 1;
    const at = vec2(-half + u * length, scytheLocalY(length, u, side) - side * 7);
    const fade = Math.sin(Math.PI * u) * 0.6;
    drawCircle({ pos: at, radius: 1.4 + fade, color: core, opacity: fade });
  }
}
