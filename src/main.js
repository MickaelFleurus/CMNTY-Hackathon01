import kaplay from "kaplay";
import { loadEnemySprites, startEnemyDirector } from "./systems/enemies.js";

kaplay({
  background: [26, 26, 38],
  width: 1280,
  height: 720,
  crisp: true,
  // Collision broadphase cell size (default 64). Enemies are ~24px and pack
  // densely around the player; 32px cells cut the pair checks roughly in half
  // (~38 → 60 fps at 300 enemies).
  hashGridSize: 32,
});

// TODO: replace with real sprites — temporary colored squares for now
const player = add([
  rect(24, 24),
  color(125, 255, 125),
  pos(center()),
  area(),
  body(),
  "player",
]);

loadEnemySprites();
const enemyDirector = startEnemyDirector();

// TEMP until the cycle director (portal → shop → next wave) exists:
// start wave 1, and start the next wave a few seconds after each one ends.
const TEMP_WAVE_GAP = 3; // s
enemyDirector.startWave(1);
getTreeRoot().on("wave-end", ({ wave, reason, kills }) => {
  console.log(`wave ${wave} ended (${reason}), ${kills} kills`);
  wait(TEMP_WAVE_GAP, () => {
    enemyDirector.clear();
    enemyDirector.startWave(wave + 1);
  });
});

// TEMP debug until weapons.js lands: click an enemy to hurt it, log drops.
onMousePress(() => {
  const m = toWorld(mousePos());
  for (const e of get("enemy")) if (e.pos.dist(m) < 16) e.hurt(1);
});
// TEMP debug: B fires the external "bat-swarm" spawn trigger.
onKeyPress("b", () => getTreeRoot().trigger("enemy-trigger", "bat-swarm"));
on("drop", "enemy", (_, drop) => console.log("drop", drop.kind, drop.value));

let speed = 300;
onKeyDown("left", () => player.move(-speed, 0));
onKeyDown("right", () => player.move(speed, 0));
onKeyDown("up", () => player.move(0, -speed));
onKeyDown("down", () => player.move(0, speed));

add([
  text("Vampire Survivors — KAPLAY scaffolding\nWASD / arrows to move", {
    size: 24,
  }),
  pos(24, 24),
]);

const debugLabel = add([text("", { size: 18 }), pos(24, 90), fixed()]);
debugLabel.onUpdate(() => {
  const types = enemyDirector.activeTypes().map((t) => `${t} ${enemyDirector.alive(t)}`);
  const d = enemyDirector;
  const status = d.inWave()
    ? `wave ${d.wave()} · ${Math.ceil(d.timeLeft())}s left · ${d.remaining()} remaining`
    : `wave ${d.wave()} over — next wave soon`;
  debugLabel.text = `${status}\nenemy lvl ${d.level()} · alive ${d.alive()} · ${types.join(" · ")}`;
});
