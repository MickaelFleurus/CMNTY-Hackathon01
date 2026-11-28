// Dev-only playtest switches. Active ONLY on the Vite dev server
// (`npm run dev`, import.meta.env.DEV); compiled out of production builds.
//
//   K              toggle the player's attack on/off (DEV.toggleAttackKey)
//   N              end the running wave now, as if survived (DEV.endWaveKey):
//                  fires "enemy-end-wave" (enemies.js) → the normal wave-end
//                  sequence (pouf, golem swipe, shop circle)
//   F              toggle an enemy freeze (DEV.freezeEnemiesKey): fires
//                  "enemy-freeze" { frozen } (enemies.js). Enemies stand still
//                  (anim paused) and deal no contact damage; spawning and the
//                  wave timer go on (new enemies arrive frozen). They can
//                  still be shot and killed. Same freeze as the future
//                  power-up, which passes a duration.
//   ?noattack      URL param: start with the player's attack off
//                  (e.g. http://localhost:5173/?noattack)
//
// Contract: sets player.attackDisabled; player weapons skip firing while it's
// true (weapons.js). Base/tower shooting and auras are unaffected, so they can
// be playtested on their own.
import { DEV } from "../config.js";

export function startDevTools(player) {
  if (!import.meta.env.DEV) return;

  player.attackDisabled = new URLSearchParams(location.search).has("noattack");

  onKeyPress(DEV.endWaveKey, () => {
    if (getTreeRoot().paused || debug.timeScale === 0) return; // level-up / shop open
    getTreeRoot().trigger("enemy-end-wave");
    console.log("[dev] wave ended early");
  });

  let enemiesFrozen = false; // synced from enemies.js (a timed freeze ends by itself)
  getTreeRoot().on("enemy-freeze-changed", ({ frozen }) => (enemiesFrozen = frozen));
  onKeyPress(DEV.freezeEnemiesKey, () => {
    if (getTreeRoot().paused || debug.timeScale === 0) return; // level-up / shop open
    getTreeRoot().trigger("enemy-freeze", { frozen: !enemiesFrozen });
    console.log(`[dev] enemies ${enemiesFrozen ? "FROZEN" : "unfrozen"}`);
  });

  onKeyPress(DEV.toggleAttackKey, () => {
    player.attackDisabled = !player.attackDisabled;
    console.log(`[dev] player attack ${player.attackDisabled ? "OFF" : "ON"}`);
  });

  // Small reminder in the corner while a switch is on, on a dark backing
  // (separate object one layer below, so it reads on the grass).
  const label = add([
    text("", { size: 14 }),
    pos(width() - 16, 16),
    anchor("topright"),
    color(255, 110, 110),
    fixed(),
    z(901),
  ]);
  add([
    pos(0, 0),
    fixed(),
    z(900),
    {
      draw() {
        if (!label.text) return;
        drawRect({
          pos: vec2(label.pos.x - label.width - 8, label.pos.y - 5),
          width: label.width + 16,
          height: label.height + 10,
          color: rgb(20, 14, 28),
          opacity: 0.8,
          radius: 4,
        });
      },
    },
  ]);
  label.onUpdate(() => {
    const lines = [];
    if (player.attackDisabled) lines.push(`DEV: player attack OFF (${DEV.toggleAttackKey.toUpperCase()})`);
    if (enemiesFrozen) lines.push(`DEV: enemies FROZEN (${DEV.freezeEnemiesKey.toUpperCase()})`);
    label.text = lines.join("\n");
  });
}
