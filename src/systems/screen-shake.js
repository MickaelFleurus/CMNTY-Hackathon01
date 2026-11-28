// Screen shake on rare, big moments only (never on kills or weapon hits:
// constant shake makes a horde game tiring and hard to read).
//
//   golem falls ("golem-dying")         strong
//   boss defeated ("boss-defeated")     strong
//   boss wave starts ("boss-wave")      medium-strong
//   Bomb bonus ("bonus-picked" bomb)    medium
//   golem shock wave ("golem-shockwave") small
//   player hit ("damage-taken" player)  very small, at most once per
//                                       SCREEN_SHAKE.hitCooldown s
//
// Uses KAPLAY's shake(px): the view jumps by up to that many px and settles
// within a fraction of a second, on top of the camera follow (camera.js).
// SCREEN_SHAKE.toggleKey turns it off / on (remembered in the browser).
// Strengths and timings: SCREEN_SHAKE in config.js.
import { SCREEN_SHAKE as CFG } from "../config.js";

const STORE_KEY = "golem-necromancer-no-shake";

export function startScreenShake() {
  let enabled = true;
  try {
    enabled = localStorage.getItem(STORE_KEY) !== "1";
  } catch {
    /* storage unavailable: on */
  }
  onKeyPress(CFG.toggleKey, () => {
    enabled = !enabled;
    try {
      localStorage.setItem(STORE_KEY, enabled ? "0" : "1");
    } catch {
      /* not remembered */
    }
    console.log(`screen shake ${enabled ? "on" : "off"}`);
  });

  let over = false;
  const kick = (px) => enabled && !over && px > 0 && shake(px);
  const root = getTreeRoot();

  root.on("golem-dying", () => {
    kick(CFG.golemDying);
    over = true; // nothing else shakes after the golem fell
  });
  root.on("run-over", () => (over = true));
  root.on("boss-defeated", () => kick(CFG.bossDefeated));
  root.on("boss-wave", () => kick(CFG.bossWave));
  root.on("bonus-picked", ({ kind } = {}) => kind === "bomb" && kick(CFG.bomb));
  root.on("golem-shockwave", () => kick(CFG.shockwave));

  let lastHit = -Infinity;
  root.on("damage-taken", ({ kind } = {}) => {
    if (kind !== "player") return;
    const now = performance.now() / 1000;
    if (now - lastHit < CFG.hitCooldown) return;
    lastHit = now;
    kick(CFG.playerHit);
  });
}
