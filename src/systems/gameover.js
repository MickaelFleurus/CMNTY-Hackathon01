// Game-over screen: opens once on "run-frozen" (runstate.js guarantees
// everything has stopped), shows why the run ended plus run stats and the
// best-run record, and restarts the run on Space/Enter or click.
//
// Events it reads (no imports from other owners' systems):
//   - "run-over" { reason }    from tower.js - reason + stats snapshot
//   - "run-frozen"             from runstate.js - opens the screen
// Restarts by reloading the page - every system boots fresh in main.js, and a
// reload cannot leak module state (coins, xpState, cycle phase, upgrades).
import { hudState } from "./hud.js";
import { xpState } from "./xp.js";

let stats = null;

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function startGameOver() {
  getTreeRoot().on("run-over", ({ reason } = {}) => {
    stats = { reason, at: time(), kills: hudState.kills, coins: hudState.coins, wave: hudState.wave };
  });

  getTreeRoot().on("run-frozen", () => {
    if (stats) open(stats);
  });
}

function open({ at, wave, kills, coins }) {
  const survived = fmt(time() - at);
  const level = xpState.level;

  // best-run record: furthest wave wins, then longest survival
  const KEY = "cmnty-best-run";
  let best = {};
  try {
    best = JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    /* corrupt record → treat as none */
  }
  const better = wave > (best.wave ?? 0) || (wave === (best.wave ?? 0) && survived > (best.time ?? ""));
  if (better) {
    best = { wave, time: survived };
    try {
      localStorage.setItem(KEY, JSON.stringify(best));
    } catch {
      /* storage unavailable (private mode) → skip the record */
    }
  }
  const bestLine = best.wave ? `${better ? "NEW BEST! " : ""}best: wave ${best.wave} · ${best.time}` : "";

  add([rect(width(), height()), color(10, 10, 16), fixed(), z(990)]);
  add([text("RUN OVER", { align: "center", size: 64, width: width() }), pos(0, height() * 0.2), fixed(), z(1000), color(220, 60, 60)]);
  add([text(`the base golem was destroyed on wave ${wave}`, { align: "center", size: 26, width: width() }), pos(0, height() * 0.32), fixed(), z(1000)]);
  add([text(`time survived ${survived}\nkills ${kills}\nlevel ${level}\ncoins ${coins}`, { align: "center", size: 26, lineSpacing: 10, width: width() }), pos(0, height() * 0.48), fixed(), z(1000)]);
  if (bestLine) {
    add([text(bestLine, { align: "center", size: 22, width: width() }), pos(0, height() * 0.72), fixed(), z(1000), color(240, 200, 80)]);
  }
  add([text("press SPACE to try again", { align: "center", size: 28, width: width() }), pos(0, height() * 0.8), fixed(), z(1000)]);

  const restart = () => location.reload();
  onKeyPress("space", restart);
  onKeyPress("enter", restart);
  onClick(restart);
}
