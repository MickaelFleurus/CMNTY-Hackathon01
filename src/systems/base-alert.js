// Base under attack UI (docs/game-design-v2.md → "Base under attack").
// The player is often far from the golem, so they must always know when it's
// being hit and how much HP it has left:
//
//   - golem HP bar in the HUD (top center, under the survival timer), always
//     visible once the golem is awake. It flashes when the golem takes damage.
//     While the player is dead, their respawn countdown sits next to it.
//   - "BASE UNDER ATTACK!" banner when the golem starts taking damage. It
//     shows again only after the golem was left alone for BASE_ALERT.bannerQuiet s.
//   - off-screen arrow at the screen edge pointing at the golem while it's
//     being attacked (red, pulsing). Quiet otherwise: the break-time guide
//     arrow (guide-arrow.js) already points home when the shop is open.
//   - danger state below BASE_ALERT.dangerRatio HP: red pulse around the
//     screen edges, and the arrow stays up (bigger, faster) even between hits.
//
// The golem's own hit flash and HP bar above it are tower.js's.
//
// Contract (no imports between systems):
//   - reads the object tagged "base": hp() / maxHP(), awake, solidRect() (tower.js)
//   - reads the "player": down / respawnIn / frozen (respawn.js, runstate.js)
//   - listens "golem-dying" / "run-over": everything hides
//   - listens "cycle-phase" { phase } (cycle.js): no arrow during the break
//   - "being attacked" = the golem lost HP in the last BASE_ALERT.attackedFor s.
//     Repairs and level ups (HP going up) don't count.
//   - fires getTreeRoot().trigger("base-under-attack", { hp, maxHP }) each time
//     the banner shows, for anything else that wants to react (sound later).
// Timers run on dt(), so pausing (level up, shop, pause.js) stops them.
import { BASE_ALERT as CFG } from "../config.js";

