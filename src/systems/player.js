// Player entity: sprite, keyboard movement, and an on-screen virtual joystick
// that appears only when the viewport is too narrow for keyboard comfort
// (mobile / small window). Joystick input and keyboard input are combined.
import { CFG } from "../config.js";

export function makePlayer() {
  const player = add([
    sprite("hero-knight", { anim: "idle" }),
    scale(CFG.player.scale),
    pos(center()),
    area(),
    anchor("center"),
    health(CFG.player.maxHp),
    "player",
  ]);

  const speed = CFG.player.speed;
  let joystickVec = vec2(0); // set by the joystick when active

  onUpdate(() => {
    let dir = vec2(0);
    if (isKeyDown("left") || isKeyDown("a")) dir.x -= 1;
    if (isKeyDown("right") || isKeyDown("d")) dir.x += 1;
    if (isKeyDown("up") || isKeyDown("w")) dir.y -= 1;
    if (isKeyDown("down") || isKeyDown("s")) dir.y += 1;
    dir = dir.add(joystickVec).unit();
    player.move(dir.scale(speed));

    // walk/idle animation + facing
    const moving = dir.len() > 0.01;
    if (moving) {
      if (player.curAnim() !== "walk") player.play("walk");
      player.flipX = dir.x < 0;
    } else if (player.curAnim() !== "idle") {
      player.play("idle");
    }
  });

  // --- virtual joystick (touch) ---
  // Base stays where you touch; knob follows the finger; vector feeds movement.
  const joy = add([
    pos(0, 0),
    z(100),
    opacity(0),
    "joystick-ui",
  ]);
  const base = joy.add([
    circle(CFG.joystick.baseRadius),
    color(255, 255, 255),
    opacity(0),
  ]);
  const knob = joy.add([
    circle(CFG.joystick.knobRadius),
    color(255, 255, 255),
    opacity(0),
  ]);

  let touchId = null;

  function showJoy(p) {
    joy.pos = p;
    base.opacity = 0.35;
    knob.opacity = 0.6;
    knob.pos = vec2(0);
  }
  function hideJoy() {
    base.opacity = 0;
    knob.opacity = 0;
    joystickVec = vec2(0);
    touchId = null;
  }

  // KAPLAY touch events (also fire for mouse on most builds)
  onTouchStart((p, id) => {
    if (touchId !== null) return;
    touchId = id;
    showJoy(p);
  });
  onTouchMove((p, id) => {
    if (id !== touchId) return;
    const delta = p.sub(joy.pos);
    const max = CFG.joystick.maxDrag;
    const clamped = delta.len() > max ? delta.unit().scale(max) : delta;
    knob.pos = clamped;
    joystickVec = clamped.unit().scale(clamped.len() / max);
  });
  onTouchEnd((_, id) => {
    if (id === touchId) hideJoy();
  });

  return player;
}
