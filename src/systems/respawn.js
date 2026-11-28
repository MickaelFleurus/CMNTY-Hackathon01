// Player death → respawn (docs/game-design-v2.md → "Lose condition + player
// respawn"). Once the golem is awake, player death is NOT game over: the
// player is out for a while, then respawns at the base with full HP. The
// tower (the base) is alone in the meantime.
//
// Wave 1 exception ("The golem awakening flow"): until the golem wakes up
// ("golem-awake", tower.js) the player is the run's only life. Dying then
// ends the run: "run-over" { reason: "player-died" }, no respawn.
//
// The respawn time is a ladder (RESPAWN.steps): every death uses the current
// step and then moves one step up; every wave cleared ("wave-end" with
// reason "cleared") or boss defeated ("boss-defeated") moves one step down.
//
// Contract (no imports between systems):
//   - player.down = true while dead. Movement (player.js), weapons
//     (weapons.js), regen and enemies (targeting + contact) skip a downed
//     player. The player is hidden and parked at the base so the camera
//     shows the tower.
//   - player.respawnIn     seconds until respawn (0 when alive)
//   - player.respawnStep   current ladder step (index into RESPAWN.steps)
//   - player.nextRespawn   seconds the NEXT death will cost
//   - getTreeRoot().on("player-down", ({ respawnIn, step }) => …)
//   - getTreeRoot().on("player-respawn", () => …)
//   - getTreeRoot().on("respawn-step", ({ step, nextRespawn }) => …)  ladder moved
//   - player.canRespawn    false until "golem-awake" (a death now = run over)
//   - before "golem-awake": getTreeRoot().trigger("run-over", { reason: "player-died" })
import { RESPAWN, CFG } from "../config.js";

export function startRespawn(player) {
  const steps = RESPAWN.steps;
  let step = 0;
  let over = false; // run over: no more respawns
  let golemAwake = false; // wave 1: no respawn, death = run over

  const publish = () => {
    player.respawnStep = step;
    player.nextRespawn = steps[step];
    getTreeRoot().trigger("respawn-step", { step, nextRespawn: steps[step] });
  };
  const stepDown = () => {
    if (step > 0) {
      step -= 1;
      publish();
    }
  };

  player.down = false;
  player.respawnIn = 0;
  player.canRespawn = false;
  publish();

  getTreeRoot().on("golem-awake", () => {
    golemAwake = true;
    player.canRespawn = true;
  });

  player.onDeath(() => {
    if (player.down || over) return;
    if (!golemAwake) {
      // the statue can't bring the player back: this is the run's end
      over = true;
      getTreeRoot().trigger("run-over", { reason: "player-died" });
      return;
    }
    const wait = steps[step];
    step = Math.min(step + 1, steps.length - 1);
    publish();

    player.down = true;
    player.respawnIn = wait;
    player.hidden = true;
    player.shield = 0;
    parkAtBase(player);
    getTreeRoot().trigger("player-down", { respawnIn: wait, step: player.respawnStep });
  });

  onUpdate(() => {
    if (!player.down || over) return;
    parkAtBase(player); // stay put (camera watches the base)
    player.respawnIn = Math.max(0, player.respawnIn - dt());
    if (player.respawnIn > 0) return;

    player.down = false;
    player.hidden = false;
    player.setHP(player.maxHP?.() ?? CFG.player.maxHp);
    getTreeRoot().trigger("player-respawn");
  });

  getTreeRoot().on("wave-end", (e) => {
    if (e?.reason === "cleared") stepDown();
  });
  getTreeRoot().on("boss-defeated", stepDown);
  getTreeRoot().on("run-over", () => (over = true));
}

/** Respawn point: just below the base (its anchor is "bot"). */
function parkAtBase(player) {
  const base = get("base")[0];
  if (base) player.pos = base.pos.add(0, 40);
}
