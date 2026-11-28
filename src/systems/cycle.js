// Cycle director (docs/game-design-v2.md, tasks-v2 #3): drives the v2 loop
//
//   wave N  →  break  →  shop (at the golem)  →  wave N+1  → …
//
// - When a wave ends, the break starts. If the player is far from the golem
//   (> CYCLE.portalMinDistance) a portal appears next to them; entering it
//   drops them next to the golem. Otherwise (or if they prefer) they just
//   walk back.
// - During the break, getting close to the golem (< CYCLE.shopRadius from its
//   body) opens the shop.
// - While the shop is open the game is paused (CYCLE.pauseInShop): the time
//   scale is 0, so everything driven by dt (movement, timers, animations,
//   coins, respawn countdown) stops, while input still reaches the shop UI.
// - Closing the shop (pick or skip) resumes the game and starts the next wave
//   after CYCLE.nextWaveDelay.
// - On "run-over" everything stops.
//
// Contract (root events, no imports between systems):
//   fires   getTreeRoot().trigger("cycle-phase", { phase, wave, portal })
//             phase: "wave" (wave `wave` running) | "break" (after wave
//             `wave`; portal = whether a portal was offered) | "shop" (open)
//           getTreeRoot().trigger("shop-open")          → shop.js opens its UI
//           getTreeRoot().trigger("enemy-start-wave", n) → enemies.js
//   listens "wave-start", "wave-end" (enemies.js), "portal-enter" (portal.js),
//           "shop-close" (shop.js), "run-over" (tower.js, respawn.js)
import { CYCLE } from "../config.js";
import { rectDistance } from "../util/solid.js";

export function startCycle() {
  const root = getTreeRoot();
  let phase = "idle";
  let wave = 0; // last wave started
  let over = false;

  const setPhase = (p, extra = {}) => {
    phase = p;
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

  // Distance from the player to the golem's body (falls back to its anchor).
  function distToBase() {
    const b = base();
    const p = player();
    if (!b || !p) return Infinity;
    if (b.solidRect) return rectDistance(p.pos.x, p.pos.y, b.solidRect()).d;
    return p.pos.dist(b.pos);
  }

  root.on("wave-start", (n) => {
    wave = n;
    setPhase("wave");
  });

  root.on("wave-end", ({ wave: n }) => {
    if (over) return;
    wave = n;
    const portal = distToBase() > CYCLE.portalMinDistance;
    setPhase("break", { portal });
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

  // Break: walking up to the golem opens the shop (not while dead or frozen).
  onUpdate(() => {
    if (phase !== "break" || over) return;
    const p = player();
    if (!p || p.down || p.frozen) return;
    if (distToBase() <= CYCLE.shopRadius) {
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
