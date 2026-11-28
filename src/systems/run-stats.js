// Run statistics: everything trackable about the latest run and about all
// runs, saved in the browser as ONE plain JSON object, easy to read, copy,
// download and import on another machine.
//
// Storage: localStorage["golem-necromancer-stats"] =
//   {
//     "version": 1,
//     "latest": { …one run… },     // the run in progress / the last one played
//     "total":  { …all runs… }     // summed counts, best values, run count
//   }
// A run (`latest`) and the totals share the same counters:
//   kills            { [enemyType]: n }     e.g. { "zombie": 120, "bat": 40 }
//   cards            { [upgradeId]: n }     level-up cards picked ("weapon-knife", "might"…)
//   shopPicks        { [optionId]: n }      golem shop picks
//   pickups          { [kind]: n }          ground pickups collected ("xp-blue", "heart", "coin"…)
//   bonuses          { [kind]: n }          rare bonus drops picked ("bomb", "freeze"…)
//   milestones       { "5": n, "10": n, "20": n, "50": n, "100": n }   times that wave was reached
//   killsTotal, bossesDefeated, playerDeaths, coinsEarned, damageDealt,
//   damageTakenPlayer, damageTakenGolem, golemRepaired, timeSurvived (s)
// plus per run: startedAt / endedAt (ISO), endReason, waveReached,
// maxWaveSurvived, levelReached; and in total: runs, maxWaveReached,
// maxWaveSurvived, maxLevel. All numbers are plain JSON numbers.
//
// Saved every SAVE_EVERY s, when the run ends and when the tab closes, so a
// run cut short still counts. The starter weapon (granted, not picked) isn't
// counted as a card: startRunStats() runs after main.js grants it.
//
// window.gameStats = { get(), export(), import(json), reset() } - console /
// transfer helper. The stats page (game-over screen, S) uses the same data.
//
// Events read (no imports between systems): on("killed", "enemy"),
// player "upgrade" / "levelup", root "shop-pick", "bonus-picked",
// "pickup-collected" (xp.js, base.js), "coins-changed", "damage-dealt",
// "damage-taken", "golem-repaired", "player-down", "boss-defeated",
// "wave-start", "wave-end", "run-over".

export const STATS_KEY = "golem-necromancer-stats";
const VERSION = 1;
const MILESTONES = [5, 10, 20, 50, 100];
const SAVE_EVERY = 2; // s

const COUNTERS = [
  "killsTotal", "bossesDefeated", "playerDeaths", "coinsEarned", "damageDealt",
  "damageTakenPlayer", "damageTakenGolem", "golemRepaired", "timeSurvived",
];
const MAPS = ["kills", "cards", "shopPicks", "pickups", "bonuses", "milestones"];

function emptyCounts() {
  const o = {};
  for (const k of COUNTERS) o[k] = 0;
  for (const k of MAPS) o[k] = {};
  return o;
}

function emptyRun() {
  return {
    startedAt: new Date().toISOString(),
    endedAt: null,
    endReason: null,
    waveReached: 0,
    maxWaveSurvived: 0,
    levelReached: 1,
    ...emptyCounts(),
  };
}

function emptyTotal() {
  return { runs: 0, maxWaveReached: 0, maxWaveSurvived: 0, maxLevel: 0, ...emptyCounts() };
}

/** Saved stats, or a fresh object if none / unreadable / other version. */
export function loadStats() {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY));
    if (s?.version === VERSION && s.total && s.latest) {
      // tolerate fields added later: fill in anything missing
      s.total = { ...emptyTotal(), ...s.total };
      s.latest = { ...emptyRun(), ...s.latest };
      return s;
    }
  } catch {
    /* corrupt → start over */
  }
  return { version: VERSION, latest: emptyRun(), total: emptyTotal() };
}

// set by gameStats.import()/reset(): this page must not overwrite them anymore
let storageLocked = false;

function saveStats(stats) {
  if (storageLocked) return;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    /* storage unavailable (private mode): stats stay in memory */
  }
}

