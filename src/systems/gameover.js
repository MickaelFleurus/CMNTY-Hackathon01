// Game-over screen: opens once on "run-frozen" (runstate.js guarantees
// everything has stopped), shows why the run ended plus run stats and the
// best-run record, and restarts the run on Space/Enter or click.
//
// Events it reads (no imports from other owners' systems):
//   - "run-over" { reason }    reason + stats snapshot. reason is
//       "tower-destroyed" (tower.js) or "player-died" (respawn.js: the player
//       died in wave 1, before the golem woke up)
//   - "run-frozen"             from runstate.js - opens the screen
// Restarts by reloading the page - every system boots fresh in main.js, and a
// reload cannot leak module state (coins, xpState, cycle phase, upgrades).
// S opens the stats page (latest run + all runs, saved by run-stats.js):
// C copies the stats JSON, D downloads it, S / Esc closes the page.
import { hudState } from "./hud.js";
import { xpState } from "./xp.js";
import { loadStats } from "./run-stats.js";
import { isFocusClick } from "../util/focusClick.js";

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

// Why the run ended, by "run-over" reason.
const REASON_TEXT = {
  "tower-destroyed": (wave) => `the base golem was destroyed on wave ${wave}`,
  "player-died": (wave) => `you fell on wave ${wave}, before the golem woke up`,
};

function open({ reason, at, wave, kills, coins }) {
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
  add([text((REASON_TEXT[reason] ?? REASON_TEXT["tower-destroyed"])(wave), { align: "center", size: 26, width: width() }), pos(0, height() * 0.32), fixed(), z(1000)]);
  add([text(`time survived ${survived}\nkills ${kills}\nlevel ${level}\ncoins ${coins}`, { align: "center", size: 26, lineSpacing: 10, width: width() }), pos(0, height() * 0.48), fixed(), z(1000)]);
  if (bestLine) {
    add([text(bestLine, { align: "center", size: 22, width: width() }), pos(0, height() * 0.72), fixed(), z(1000), color(240, 200, 80)]);
  }
  add([text("press SPACE to try again", { align: "center", size: 28, width: width() }), pos(0, height() * 0.8), fixed(), z(1000)]);
  add([text("S: stats", { align: "center", size: 20, width: width() }), pos(0, height() * 0.88), fixed(), z(1000), color(170, 170, 200)]);

  let statsPage = null;
  const toggleStats = () => {
    if (statsPage) {
      statsPage.destroy();
      statsPage = null;
    } else statsPage = openStatsPage();
  };
  const restart = () => location.reload();
  onKeyPress("space", restart);
  onKeyPress("enter", restart);
  // not the click that refocused the window: that would restart unseen
  onClick(() => !statsPage && !isFocusClick() && restart());
  onKeyPress("s", toggleStats);
  onKeyPress("escape", () => statsPage && toggleStats());
  onKeyPress("c", () => statsPage && copyStats(statsPage));
  onKeyPress("d", () => statsPage && downloadStats());
}

// ---------------------------------------------------------------------------
// Stats page: latest run | all runs
// ---------------------------------------------------------------------------

const num = (n) => Math.round(n ?? 0).toLocaleString("en-US");
const clock = (s) => {
  const t = Math.floor(s ?? 0);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}h${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
// { zombie: 12, bat: 3 } → "zombie 12 · bat 3" (biggest first)
const mapLine = (m) => {
  const entries = Object.entries(m ?? {}).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([k, v]) => `${k.replace(/^weapon-/, "")} ${num(v)}`).join(" · ") : "-";
};
const MILESTONES = ["5", "10", "20", "50", "100"];

function runLines(r) {
  return [
    `Wave reached ${r.waveReached} · survived ${r.maxWaveSurvived}`,
    `Milestones  ${MILESTONES.map((w) => `${w}${r.milestones?.[w] ? "✓" : "-"}`).join("  ")}`,
    `Time ${clock(r.timeSurvived)} · level ${r.levelReached}`,
    `Kills ${num(r.killsTotal)} · bosses ${num(r.bossesDefeated)} · deaths ${num(r.playerDeaths)}`,
    `Coins earned ${num(r.coinsEarned)} · golem repaired ${num(r.golemRepaired)}`,
    `Damage dealt ${num(r.damageDealt)}`,
    `Damage taken: you ${num(r.damageTakenPlayer)} · golem ${num(r.damageTakenGolem)}`,
    "",
    `Kills by type: ${mapLine(r.kills)}`,
    `Cards: ${mapLine(r.cards)}`,
    `Shop: ${mapLine(r.shopPicks)}`,
    `Pickups: ${mapLine(r.pickups)}`,
    `Bonuses: ${mapLine(r.bonuses)}`,
  ];
}

function totalLines(t) {
  return [
    `Best wave reached ${t.maxWaveReached} · survived ${t.maxWaveSurvived}`,
    `Wave reached  ${MILESTONES.map((w) => `${w}: ${t.milestones?.[w] ?? 0}×`).join("  ")}`,
    `Time ${clock(t.timeSurvived)} · best level ${t.maxLevel}`,
    `Kills ${num(t.killsTotal)} · bosses ${num(t.bossesDefeated)} · deaths ${num(t.playerDeaths)}`,
    `Coins earned ${num(t.coinsEarned)} · golem repaired ${num(t.golemRepaired)}`,
    `Damage dealt ${num(t.damageDealt)}`,
    `Damage taken: you ${num(t.damageTakenPlayer)} · golem ${num(t.damageTakenGolem)}`,
    "",
    `Kills by type: ${mapLine(t.kills)}`,
    `Cards: ${mapLine(t.cards)}`,
    `Shop: ${mapLine(t.shopPicks)}`,
    `Pickups: ${mapLine(t.pickups)}`,
    `Bonuses: ${mapLine(t.bonuses)}`,
  ];
}

function openStatsPage() {
  const s = loadStats();
  const page = add([fixed(), z(1100)]);
  page.add([rect(width(), height()), color(14, 12, 22)]);
  page.add([text("STATS", { size: 48 }), pos(width() / 2, 44), anchor("center"), color(255, 214, 120)]);
  const colW = width() / 2 - 70;
  const column = (x, title, lines) => {
    page.add([text(title, { size: 24 }), pos(x, 92), color(255, 214, 120)]);
    page.add([text(lines.join("\n"), { size: 16, width: colW, lineSpacing: 6 }), pos(x, 130), color(225, 225, 240)]);
  };
  column(50, "Latest run", runLines(s.latest));
  column(width() / 2 + 20, `All runs (${s.total.runs})`, totalLines(s.total));
  page.add([
    text("C: copy stats (JSON)   ·   D: download stats.json   ·   S / Esc: back", { size: 16, align: "center", width: width() }),
    pos(0, height() - 40),
    color(170, 170, 200),
  ]);
  page.feedback = page.add([text("", { size: 16, align: "center", width: width() }), pos(0, height() - 66), color(120, 220, 140)]);
  return page;
}

function statsJson() {
  return JSON.stringify(loadStats(), null, 2);
}

function copyStats(page) {
  navigator.clipboard?.writeText(statsJson()).then(
    () => (page.feedback.text = "stats copied to the clipboard"),
    () => (page.feedback.text = "couldn't copy - use D to download instead"),
  );
}

function downloadStats() {
  const url = URL.createObjectURL(new Blob([statsJson()], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "golem-necromancer-stats.json";
  a.click();
  URL.revokeObjectURL(url);
}
