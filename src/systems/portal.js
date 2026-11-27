// Portal: appears when a wave ends, teleports the player home to the base so
// the shop opens (v2 cycle: wave → portal → shop → next wave). The
// cycle director (tasks-v2 #3, Mickael) will own the phase sequencing; this
// system is intentionally dumb — it listens to "wave-end"/"wave-start" and
// only fires "portal-enter" when the player walks into it.
//
// Contract (no imports needed — use KAPLAY tags/events):
//   - Portal spawns near the player when the cycle director starts a break
//     with a portal (cycle-phase { phase: "break", portal: true }, i.e. the
//     player is far from the golem); despawns on any other phase and on
//     "portal-enter".
//   - getTreeRoot().trigger("portal-enter")   fired when the player walks in;
//     the cycle director drops the player next to the golem (shop opens by
//     proximity).
import { SHOP } from "../config.js";

let spritesLoaded = false;

export function loadPortalSprites() {
  if (spritesLoaded) return;
  spritesLoaded = true;
  loadSprite("fx-level-up", "gfx/SurvivorsStarterKit_v1.0/Effects/FX_Level_Up.png", {
    sliceX: 6, // 192x32: 6 frames of 32x32
    anims: { pulse: { from: 0, to: 5, loop: true, speed: 8 } },
  });
}

export function makePortal() {
  let portal = null;

  function spawn() {
    if (portal) return;
    const player = get("player")[0];
    if (!player) return;
    portal = add([
      sprite("fx-level-up", { anim: "pulse" }),
      pos(player.pos.x + SHOP.portal.offset, player.pos.y),
      anchor("center"),
      scale(SHOP.portal.scale),
      opacity(0.85),
      z(6),
      "portal",
    ]);
    portal.add([
      text("→ HOME", { size: 10 }),
      anchor("bot"),
      pos(0, 14),
      opacity(0.9),
    ]);
  }

  function despawn() {
    if (portal) destroy(portal);
    portal = null;
  }

  getTreeRoot().on("cycle-phase", ({ phase, portal }) => {
    if (phase === "break" && portal) spawn();
    else despawn();
  });
  getTreeRoot().on("portal-enter", despawn);

  portalCheck();
  return { spawn, despawn };
}

function portalCheck() {
  onUpdate(() => {
    const portal = get("portal")[0];
    const player = get("player")[0];
    if (!portal || !player) return;
    if (player.pos.dist(portal.pos) < SHOP.portal.enterRadius) {
      getTreeRoot().trigger("portal-enter");
    }
  });
}
