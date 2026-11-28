// Sound effects (gfx/Sounds/). Every sound is triggered from events / tags
// other systems already produce, so no gameplay file has to call play().
//
//   PlankAttack  each plank poke (object tagged "plank" + "fx" = one poke)
//   GunSound     each pistol bullet (tagged "bullet", weapons.js)
//   AxeLoop      while at least one axe (tag "axe") is in the air, its whoosh
//                replays every SOUND.axeEvery s (the file is a ~0.25 s whoosh
//                + silence, so a plain loop only whooshed once a second)
//   Walking      one footstep per SOUND.stride px the player actually walks,
//                so the step rhythm follows the walking speed (the file is a
//                single step; teleports don't count)
//   EnemyKilled  on("killed", "enemy") - rate limited, so a bomb or a big
//                plank sweep doesn't stack dozens at once
//   CollectItem  root "pickup-collected" (xp.js, base.js) + "bonus-picked"
//                (bonus.js) - rate limited too
//   LevelUp      player "levelup" (xp.js)
//   WaveWon      root "wave-end" (a wave survived, enemies.js)
//   GameOver     root "run-over" (the run is lost; the axe loop stops)
//   LoopMusic    background music, looped from the start of the run, kept
//                quiet (SOUND.volume.music); fades out on "run-over" so the
//                game over sound stands out
//
// Mix: master x SOUND.volume[name] - attacks and pickups very low, rare cues
// (level up, wave won) loud. See SOUND in config.js.
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
import gameOverUrl from "../../gfx/Sounds/GameOver.ogg";
import musicUrl from "../../gfx/Sounds/LoopMusic.mp3";

const FILES = {
  plank: plankUrl,
  gun: gunUrl,
  axe: axeUrl,
  step: walkUrl,
  kill: killUrl,
  collect: collectUrl,
  levelUp: levelUpUrl,
  waveWon: waveWonUrl,
  gameOver: gameOverUrl,
  music: musicUrl,
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
  const sfx = (name, { gap = 0, vary = 0, detune = 0 } = {}) => {
    const now = performance.now() / 1000;
    if (gap && now - (last[name] ?? -Infinity) < gap) return;
    last[name] = now;
    play(`sfx-${name}`, {
      volume: SOUND.volume[name] ?? 1,
      detune: detune + (vary ? rand(-vary, vary) : 0), // a little pitch variety for repeated sounds
    });
  };

  // Footsteps: one per stride of distance actually walked. onUpdate stops
  // while the game is paused, so steps stop too.
  let walked = 0;
  let lastPos = player.pos.clone();
  let foot = 0; // alternate left / right foot (slightly different pitch)
  onUpdate(() => {
    const moved = player.pos.dist(lastPos);
    lastPos = player.pos.clone();
    const walking = player.curAnim?.() === "walk" && !player.frozen && !player.down;
    // big jumps are teleports (portal, respawn, recall), not steps
    if (!walking || moved > SOUND.stride) {
      walked = Math.min(walked, SOUND.stride * 0.5); // first step comes quickly
      return;
    }
    walked += moved;
    if (walked >= SOUND.stride) {
      walked -= SOUND.stride;
      foot = 1 - foot;
      sfx("step", { detune: foot ? 60 : -60, vary: 40 });
    }
  });

  onAdd("plank", (o) => o.is("fx") && sfx("plank", { vary: 80 }));
  onAdd("bullet", () => sfx("gun", { gap: 0.04, vary: 60 }));
  on("killed", "enemy", () => sfx("kill", { gap: SOUND.killGap, vary: 120 }));
  getTreeRoot().on("pickup-collected", () => sfx("collect", { gap: SOUND.collectGap, vary: 100 }));
  getTreeRoot().on("bonus-picked", () => sfx("collect"));
  player.on("levelup", () => sfx("levelUp"));
  getTreeRoot().on("wave-end", () => sfx("waveWon"));
  // Background music: one looping handle for the whole run, never paused
  // (KAPLAY 3001 resumes a paused loop at a wrong offset), so it keeps
  // playing on the level up / shop screens. Faded out when the run is lost.
  const music = play("sfx-music", { loop: true, volume: SOUND.volume.music });

  let over = false;
  getTreeRoot().on("run-over", () => {
    over = true;
    sfx("gameOver");
    const from = music.volume;
    const t0 = performance.now();
    const fade = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 1000 / SOUND.musicFadeOut);
      music.volume = from * (1 - k);
      if (k >= 1) {
        clearInterval(fade);
        music.stop();
      }
    }, 30);
  });

  // Axe whoosh: replayed every SOUND.axeEvery s while axes fly, as one-shots
  // (no looping handle: KAPLAY 3001 resumes a paused loop at a wrong offset,
  // often silent). Stops as soon as no axe is in the air or the game stops.
  const running = () =>
    !over && !getTreeRoot().paused && debug.timeScale > 0 && !player.frozen && !player.down;
  const updateLoops = () => {
    if (running() && get("axe").length > 0) sfx("axe", { gap: SOUND.axeEvery, vary: 50 });
  };
  setInterval(updateLoops, 25); // runs even while the tree is paused
}
