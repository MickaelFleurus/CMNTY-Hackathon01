// Rare bonus drops (docs/game-design-v2.md → "Rare bonus drops").
//
// Any enemy can very rarely drop a bonus instead of its normal drop (the
// "bonus" row at the top of each drop table in config.js, so it's still one
// drop per kill). It glows and bobs on the ground, lasts BONUS_DROPS.lifetime s
// (blinking near the end) and takes effect when the player walks over it:
//
//   bomb        kills every enemy on screen (kills still drop XP / coins);
//               bosses only lose BONUS_DROPS.bombBossDamage of their max HP
//   freeze      every enemy stops for freezeTime s, tinted icy blue
//   rage        rageTime s: damage ×rageDamageMult, attacks ×rageAttackSpeedMult
//   golem-heal  heals the golem golemHeal of its max HP (only once it's awake)
//   magnet      every XP gem, heart and coin on the map flies to the player
//   recall      one stored charge: press R to teleport to the golem after a
//               recallCast s cast (damage doesn't cancel it)
//
// Picking up Freeze or Rage while it's active resets its timer (no stacking).
// A small line at the bottom of the screen shows what's active.
//
// Contract (no imports between systems):
//   - listens on("drop", "enemy", { kind: "bonus", pos, bonus? }) (enemies.js);
//     `bonus` (e.g. "bomb") forces which one, otherwise BONUS_DROPS.weights
//   - bomb: enemy.hurt() (normal death path → drops); boss = behavior "siege";
//     fires "damage-dealt" { pos, amount } for the boss hit (damage-numbers.js)
//   - freeze: getTreeRoot().trigger("enemy-freeze", { frozen: true, duration })
//     (enemies.js); the blue tint follows "enemy-freeze-changed", so the dev
//     freeze key (F) is tinted too
//   - rage: sets player.rage = { damageMult, attackSpeedMult } and fires
//     player.trigger("rage-changed") → upgrade-effects.js rebuilds player.stats
//   - golem-heal: heals the object tagged "base" when base.awake (tower.js)
//   - magnet: getTreeRoot().trigger("magnet-all") (xp.js) + coin.homing = true
//     on every "coin" (base.js already flies homing coins to the player)
//   - recall: player.pos = just below base.solidRect() (like the portal)
//   - root event "bonus-picked" { kind } for anything else that wants to react
//   - pickups are tagged "pickup" + "bonus" (runstate.js freezes "pickup")
//   - nothing is picked up or cast while player.down / player.frozen
import { BONUS_DROPS as CFG } from "../config.js";

const PICKUP_DIR = "gfx/SurvivorsStarterKit_v1.0/Pickups";
// kind -> how it looks on the ground
const LOOKS = {
  bomb: { sprite: "bonus-bomb", frames: 4, glow: [255, 170, 80] },
  freeze: { sprite: "bonus-freeze", frames: 4, glow: [140, 200, 255] },
  rage: { sprite: "bonus-rage", frames: 1, glow: [255, 60, 50], tint: [255, 90, 80] },
  "golem-heal": { sprite: "bonus-golem-heal", frames: 4, glow: [120, 235, 130] },
  magnet: { sprite: "bonus-magnet", frames: 4, glow: [255, 230, 120] },
  recall: { sprite: "fx-level-up", frames: 6, glow: [190, 140, 255], scale: 1.2 }, // the portal's sprite (portal.js)
};

export function loadBonusAssets() {
  const sheet = (name, file) => loadSprite(name, `${PICKUP_DIR}/${file}`, { sliceX: 4 });
  sheet("bonus-bomb", "Pickup_Bomb.png");
  sheet("bonus-freeze", "Pickup_Clock.png");
  sheet("bonus-golem-heal", "Pickup_Meat.png");
  sheet("bonus-magnet", "Pickup_Magnet_fixed.png");
  loadSprite("bonus-rage", "gfx/SurvivorsStarterKit_v1.0/Weapons/Icons/Icon_Might.png");
  loadSprite("fx-explosion", "gfx/SurvivorsStarterKit_v1.0/Effects/FX_Explosion.png", {
    sliceX: 6,
    anims: { boom: { from: 0, to: 5, speed: 18 } },
  });
  loadSprite("fx-heal", "gfx/SurvivorsStarterKit_v1.0/Effects/FX_Heal.png", {
    sliceX: 4,
    anims: { heal: { from: 0, to: 3, speed: 10 } },
  });
}

