// Sound effects (gfx/Sounds/). Every sound is triggered from events / tags
// other systems already produce, so no gameplay file has to call play().
//
//   PlankAttack  each plank poke (object tagged "plank" + "fx" = one poke)
//   GunSound     each pistol bullet (tagged "bullet", weapons.js)
//   AxeLoop      LOOPS while at least one axe (tag "axe") is in the air
//   Walking      LOOPS while the player walks (player anim "walk")
//   EnemyKilled  on("killed", "enemy") - rate limited, so a bomb or a big
//                plank sweep doesn't stack dozens at once
//   CollectItem  root "pickup-collected" (xp.js, base.js) + "bonus-picked"
//                (bonus.js) - rate limited too
//   LevelUp      player "levelup" (xp.js)
//   WaveWon      root "wave-end" (a wave survived, enemies.js)
//
// Loops pause whenever the game doesn't run: level up screen
// (getTreeRoot().paused), shop (debug.timeScale 0), pause menu, player
// frozen (run over / golem dying) or down. That check runs on a browser
// interval because onUpdate stops while the tree is paused.
//
// M toggles mute (remembered in the browser). Volumes in config.js → SOUND.
// Files are imported (not string paths) so Vite bundles them in the build.
import { SOUND } from "../config.js";
import plankUrl from "../../gfx/Sounds/PlankAttack.wav";
import gunUrl from "../../gfx/Sounds/GunSound.ogg";
import axeUrl from "../../gfx/Sounds/AxeLoop.wav";
import walkUrl from "../../gfx/Sounds/Walking.ogg";
import killUrl from "../../gfx/Sounds/EnemyKilled.ogg";
import collectUrl from "../../gfx/Sounds/CollectItem.ogg";
import levelUpUrl from "../../gfx/Sounds/LevelUp.ogg";
import waveWonUrl from "../../gfx/Sounds/WaveWon.ogg";

const FILES = {
  plank: plankUrl,
  gun: gunUrl,
  axe: axeUrl,
  walk: walkUrl,
  kill: killUrl,
  collect: collectUrl,
  levelUp: levelUpUrl,
  waveWon: waveWonUrl,
};

const MUTE_KEY = "golem-necromancer-muted";

export function loadSounds() {
  for (const [name, url] of Object.entries(FILES)) loadSound(`sfx-${name}`, url);
}

export function startSounds(player) {
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    /* storage unavailable: not muted */
  }
  setVolume(muted ? 0 : SOUND.master);
  onKeyPress(SOUND.muteKey, () => {
    muted = !muted;
    setVolume(muted ? 0 : SOUND.master);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* not remembered */
    }
  });

  // one-shots; `gap` = minimum seconds between two plays of the same sound
  const last = {};
  const sfx = (name, { gap = 0, vary = 0 } = {}) => {
    const now = performance.now() / 1000;
    if (gap && now - (last[name] ?? -Infinity) < gap) return;
    last[name] = now;
    play(`sfx-${name}`, {
      volume: SOUND.volume[name] ?? 1,
      detune: vary ? rand(-vary, vary) : 0, // a little pitch variety for repeated sounds
    });
  };

  onAdd("plank", (o) => o.is("fx") && sfx("plank", { vary: 80 }));
  onAdd("bullet", () => sfx("gun", { gap: 0.04, vary: 60 }));
  on("killed", "enemy", () => sfx("kill", { gap: SOUND.killGap, vary: 120 }));
  getTreeRoot().on("pickup-collected", () => sfx("collect", { gap: SOUND.collectGap, vary: 100 }));
  getTreeRoot().on("bonus-picked", () => sfx("collect"));
  player.on("levelup", () => sfx("levelUp"));
  getTreeRoot().on("wave-end", () => sfx("waveWon"));

  // loops: started once, paused / resumed by their condition
  const loop = (name) => {
    const h = play(`sfx-${name}`, { loop: true, volume: SOUND.volume[name] ?? 1 });
    h.paused = true;
    return h;
  };
  const walk = loop("walk");
  const axe = loop("axe");

  const running = () =>
    !getTreeRoot().paused && debug.timeScale > 0 && !player.frozen && !player.down;
  const updateLoops = () => {
    const go = running();
    const walking = go && player.curAnim?.() === "walk";
    const axes = go && get("axe").length > 0;
    if (walk.paused === walking) walk.paused = !walking;
    if (axe.paused === axes) axe.paused = !axes;
  };
  setInterval(updateLoops, 50); // runs even while the tree is paused
}
