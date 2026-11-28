// Cycle director (docs/game-design-v2.md, tasks-v2 #3): drives the v2 loop
//
//   wave N  →  aftermath  →  break  →  shop (at the golem)  →  wave N+1  → …
//
// - When a wave ends, enemies pouf away (enemies.js) and the aftermath plays:
//   CYCLE.afterWaveDelay s of calm, then a rainbow swipe up the golem
//   ("golem-swipe", CYCLE.swipeTime s, tower.js). Then the break starts.
// - During the break a faint glowing circle (CYCLE.shopCircle px around the
//   golem's body center) shows where the shop triggers. If the player is far from the golem
//   (> CYCLE.portalMinDistance) a portal appears next to them; entering it
//   drops them next to the golem. Otherwise (or if they prefer) they just
//   walk back.
// - During the break, stepping inside the circle opens the shop.
// - While the shop is open the game is paused (CYCLE.pauseInShop): the time
//   scale is 0, so everything driven by dt (movement, timers, animations,
//   coins, respawn countdown) stops, while input still reaches the shop UI.
// - Closing the shop (pick or skip) resumes the game and starts the next wave
//   after CYCLE.nextWaveDelay.
// - On "golem-dying" / "run-over" everything stops.
//
// Contract (root events, no imports between systems):
//   fires   getTreeRoot().trigger("cycle-phase", { phase, wave, portal })
//             phase: "wave" (wave `wave` running) | "aftermath" (wave just
//             ended, flourish playing) | "break" (after wave `wave`; portal =
//             whether a portal was offered) | "shop" (open) | "starting"
//           getTreeRoot().trigger("golem-swipe", { duration }) → tower.js
//           getTreeRoot().trigger("shop-open")          → shop.js opens its UI
//           getTreeRoot().trigger("enemy-start-wave", n) → enemies.js
//   listens "wave-start", "wave-end" (enemies.js), "portal-enter" (portal.js),
//           "shop-close" (shop.js), "golem-dying" (tower.js),
//           "run-over" (tower.js, respawn.js)
import { CYCLE } from "../config.js";