export function startBonusDrops(player) {
  const root = getTreeRoot();
  // timers (s left), counted on dt() so pausing stops them
  let rageLeft = 0;
  let freezeLeft = 0;
  let enemiesFrozen = false;
  let recallCharge = false;
  let casting = -1; // s left in the recall cast, -1 = not casting
  let clock = 0;

  const golem = () => get("base")[0] ?? null;
  const canAct = () => !player.down && !player.frozen;

  on("drop", "enemy", (_e, drop) => {
    if (drop?.kind !== "bonus") return;
    const kind = LOOKS[drop.bonus] ? drop.bonus : rollKind(); // drop.bonus forces one (tests, chests)
    if (kind) spawnBonus(drop.pos.clone(), kind);
  });

  function rollKind() {
    const b = golem();
    const options = Object.entries(CFG.weights).filter(([kind, w]) => {
      if (w <= 0) return false;
      if (kind === "golem-heal") return !!b?.awake; // only once the golem is awake
      if (kind === "recall") return !!b;
      return true;
    });
    let r = rand(0, options.reduce((s, [, w]) => s + w, 0));
    for (const [kind, w] of options) {
      if ((r -= w) < 0) return kind;
    }
    return options.at(-1)?.[0] ?? null;
  }

  function spawnBonus(at, kind) {
    const look = LOOKS[kind];
    let t = 0;
    const bonus = add([
      pos(at),
      z(-1), // with the other pickups, under characters
      "pickup",
      "bonus",
      {
        kind,
        draw() {
          const left = CFG.lifetime - t;
          // blink during the last seconds
          if (left < CFG.blinkLast && Math.floor(t * 6) % 2 === 0) return;
          const bob = Math.sin(t * Math.PI * 2 * CFG.bobHz) * CFG.bobHeight;
          const glow = 0.5 + 0.5 * Math.sin(t * 5);
          const [r, g, b] = look.glow;
          drawCircle({ pos: vec2(0, 4), radius: 18 + 4 * glow, color: rgb(r, g, b), opacity: 0.18 + 0.12 * glow });
          drawCircle({ pos: vec2(0, 4), radius: 10, color: rgb(r, g, b), opacity: 0.25 });
          drawSprite({
            sprite: look.sprite,
            frame: look.frames > 1 ? Math.floor(t * 6) % look.frames : 0,
            pos: vec2(0, bob),
            anchor: "center",
            scale: look.scale ?? CFG.scale,
            color: look.tint ? rgb(...look.tint) : undefined,
          });
        },
      },
    ]);
    bonus.onUpdate(() => {
      t += dt();
      if (t >= CFG.lifetime) return destroy(bonus);
      if (!canAct()) return;
      if (bonus.pos.dist(player.pos) < CFG.collectRadius) {
        destroy(bonus);
        apply(kind, at);
      }
    });
    return bonus;
  }

  function apply(kind, at) {
    root.trigger("bonus-picked", { kind, pos: at });
    if (kind === "bomb") bomb();
    else if (kind === "freeze") {
      freezeLeft = CFG.freezeTime; // a new pickup resets the timer
      root.trigger("enemy-freeze", { frozen: true, duration: CFG.freezeTime });
    } else if (kind === "rage") {
      rageLeft = CFG.rageTime;
      if (!player.rage) {
        player.rage = { damageMult: CFG.rageDamageMult, attackSpeedMult: CFG.rageAttackSpeedMult };
        player.trigger("rage-changed");
      }
    } else if (kind === "golem-heal") {
      const b = golem();
      if (b?.awake && b.hp) {
        b.heal(Math.min(b.maxHP() - b.hp(), b.maxHP() * CFG.golemHeal));
        fx("fx-heal", "heal", b.pos, 4);
      }
    } else if (kind === "magnet") {
      root.trigger("magnet-all");
      for (const c of get("coin")) c.homing = true;
    } else if (kind === "recall") {
      recallCharge = true; // one charge at a time: another pickup does nothing
    }
  }

  function bomb() {
    let shown = 0;
    for (const e of get("enemy")) {
      if (e.dead || !e.exists() || !onScreen(e.pos)) continue;
      if (shown++ < 40) fx("fx-explosion", "boom", e.pos, 2);
      if (e.behavior === "siege") {
        const amount = Math.round(e.maxHP() * CFG.bombBossDamage);
        e.hurt(amount);
        root.trigger("damage-dealt", { pos: e.pos.clone(), amount });
      } else {
        e.hurt(e.hp());
      }
    }
  }

  // Freeze tint: follows the enemy freeze state (also the dev key F)
  const ICE = [150, 200, 255];
  const tint = (e, on) => {
    if (!e.has("color")) e.use(color(255, 255, 255));
    e.color = on ? rgb(...ICE) : rgb(255, 255, 255);
  };
  root.on("enemy-freeze-changed", ({ frozen }) => {
    enemiesFrozen = frozen;
    if (!frozen) freezeLeft = 0;
    for (const e of get("enemy")) tint(e, frozen);
  });
  onAdd("enemy", (e) => {
    if (enemiesFrozen) tint(e, true);
  });

  // Recall: R starts the cast
  onKeyPress(CFG.recallKey, () => {
    if (!recallCharge || casting >= 0 || !canAct() || root.paused || !golem()) return;
    casting = CFG.recallCast;
  });

  onUpdate(() => {
    const d = dt();
    clock += d;
    if (rageLeft > 0) {
      rageLeft -= d;
      if (rageLeft <= 0) {
        rageLeft = 0;
        player.rage = null;
        player.trigger("rage-changed");
      }
    }
    if (freezeLeft > 0) freezeLeft = Math.max(0, freezeLeft - d);
    if (casting >= 0) {
      if (!canAct()) casting = -1; // dying or run over cancels it (damage doesn't)
      else if ((casting -= d) <= 0) {
        casting = -1;
        recallCharge = false;
        const b = golem();
        const r = b?.solidRect?.();
        if (b) {
          fx("fx-level-up", "pulse", player.pos, 1.5, 0.5);
          player.pos = r ? vec2((r.x0 + r.x1) / 2, r.y1 + CFG.recallGap) : b.pos.add(0, CFG.recallGap);
          fx("fx-level-up", "pulse", player.pos, 1.5, 0.5);
        }
      }
    }
  });

  // Red glow under the raging player, cast ring while recalling
  add([
    pos(0, 0),
    z(-1),
    {
      draw() {
        if (player.down) return;
        if (rageLeft > 0) {
          const g = 0.5 + 0.5 * Math.sin(clock * 10);
          drawCircle({ pos: player.pos, radius: 26 + 4 * g, color: rgb(255, 50, 40), opacity: 0.25 + 0.15 * g });
        }
        if (casting >= 0) {
          const done = 1 - casting / CFG.recallCast;
          drawCircle({ pos: player.pos, radius: 30, color: rgb(190, 140, 255), opacity: 0.15 });
          drawArc(player.pos, 30, done);
        }
      },
    },
  ]);

  // Status line, bottom center of the screen
  add([
    pos(0, 0),
    fixed(),
    z(905),
    {
      draw() {
        if (player.frozen) return;
        const parts = [];
        if (rageLeft > 0) parts.push({ text: `RAGE ${Math.ceil(rageLeft)}s`, col: rgb(255, 110, 100) });
        if (freezeLeft > 0) parts.push({ text: `FREEZE ${Math.ceil(freezeLeft)}s`, col: rgb(160, 210, 255) });
        if (casting >= 0) parts.push({ text: "RECALLING...", col: rgb(200, 160, 255) });
        else if (recallCharge) parts.push({ text: `RECALL (${CFG.recallKey.toUpperCase()})`, col: rgb(200, 160, 255) });
        if (!parts.length) return;
        const size = 18;
        const gap = 24;
        const widths = parts.map((p) => p.text.length * size * 0.62);
        const total = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
        const y = height() - 30;
        drawRect({ pos: vec2(width() / 2, y), width: total + 28, height: size + 14, anchor: "center", radius: 8, color: rgb(20, 14, 28), opacity: 0.75 });
        let x = width() / 2 - total / 2;
        parts.forEach((p, i) => {
          drawText({ text: p.text, size, pos: vec2(x, y), anchor: "left", color: p.col });
          x += widths[i] + gap;
        });
      },
    },
  ]);
}

function onScreen(worldPos) {
  const s = toScreen(worldPos);
  return s.x >= 0 && s.x <= width() && s.y >= 0 && s.y <= height();
}

/** Effect sprite at a world position, gone after its anim or `life` s (looping anims). */
function fx(name, anim, at, size, life = 1) {
  const o = add([sprite(name), pos(at), anchor("center"), scale(size), z(8), "fx"]);
  o.play(anim, { onEnd: () => o.exists() && destroy(o) });
  wait(life, () => o.exists() && destroy(o));
}

/** Progress ring: a polyline arc from 12 o'clock, `done` = 0..1. */
function drawArc(center, radius, done) {
  const steps = Math.max(2, Math.ceil(36 * done));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * done * Math.PI * 2;
    pts.push(center.add(Math.cos(a) * radius, Math.sin(a) * radius));
  }
  drawLines({ pts, width: 4, color: rgb(200, 160, 255) });
}
