// Chests & hidden treasures (docs/game-design-v2.md → "Chests & hidden
// treasures"): reasons to leave the golem's side during a wave. Going after
// them is a risk, because the golem is alone while you're away.
//
// CHESTS (visible), CHESTS.perWave per wave at random spots, never close to
// the golem. The farther from the golem, the better the loot (q = 0..1).
//   - open: stand next to one for CHESTS.openTime s (progress ring). Taking
//     damage doesn't cancel it, walking away does.
//   - some are guarded: a small pack of enemies spawns around it the first
//     time you come close (golem chests always are).
//   - one roll per chest: a coin bag (scaled with the wave and distance), a
//     free level-up card, a full heal, or rare: a free golem repair or a free
//     golem upgrade (doesn't raise upgradesOwned). Golem rewards only once
//     the golem is awake.
//   - unopened chests vanish at the end of the wave.
//
// GOLEM CHESTS: about one every 2-3 waves once the golem is awake, always far
// and guarded, gold-tinted with a glow (and their own minimap icon). Opening
// one shows a pick 1 of 3 golem stat upgrades (paused screen, keys 1-3 or
// click, like the level-up screen). They last the whole run and are free:
//   - Golem Max HP: +max HP (and heals that amount)
//   - Golem Armor: less HP lost per hit and less drain while surrounded
//   - Swipe: bigger, stronger shock wave (golem-shockwave.js)
// (The docs also list Golem Attack and Golem Aura; they need hooks in the
// tower / style systems, so they're not offered yet.)
//
// HIDDEN TREASURES: invisible spots, TREASURES.base + perWave per wave. A
// faint sparkle shows when the player gets within hintRadius (never on the
// minimap). Dig: stand on it for digTime s, walking away cancels. Bigger
// rewards than chests, mostly coins, sometimes a rare item from the chest list.
//
// Contract (no gameplay file has to call this one):
//   - listens "wave-start" (n) / "wave-end" (enemies.js): spawn / clear
//   - golem = the object tagged "base" (base.awake, solidRect(), hp(),
//     maxHP(), heal(), setMaxHP(), hurt()) (tower.js)
//   - coins: spawnCoins(n, pos) (base.js) - the coins fly in like kill coins
//   - guards: spawnEnemy(pos, level, "zombie") at enemyLevelForWave (enemies.js)
//   - free card: getTreeRoot().trigger("free-level-up-card") (upgrades.js)
//   - free golem upgrade: getTreeRoot().trigger("golem-upgrade-free") (shop.js)
//   - fires "chest-opened" { golem, loot, q }, "treasure-dug" { loot },
//     "golem-stat-pick" { stat, level } and "golem-chest-closed"
//   - golem Armor wraps base.hurt (every damage path goes through it);
//     Swipe scales GOLEM_SHOCKWAVE.radius / force (reset by the page reload
//     on restart)
//   - objects tagged "chest" / "treasure"; nothing happens while the player
//     is down / frozen or the run is over
import { CHESTS, TREASURES, GOLEM_CHEST, GOLEM_SHOCKWAVE, SHOP } from "../config.js";
import { spawnCoins } from "./base.js";
import { spawnEnemy, enemyLevelForWave } from "./enemies.js";

const DIR = "gfx/SurvivorsStarterKit_v1.0";
const DARK = [20, 14, 28];
const GOLD = [255, 220, 90];

export function loadChestAssets() {
  loadSprite("chest", `${DIR}/Pickups/Pickup_Chest.png`, {
    sliceX: 4,
    anims: { open: { from: 0, to: 3, speed: 10 } },
  });
  loadSprite("coin-bag", `${DIR}/Pickups/Pickup_Coin_Bag.png`, { sliceX: 4 });
  loadSprite("fx-sparkle", `${DIR}/Effects/FX_Sparkle.png`, { sliceX: 4 });
  loadSprite("fx-poof", `${DIR}/Effects/FX_Poof.png`, {
    sliceX: 5,
    anims: { poof: { from: 0, to: 4, speed: 14 } },
  });
}