export function startBaseAlert() {
  let over = false;
  let phase = "idle";
  getTreeRoot().on("golem-dying", () => (over = true));
  getTreeRoot().on("run-over", () => (over = true));
  getTreeRoot().on("cycle-phase", (e) => (phase = e?.phase ?? phase));

  let lastHp = null;
  let clock = 0; // game time (s), stops while paused
  let lastHitAt = -Infinity;
  let bannerUntil = -Infinity;
  let flash = 0; // 1 right after a hit, fades to 0

  const golem = () => {
    const b = get("base")[0];
    return b?.exists() && b.awake && typeof b.hp === "function" ? b : null;
  };
  const attacked = () => clock - lastHitAt < CFG.attackedFor;

  onUpdate(() => {
    const d = dt();
    if (d === 0) return;
    clock += d;
    flash = Math.max(0, flash - d / CFG.flashTime);
    const b = golem();
    if (!b || over) {
      lastHp = b ? b.hp() : null;
      return;
    }
    const hp = b.hp();
    if (lastHp !== null && hp < lastHp - 1e-6) {
      // a new attack after a quiet spell → banner
      if (clock - lastHitAt >= CFG.bannerQuiet) {
        bannerUntil = clock + CFG.bannerTime;
        getTreeRoot().trigger("base-under-attack", { hp, maxHP: b.maxHP() });
      }
      lastHitAt = clock;
      flash = 1;
    }
    lastHp = hp;
  });

  add([
    pos(0, 0),
    fixed(),
    z(880), // under the HUD, over the world
    {
      draw() {
        const b = golem();
        if (!b || over) return;
        if (b.hp() / b.maxHP() < CFG.dangerRatio) drawDangerEdges(clock);
      },
    },
  ]);

  add([
    pos(0, 0),
    fixed(),
    z(905), // with the HUD
    {
      draw() {
        const b = golem();
        if (!b || over) return;
        drawGolemBar(b, flash, get("player")[0]);
        if (clock < bannerUntil) drawBanner(clock, bannerUntil);
      },
    },
  ]);

  add([
    pos(0, 0),
    fixed(),
    z(950), // same layer as the guide arrow, under the game-over / shop screens
    {
      draw() {
        const b = golem();
        const p = get("player")[0];
        if (!b || over || phase === "break" || !p || p.down || p.frozen) return;
        const danger = b.hp() / b.maxHP() < CFG.dangerRatio;
        if (!attacked() && !danger) return;
        const r = b.solidRect();
        const at = toScreen(vec2((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2));
        const m = CFG.onScreenMargin;
        const visible = at.x > m && at.x < width() - m && at.y > m && at.y < height() - m;
        if (!visible) drawBaseArrow(at, clock, danger);
      },
    },
  ]);
}

/** Golem HP bar, top center: green → amber → red, dark gray empty part. */
function drawGolemBar(b, flash, p) {
  const { width: w, height: h, y } = CFG.bar;
  const x = width() / 2 - w / 2;
  const ratio = Math.max(0, Math.min(1, b.hp() / b.maxHP()));
  drawRect({ pos: vec2(x - 2, y - 2), width: w + 4, height: h + 4, radius: 4, color: rgb(20, 14, 28), opacity: 0.85 });
  drawRect({ pos: vec2(x, y), width: w, height: h, radius: 3, color: rgb(60, 60, 70) });
  if (ratio > 0) drawRect({ pos: vec2(x, y), width: w * ratio, height: h, radius: 3, color: barColor(ratio) });
  // hit flash: white over the bar, fading out
  if (flash > 0) drawRect({ pos: vec2(x, y), width: w, height: h, radius: 3, color: rgb(255, 255, 255), opacity: 0.6 * flash });
  drawText({
    text: `GOLEM ${Math.ceil(b.hp())}/${b.maxHP()}`,
    size: CFG.bar.textSize,
    pos: vec2(width() / 2, y + h / 2),
    anchor: "center",
    color: rgb(255, 255, 255),
  });
  // while dead: watch whether the golem holds until you're back
  if (p?.down) {
    drawText({
      text: `You: back in ${Math.ceil(p.respawnIn ?? 0)}s`,
      size: CFG.bar.textSize,
      pos: vec2(x + w + 12, y + h / 2),
      anchor: "left",
      color: rgb(255, 140, 130),
    });
  }
}

export function barColor(ratio) {
  if (ratio > 0.5) return rgb(90, 210, 110); // green
  if (ratio > CFG.dangerRatio) return rgb(240, 180, 60); // amber
  return rgb(235, 70, 60); // red
}

function drawBanner(clock, until) {
  const left = until - clock;
  const shown = CFG.bannerTime - left;
  // quick fade in, fade out over the last 0.5 s
  const alpha = Math.min(1, shown / 0.15, left / 0.5);
  const pulse = 0.85 + 0.15 * Math.sin(clock * 12);
  const y = CFG.bar.y + CFG.bar.height + 30;
  drawRect({
    pos: vec2(width() / 2, y),
    width: 380,
    height: 40,
    anchor: "center",
    radius: 8,
    color: rgb(120, 20, 24),
    opacity: 0.85 * alpha,
  });
  drawText({
    text: "BASE UNDER ATTACK!",
    size: 26,
    pos: vec2(width() / 2, y),
    anchor: "center",
    color: rgb(255, 230 * pulse, 220 * pulse),
    opacity: alpha,
  });
}

/** Red pulse along the four screen edges (a few stacked strips = soft fade inward). */
function drawDangerEdges(clock) {
  const pulse = 0.5 - 0.5 * Math.cos(clock * Math.PI * 2 * CFG.dangerHz);
  const strips = 6;
  const t = CFG.dangerEdge / strips;
  for (let i = 0; i < strips; i++) {
    const o = CFG.dangerOpacity * pulse * (1 - i / strips);
    const inset = i * t;
    const col = rgb(230, 30, 30);
    drawRect({ pos: vec2(0, inset), width: width(), height: t, color: col, opacity: o });
    drawRect({ pos: vec2(0, height() - inset - t), width: width(), height: t, color: col, opacity: o });
    drawRect({ pos: vec2(inset, 0), width: t, height: height(), color: col, opacity: o });
    drawRect({ pos: vec2(width() - inset - t, 0), width: t, height: height(), color: col, opacity: o });
  }
}

/** Red arrow at the screen edge toward the golem, pulsing (stronger in danger). */
function drawBaseArrow(at, clock, danger) {
  const c = vec2(width() / 2, height() / 2);
  const dir = at.sub(c).unit();
  const m = CFG.edgeMargin;
  const hw = width() / 2 - m;
  const hh = height() / 2 - m;
  const t = Math.min(
    Math.abs(dir.x) > 1e-6 ? hw / Math.abs(dir.x) : Infinity,
    Math.abs(dir.y) > 1e-6 ? hh / Math.abs(dir.y) : Infinity,
  );
  const hz = danger ? CFG.arrowHz * 2 : CFG.arrowHz;
  const pulse = 0.5 + 0.5 * Math.sin(clock * Math.PI * 2 * hz);
  const tip = c.add(dir.scale(t + pulse * 6));
  const s = CFG.arrowSize * (danger ? 1.35 : 1) * (0.9 + 0.2 * pulse);
  const side = vec2(-dir.y, dir.x);
  const back = tip.sub(dir.scale(s * 1.4));
  const pts = [tip, back.add(side.scale(s * 0.75)), back.add(dir.scale(s * 0.35)), back.sub(side.scale(s * 0.75))];
  drawPolygon({ pts: pts.map((p) => p.add(dir.scale(2))), color: rgb(20, 14, 28), opacity: 0.6 });
  drawPolygon({ pts, color: rgb(240, 60 + 60 * pulse, 50), opacity: 0.95 });

  const label = "BASE";
  const size = 18;
  const w = label.length * size * 0.62 + 14;
  const h = size + 8;
  const reach = s * 0.4 + Math.abs(dir.x) * (w / 2) + Math.abs(dir.y) * (h / 2) + 6;
  const labelAt = back.sub(dir.scale(reach));
  drawRect({ pos: labelAt, width: w, height: h, anchor: "center", radius: h / 2, color: rgb(20, 14, 28), opacity: 0.7 });
  drawText({ text: label, size, pos: labelAt, anchor: "center", color: rgb(255, 120, 110) });
}
