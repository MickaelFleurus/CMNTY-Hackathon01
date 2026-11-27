import kaplay from "kaplay";
import { loadEnemySprites, startEnemyDirector } from "./systems/enemies.js";

kaplay({
  background: [26, 26, 38],
  width: 1280,
  height: 720,
  crisp: true,
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

// TEMP debug until weapons.js lands: click an enemy to hurt it, log drops.
onClick("enemy", (e) => e.hurt(1));
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
  debugLabel.text = `enemy lvl ${enemyDirector.level()} · alive ${get("enemy").length}`;
});