export function startChests(player) {
  const root = getTreeRoot();
  let wave = 0;
  let over = false;
  let nextGolemChest = 0; // wave of the next golem chest (0 = not planned yet)
  const golemLevels = { "max-hp": 0, armor: 0, swipe: 0 };
  const swipeBase = { radius: GOLEM_SHOCKWAVE.radius, force: GOLEM_SHOCKWAVE.force };

  root.on("run-over", () => (over = true));
  root.on("golem-dying", () => (over = true));
  root.on("wave-start", (n) => {
    wave = n;
    clearLoot();
    spawnForWave(n);
  });
  root.on("wave-end", clearLoot); // unopened chests vanish with the wave

  const golem = () => get("base")[0] ?? null;
  const awake = () => !!golem()?.awake;
  const canAct = () => !over && !player.down && !player.frozen;

  /** Golem body center in world px (where distances are measured from). */
  function golemCenter() {
    const b = golem();
    const r = b?.solidRect?.();
    if (r) return vec2((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    return b ? b.pos.clone() : vec2(SHOP.home.x, SHOP.home.y);
  }

  /** Random spot minDist..maxDist from the golem; q = 0 (near) .. 1 (far). */
  function spot(minDist, maxDist) {
    const d = rand(minDist, maxDist);
    const at = golemCenter().add(Vec2.fromAngle(rand(0, 360)).scale(d));
    return { at, q: (d - minDist) / Math.max(1, maxDist - minDist) };
  }

  function spawnForWave(n) {
    const count = randi(CHESTS.perWave.min, CHESTS.perWave.max + 1);
    for (let i = 0; i < count; i++) {
      const { at, q } = spot(CHESTS.minDist, CHESTS.maxDist);
      makeChest(at, q, { golemChest: false, guarded: Math.random() < CHESTS.guardedChance });
    }
    // golem chest: first one GOLEM_CHEST.firstWave once awake, then every 2-3 waves
    if (awake()) {
      if (!nextGolemChest) nextGolemChest = Math.max(n, GOLEM_CHEST.firstWave);
      if (n >= nextGolemChest) {
        const { at } = spot(GOLEM_CHEST.minDist, GOLEM_CHEST.maxDist);
        makeChest(at, 1, { golemChest: true, guarded: true });
        nextGolemChest = n + randi(GOLEM_CHEST.every.min, GOLEM_CHEST.every.max + 1);
      }
    }
    const treasures = Math.min(TREASURES.max, TREASURES.base + Math.floor(TREASURES.perWave * (n - 1)));
    for (let i = 0; i < treasures; i++) {
      const { at, q } = spot(TREASURES.minDist, TREASURES.maxDist);
      add([pos(at), "treasure", { q, progress: 0 }]);
    }
  }

  function clearLoot() {
    for (const c of get("chest")) if (!c.opened) destroy(c);
    for (const t of get("treasure")) destroy(t);
  }

  function makeChest(at, q, { golemChest, guarded }) {
    const chest = add([
      sprite("chest", { frame: 0 }),
      pos(at),
      anchor("center"),
      scale(golemChest ? GOLEM_CHEST.scale : CHESTS.scale),
      color(...(golemChest ? GOLEM_CHEST.tint : [255, 255, 255])),
      z(-1),
      "chest",
      { q, golemChest, guarded, guardsOut: false, progress: 0, opened: false },
    ]);
    chest.onUpdate(() => {
      if (chest.opened) return;
      if (!canAct()) {
        chest.progress = 0;
        return;
      }
      const d = chest.pos.dist(player.pos);
      if (chest.guarded && !chest.guardsOut && d < CHESTS.guardRadius) spawnGuards(chest);
      if (d < CHESTS.openRadius) {
        chest.progress += dt() / CHESTS.openTime;
        if (chest.progress >= 1) openChest(chest);
      } else {
        chest.progress = 0; // walking away cancels
      }
    });
    return chest;
  }

  function spawnGuards(chest) {
    chest.guardsOut = true;
    const g = chest.golemChest ? GOLEM_CHEST.guards : CHESTS.guards;
    const count = randi(g.min, g.max + 1);
    const level = enemyLevelForWave(Math.max(1, wave));
    for (let i = 0; i < count; i++) {
      const at = chest.pos.add(Vec2.fromAngle((360 / count) * i + rand(-15, 15)).scale(rand(70, 130)));
      spawnEnemy(at, level, "zombie");
    }
  }

  function openChest(chest) {
    chest.opened = true;
    chest.play("open");
    fx("fx-poof", "poof", chest.pos, 2.5);
    wait(0.9, () => chest.exists() && destroy(chest));
    if (chest.golemChest) {
      root.trigger("chest-opened", { golem: true, loot: "golem-stat", q: 1 });
      wait(0.35, openGolemChestScreen);
      return;
    }
    const loot = rollChestLoot(chest.q);
    giveLoot(loot, chest.pos, chest.q, 1);
    root.trigger("chest-opened", { golem: false, loot, q: chest.q });
  }

  function rollChestLoot(q) {
    const options = Object.entries(CHESTS.loot).filter(([kind]) => {
      if (kind === "golem-repair" || kind === "golem-upgrade") return awake();
      return true;
    });
    const weights = options.map(([, w]) => Math.max(0, w.weight + (w.perQ ?? 0) * q));
    let r = rand(0, weights.reduce((a, b) => a + b, 0));
    for (let i = 0; i < options.length; i++) if ((r -= weights[i]) < 0) return options[i][0];
    return "coins";
  }

  /** Apply one reward at a world position. coinMult scales the coin bag. */
  function giveLoot(loot, at, q, coinMult) {
    if (loot === "coins") {
      const c = CHESTS.coins;
      const amount = Math.max(1, Math.round((c.base + c.perWave * (wave - 1)) * (1 + c.farBonus * q) * coinMult));
      spawnCoins(amount, at);
      popIcon("coin-bag", at);
      floatText(`+${amount} coins`, at, GOLD);
    } else if (loot === "card") {
      floatText("Level-up card!", at, [140, 200, 255]);
      root.trigger("free-level-up-card");
    } else if (loot === "heal") {
      if (player.hp && player.maxHP) player.setHP(player.maxHP());
      floatText("Full heal!", at, [120, 235, 130]);
    } else if (loot === "golem-repair") {
      const b = golem();
      if (b?.awake && b.hp) b.heal(Math.min(b.maxHP() - b.hp(), b.maxHP() * CHESTS.repairPct));
      floatText("Golem repaired!", at, [120, 235, 130]);
    } else if (loot === "golem-upgrade") {
      root.trigger("golem-upgrade-free");
      floatText("Free golem upgrade!", at, GOLD);
    }
  }

  // Treasures: dig by standing on the spot (sparkle shows when close)
  onUpdate(() => {
    if (!canAct()) {
      for (const t of get("treasure")) t.progress = 0;
      return;
    }
    for (const t of get("treasure")) {
      if (t.pos.dist(player.pos) < TREASURES.digRadius) {
        t.progress += dt() / TREASURES.digTime;
        if (t.progress >= 1) digTreasure(t);
      } else {
        t.progress = 0;
      }
    }
  });

  function digTreasure(t) {
    const at = t.pos.clone();
    const q = t.q;
    destroy(t);
    fx("fx-poof", "poof", at, 2.5);
    let loot = "coins";
    if (Math.random() < TREASURES.rareChance) {
      const rare = ["card", ...(awake() ? ["golem-repair", "golem-upgrade"] : [])];
      loot = choose(rare);
    }
    giveLoot(loot, at, q, TREASURES.coinMult);
    root.trigger("treasure-dug", { loot });
  }

  // ---- golem chest: pick 1 of 3 golem stat upgrades -----------------------
  const STATS = [
    { id: "max-hp", name: "Golem Max HP", desc: `+${GOLEM_CHEST.maxHpPerLevel} max HP, and heals that much`, icon: "Icon_Max_HP", color: [120, 235, 130] },
    { id: "armor", name: "Golem Armor", desc: `${Math.round(GOLEM_CHEST.armorPerLevel * 100)}% less HP lost per hit and while surrounded`, icon: "icon-armor", color: [205, 215, 235] },
    { id: "swipe", name: "Swipe", desc: `Shock wave ${Math.round(GOLEM_CHEST.swipeRadiusPerLevel * 100)}% bigger and stronger`, icon: "Icon_Might", color: [240, 140, 125] },
  ];

  function applyGolemStat(id) {
    const b = golem();
    const level = (golemLevels[id] += 1);
    if (id === "max-hp" && b?.setMaxHP) {
      b.setMaxHP(b.maxHP() + GOLEM_CHEST.maxHpPerLevel);
      b.heal(GOLEM_CHEST.maxHpPerLevel);
    } else if (id === "armor" && b) {
      if (!b.armorWrapped) {
        // every damage path (contact drain, bats, bosses) calls base.hurt
        const hurt = b.hurt.bind(b);
        b.hurt = (n, ...rest) => hurt(n * (b.damageTakenMult ?? 1), ...rest);
        b.armorWrapped = true;
      }
      b.damageTakenMult = Math.max(GOLEM_CHEST.armorMin, 1 - GOLEM_CHEST.armorPerLevel * level);
    } else if (id === "swipe") {
      GOLEM_SHOCKWAVE.radius = swipeBase.radius * (1 + GOLEM_CHEST.swipeRadiusPerLevel * level);
      GOLEM_SHOCKWAVE.force = swipeBase.force * (1 + GOLEM_CHEST.swipeForcePerLevel * level);
    }
    root.trigger("golem-stat-pick", { stat: id, level });
  }

  function openGolemChestScreen() {
    if (over || get("golem-chest-ui").length) return;
    if (root.paused) return wait(0.2, openGolemChestScreen); // another screen first
    root.paused = true;
    const choices = shuffle(STATS).slice(0, 3);
    const cw = 280;
    const ch = 260;
    const gap = 30;
    const x0 = width() / 2 - (choices.length * cw + (choices.length - 1) * gap) / 2;
    const y0 = height() / 2 - ch / 2 + 30;
    const cardAt = (p) => choices.findIndex((_, i) => p.x >= x0 + i * (cw + gap) && p.x <= x0 + i * (cw + gap) + cw && p.y >= y0 && p.y <= y0 + ch);
    let hover = -1;

    const ui = add([
      pos(0, 0),
      fixed(),
      z(1000),
      "golem-chest-ui",
      {
        draw() {
          drawRect({ pos: vec2(0, 0), width: width(), height: height(), color: rgb(10, 8, 18), opacity: 0.72 });
          drawText({ text: "GOLEM CHEST", size: 36, pos: vec2(width() / 2, 90), anchor: "top", color: rgb(...GOLD) });
          drawText({
            text: "Pick 1 upgrade for your golem. It lasts the whole run. Keys 1-3, or click.",
            size: 15,
            pos: vec2(width() / 2, 138),
            anchor: "top",
            color: rgb(190, 190, 210),
          });
          choices.forEach((s, i) => {
            const x = x0 + i * (cw + gap);
            const hot = hover === i;
            drawRect({ pos: vec2(x, y0), width: cw, height: ch, radius: 12, color: rgb(30, 26, 44), outline: { width: 3, color: hot ? rgb(...GOLD) : rgb(120, 110, 160) } });
            if (getSprite(s.icon)) drawSprite({ sprite: s.icon, pos: vec2(x + cw / 2, y0 + 60), anchor: "center", scale: 4 });
            drawText({ text: s.name, size: 24, pos: vec2(x + cw / 2, y0 + 110), anchor: "top", color: rgb(...s.color) });
            const lvl = golemLevels[s.id];
            drawText({ text: lvl ? `Level ${lvl + 1}` : "NEW", size: 14, pos: vec2(x + cw / 2, y0 + 142), anchor: "top", color: rgb(...GOLD) });
            drawText({ text: s.desc, size: 14, width: cw - 36, align: "center", pos: vec2(x + cw / 2, y0 + 170), anchor: "top", color: rgb(200, 200, 215) });
            const kb = vec2(x + cw / 2, y0 + ch - 26);
            drawRect({ pos: kb, width: 28, height: 28, anchor: "center", radius: 6, color: rgb(...GOLD) });
            drawText({ text: String(i + 1), size: 18, pos: kb, anchor: "center", color: rgb(...DARK) });
          });
        },
      },
    ]);

    const pick = (i) => {
      if (!ui.exists() || !choices[i]) return;
      handlers.forEach((h) => h.cancel());
      destroy(ui);
      root.paused = false;
      applyGolemStat(choices[i].id);
      root.trigger("golem-chest-closed");
    };
    const handlers = [
      onMouseMove(() => (hover = cardAt(mousePos()))),
      onMousePress(() => pick(cardAt(mousePos()))),
      ...choices.map((_, i) => onKeyPress(String(i + 1), () => pick(i))),
    ];
  }

  // ---- drawing: progress rings, golem chest glow, treasure sparkles --------
  let clock = 0;
  onUpdate(() => (clock += dt()));

  add([
    pos(0, 0),
    z(-2), // under the chests
    {
      draw() {
        for (const c of get("chest")) {
          if (!c.golemChest || c.opened) continue;
          const g = 0.5 + 0.5 * Math.sin(clock * 3);
          drawCircle({ pos: c.pos, radius: 34 + 6 * g, color: rgb(...GOLD), opacity: 0.18 + 0.12 * g });
        }
      },
    },
  ]);

  add([
    pos(0, 0),
    z(9), // over characters
    {
      draw() {
        for (const c of get("chest")) {
          if (c.opened || c.progress <= 0) continue;
          drawRing(c.pos.add(0, -4), 30, c.progress, GOLD);
        }
        for (const t of get("treasure")) {
          const d = t.pos.dist(player.pos);
          if (d < TREASURES.hintRadius && !player.down) {
            // faint sparkle, stronger the closer you are
            const a = 1 - d / TREASURES.hintRadius;
            drawSprite({ sprite: "fx-sparkle", frame: Math.floor(clock * 8) % 4, pos: t.pos, anchor: "center", scale: 2.5, opacity: 0.25 + 0.75 * a });
          }
          if (t.progress > 0) drawRing(t.pos, 26, t.progress, [200, 170, 120]);
        }
      },
    },
  ]);
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randi(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Progress ring from 12 o'clock, done = 0..1. */
function drawRing(center, radius, done, col) {
  drawCircle({ pos: center, radius, fill: false, outline: { width: 5, color: rgb(...DARK) }, opacity: 0.6 });
  const steps = Math.max(2, Math.ceil(40 * done));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * Math.min(1, done) * Math.PI * 2;
    pts.push(center.add(Math.cos(a) * radius, Math.sin(a) * radius));
  }
  drawLines({ pts, width: 4, color: rgb(...col) });
}

/** One-shot effect sprite at a world position. */
function fx(name, anim, at, size) {
  const o = add([sprite(name), pos(at), anchor("center"), scale(size), z(8), "fx"]);
  o.play(anim, { onEnd: () => o.exists() && destroy(o) });
  wait(1.5, () => o.exists() && destroy(o));
}

/** Coin bag that pops up and fades (the coins themselves fly in from base.js). */
function popIcon(name, at) {
  let t = 0;
  const o = add([sprite(name, { frame: 0 }), pos(at), anchor("center"), scale(3), opacity(1), z(8), "fx"]);
  o.onUpdate(() => {
    t += dt();
    o.pos.y -= 30 * dt();
    o.opacity = Math.max(0, 1 - t / 1);
    if (t >= 1) destroy(o);
  });
}

/** Text that rises and fades above a world position. */
function floatText(msg, at, col) {
  let t = 0;
  const o = add([text(msg, { size: 18 }), pos(at.add(0, -30)), anchor("center"), color(...col), opacity(1), z(20), "fx"]);
  o.onUpdate(() => {
    t += dt();
    o.pos.y -= 28 * dt();
    o.opacity = Math.max(0, 1 - Math.max(0, t - 0.8) / 0.8);
    if (t >= 1.6) destroy(o);
  });
}
