import kaplay from "kaplay";

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

// temporary placeholder enemy
add([
  rect(24, 24),
  color(255, 75, 75),
  pos(center().add(200, 0)),
  "enemy",
]);

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
