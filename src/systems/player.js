// Player entity: sprite, keyboard movement, and an on-screen virtual joystick
// that appears only when the viewport is too narrow for keyboard comfort
// (mobile / small window). Joystick input and keyboard input are combined.
import { CFG, SHOP, RESPAWN } from "../config.js";

export function makePlayer() {
  const player = add([
    sprite("hero-ghoul", { anim: "idle" }),
    scale(CFG.player.scale),
    // start just below the golem (SHOP.home is its feet), not inside it
    pos(SHOP.home.x, SHOP.home.y + RESPAWN.belowBase),
    // Keep the gameplay hitbox at the old 32px hero size despite the larger art
    // (64px sprite): the bigger silhouette must not make the player easier to hit.
    area({ shape: new Rect(vec2(-16, -16), 32, 32) }),
    anchor("center"),
    z(CFG.player.z), // always drawn above the world (e.g. walking behind the base)
    health(CFG.player.maxHp),
    "player",
  ]);

  const speed = CFG.player.speed;
  player.attackPoseFor = 0;
  let joystickVec = vec2(0); // set by the joystick when active

  // Opposite keys held together: the most recently pressed one wins (instead
  // of cancelling out, which left the player walking vertically while the
  // sprite still faced the old way).
  const LEFT = ["left", "a"];
  const RIGHT = ["right", "d"];
  const UP = ["up", "w"];
  const DOWN = ["down", "s"];
  let lastX = 0;
  let lastY = 0;
  onKeyPress(LEFT, () => (lastX = -1));
  onKeyPress(RIGHT, () => (lastX = 1));
  onKeyPress(UP, () => (lastY = -1));
  onKeyPress(DOWN, () => (lastY = 1));

  const held = (keys) => keys.some((k) => isKeyDown(k));
  const axis = (neg, pos, last) => {
    const n = held(neg);
    const p = held(pos);
    if (n && p) return last; // both held: latest press wins
    return (p ? 1 : 0) - (n ? 1 : 0);
  };

  onUpdate(() => {
    // dead, waiting to respawn (respawn.js) / run over (runstate.js)
    if (player.down || player.frozen) return;
    // The scythe sets attackPoseFor when it strikes; keep the strike pose
    // instead of flipping straight back to idle/walk mid-swing.
    if (player.attackPoseFor > 0) {
      player.attackPoseFor = Math.max(0, player.attackPoseFor - dt());
      if (player.curAnim() !== "attack") player.play("attack");
    }
    let dir = vec2(axis(LEFT, RIGHT, lastX), axis(UP, DOWN, lastY));
    dir = dir.add(joystickVec).unit();
    // stats.speedMult comes from the Move Speed level up card (upgrade-effects.js)
    player.move(dir.scale(speed * (player.stats?.speedMult ?? 1)));

    // walk/idle animation + facing
    const moving = dir.len() > 0.01;
    if (player.attackPoseFor > 0) {
      // attack pose owns the sprite until the swing finishes
    } else if (moving) {
      if (player.curAnim() !== "walk") player.play("walk");
      // keep the current facing when moving purely vertically
      if (Math.abs(dir.x) > 0.01) player.flipX = dir.x < 0;
    } else if (player.curAnim() !== "idle") {
      player.play("idle");
    }
  });

  // --- virtual joystick (touch) ---
  // Base stays where you touch; knob follows the finger; vector feeds movement.
  const joy = add([
    pos(0, 0),
    fixed(), // touch positions are screen coords: draw it where the finger is
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

  // KAPLAY touch events (also fire for mouse on most builds). The 2nd argument
  // is the browser's Touch object - a NEW object on every event - so the
  // finger is matched by its `identifier`, not by the object (comparing the
  // objects never matched, and the joystick never moved the player).
  const fingerOf = (t) => t?.identifier ?? t;
  onTouchStart((p, t) => {
    if (touchId !== null) return;
    touchId = fingerOf(t);
    showJoy(p);
  });
  onTouchMove((p, t) => {
    if (fingerOf(t) !== touchId) return;
    const delta = p.sub(joy.pos);
    const max = CFG.joystick.maxDrag;
    const clamped = delta.len() > max ? delta.unit().scale(max) : delta;
    knob.pos = clamped;
    joystickVec = clamped.unit().scale(clamped.len() / max);
  });
  onTouchEnd((_, t) => {
    if (fingerOf(t) === touchId) hideJoy();
  });

  return player;
}

/** Teleport the player (used by the portal → shop flow). */
export function teleportPlayer(p, to) {
  p.pos = vec2(to.x, to.y);
}