export function startCycle() {
  const root = getTreeRoot();
  let phase = "idle";
  let wave = 0; // last wave started
  let over = false;

  const setPhase = (p, extra = {}) => {
    phase = p;
    // between waves (aftermath, break, shop, starting) the player doesn't
    // attack: weapons check player.resting
    const pl = player();
    if (pl) pl.resting = p !== "wave" && p !== "idle";
    root.trigger("cycle-phase", { phase: p, wave, ...extra });
  };

  // Pause while the shop is open: time scale 0, restored on close.
  let savedTimeScale = null;
  const pauseGame = () => {
    if (!CYCLE.pauseInShop || savedTimeScale !== null) return;
    savedTimeScale = debug.timeScale;
    debug.timeScale = 0;
  };
  const resumeGame = () => {
    if (savedTimeScale === null) return;
    debug.timeScale = savedTimeScale;
    savedTimeScale = null;
  };

  const base = () => get("base")[0];
  const player = () => get("player")[0];

  // Center of the golem's body (falls back to its anchor).
  function baseCenter() {
    const b = base();
    if (!b) return null;
    const r = b.solidRect?.();
    return r ? vec2((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2) : b.pos;
  }
  // Distance from the player to the golem's body center.
  function distToBase() {
    const c = baseCenter();
    const p = player();
    return c && p ? p.pos.dist(c) : Infinity;
  }

  root.on("wave-start", (n) => {
    wave = n;
    setPhase("wave");
  });

  // Wave end: enemies pouf (enemies.js) → calm → golem rainbow swipe → break.
  root.on("wave-end", ({ wave: n }) => {
    if (over) return;
    wave = n;
    setPhase("aftermath");
    wait(CYCLE.afterWaveDelay, () => {
      if (over) return;
      root.trigger("golem-swipe", { duration: CYCLE.swipeTime });
      wait(CYCLE.swipeTime, () => {
        if (over) return;
        const portal = distToBase() > CYCLE.portalMinDistance;
        setPhase("break", { portal });
      });
    });
  });

  // Portal: drop the player just below the golem; the proximity check below
  // then opens the shop.
  root.on("portal-enter", () => {
    const b = base();
    const p = player();
    if (!b || !p || phase !== "break") return;
    const r = b.solidRect?.();
    p.pos = r ? vec2((r.x0 + r.x1) / 2, r.y1 + CYCLE.arrivalGap) : b.pos.add(0, CYCLE.arrivalGap);
  });

  root.on("shop-close", () => {
    resumeGame();
    if (phase !== "shop" || over) return;
    setPhase("starting");
    wait(CYCLE.nextWaveDelay, () => {
      if (!over) root.trigger("enemy-start-wave", wave + 1);
    });
  });

  root.on("run-over", () => {
    over = true;
    phase = "over";
  });
  root.on("golem-dying", () => {
    over = true;
    phase = "over";
  });

  // Shop circle: a glowing ring around the golem during the break, showing
  // how close the player must get. Fades in, pulses (CYCLE.shopCirclePulseHz),
  // and a ripple runs from the ring toward the golem: "come here". A hint
  // under the ring says what it's for (CYCLE.shopHint).
  let circleAlpha = 0;
  const [cr, cg, cb] = CYCLE.shopCircleColor;
  const circle = add([
    pos(0, 0),
    z(3), // on the ground: under enemies' flyers, the golem (5) and the player
    {
      draw() {
        const c = baseCenter();
        if (!c || circleAlpha <= 0) return;
        const R = CYCLE.shopCircle;
        const pulse = 0.5 + 0.5 * Math.sin(time() * Math.PI * 2 * CYCLE.shopCirclePulseHz);
        const a = circleAlpha * (0.45 + 0.55 * pulse);
        const col = rgb(cr, cg, cb);
        drawCircle({ pos: c, radius: R, color: col, opacity: 0.1 * a });
        // glow: a wide soft stroke under a thin bright one
        drawCircle({ pos: c, radius: R, fill: false, outline: { width: 14, color: col }, opacity: 0.25 * a });
        drawCircle({ pos: c, radius: R, fill: false, outline: { width: 3, color: col }, opacity: 0.9 * a });
        // ripple: shrinks from the ring toward the golem, fading out
        const k = (time() * CYCLE.shopCirclePulseHz) % 1;
        drawCircle({ pos: c, radius: R * (1 - 0.35 * k), fill: false, outline: { width: 3, color: col }, opacity: 0.6 * circleAlpha * (1 - k) });
      },
    },
  ]);
  // hint under the ring, above the player and enemies so it stays readable
  add([
    pos(0, 0),
    z(40),
    {
      draw() {
        const c = baseCenter();
        if (!c || circleAlpha <= 0) return;
        const at = c.add(0, CYCLE.shopCircle + 26);
        const bob = Math.sin(time() * 4) * 2;
        const [title, sub] = CYCLE.shopHint;
        const w = Math.max(title.length * 18 * 0.62, sub.length * 13 * 0.62) + 28;
        drawRect({ pos: at.add(0, 10 + bob), width: w, height: 48, anchor: "center", radius: 10, color: rgb(20, 14, 28), opacity: 0.7 * circleAlpha });
        drawText({ text: title, size: 18, pos: at.add(0, bob), anchor: "center", color: rgb(cr, cg, cb), opacity: circleAlpha });
        drawText({ text: sub, size: 13, pos: at.add(0, 21 + bob), anchor: "center", color: rgb(235, 230, 220), opacity: circleAlpha });
      },
    },
  ]);
  circle.onUpdate(() => {
    const goal = phase === "break" && !over ? 1 : 0;
    circleAlpha += (goal - circleAlpha) * Math.min(1, dt() * 5);
    if (goal === 0 && circleAlpha < 0.01) circleAlpha = 0;
  });

  // Break: stepping inside the shop circle opens the shop (not while dead or frozen).
  onUpdate(() => {
    if (phase !== "break" || over) return;
    const p = player();
    if (!p || p.down || p.frozen) return;
    if (distToBase() <= CYCLE.shopCircle) {
      setPhase("shop");
      pauseGame();
      root.trigger("shop-open");
    }
  });

  return {
    start() {
      root.trigger("enemy-start-wave", 1);
    },
    phase: () => phase,
    wave: () => wave,
  };
}