export function startRunStats(player) {
  const stats = loadStats();
  stats.latest = emptyRun();
  stats.total.runs += 1;
  let dirty = true;
  let over = false;

  const run = () => stats.latest;
  const total = () => stats.total;
  // add to a counter in both the run and the totals
  const add = (key, n = 1) => {
    if (over || !(n > 0)) return;
    run()[key] += n;
    total()[key] += n;
    dirty = true;
  };
  const count = (map, key, n = 1) => {
    if (over || key == null) return;
    run()[map][key] = (run()[map][key] ?? 0) + n;
    total()[map][key] = (total()[map][key] ?? 0) + n;
    dirty = true;
  };
  const best = (key, runKey, value) => {
    if (value > run()[runKey]) run()[runKey] = value;
    if (value > total()[key]) total()[key] = value;
    dirty = true;
  };

  const root = getTreeRoot();
  on("killed", "enemy", (_e, info = {}) => {
    add("killsTotal");
    count("kills", info.type ?? _e?.type ?? "unknown");
  });
  player.on("upgrade", ({ id, level } = {}) => level > 0 && count("cards", id));
  player.on("levelup", (lvl) => best("maxLevel", "levelReached", lvl ?? 0));
  root.on("shop-pick", (pick = {}) => count("shopPicks", pick.id ?? pick.quadrant));
  root.on("bonus-picked", ({ kind } = {}) => count("bonuses", kind));
  root.on("pickup-collected", ({ kind } = {}) => count("pickups", kind));
  let lastCoins = 0;
  root.on("coins-changed", (coins) => {
    if (coins > lastCoins) add("coinsEarned", coins - lastCoins);
    lastCoins = coins;
  });
  root.on("damage-dealt", ({ amount } = {}) => add("damageDealt", Math.round(amount ?? 0)));
  root.on("damage-taken", ({ kind, amount } = {}) =>
    add(kind === "tower" ? "damageTakenGolem" : "damageTakenPlayer", Math.round(amount ?? 0)));
  root.on("golem-repaired", ({ amount } = {}) => add("golemRepaired", amount ?? 0));
  root.on("player-down", () => add("playerDeaths"));
  root.on("boss-defeated", () => add("bossesDefeated"));
  root.on("wave-start", (n) => {
    if (over || !(n > run().waveReached)) return;
    best("maxWaveReached", "waveReached", n);
    if (MILESTONES.includes(n)) count("milestones", String(n));
  });
  root.on("wave-end", ({ wave } = {}) => !over && best("maxWaveSurvived", "maxWaveSurvived", wave ?? 0));
  root.on("run-over", ({ reason } = {}) => {
    if (over) return;
    run().endedAt = new Date().toISOString();
    run().endReason = reason ?? null;
    over = true;
    saveStats(stats);
  });

  // time survived (game time, so pauses don't count); periodic save
  let sinceSave = 0;
  onUpdate(() => {
    if (!over && !player.frozen && dt() > 0) {
      run().timeSurvived += dt();
      total().timeSurvived += dt();
      dirty = true;
    }
    sinceSave += dt() || 1 / 60; // keep saving while the game is paused
    if (dirty && sinceSave >= SAVE_EVERY) {
      sinceSave = 0;
      dirty = false;
      saveStats(stats);
    }
  });
  addEventListener("beforeunload", () => saveStats(stats));
  saveStats(stats);

  // console / transfer helper
  window.gameStats = {
    get: () => JSON.parse(JSON.stringify(stats)),
    export: () => JSON.stringify(stats, null, 2),
    import: (json) => {
      const s = typeof json === "string" ? JSON.parse(json) : json;
      if (s?.version !== VERSION) throw new Error(`expected stats version ${VERSION}`);
      saveStats(s);
      storageLocked = true; // don't let this run's autosave overwrite the import
      return "imported - reload the page to start from these stats";
    },
    reset: () => {
      storageLocked = true;
      localStorage.removeItem(STATS_KEY);
      return "stats cleared - reload the page";
    },
  };
  return stats;
}
