// Player invulnerability after a hit ("i-frames").
//
// Contract:
//   - player.invulnFor = seconds left of invulnerability (0 = can be hit).
//     enemies.js sets it to CFG.player.invulnTime on every enemy hit and
//     ignores contact while it's > 0. Anything else that damages the player
//     should check it too.
//   - On "player-respawn" the player gets CFG.player.respawnInvulnTime.
//   - While invulnerable the player blinks (opacity), never with `hidden`,
//     which respawn.js uses for "dead".
import { CFG } from "../config.js";

export function startInvuln(player) {
  player.invulnFor = 0;
  if (!player.is("opacity")) player.use(opacity(1));

  getTreeRoot().on("player-respawn", () => {
    player.invulnFor = CFG.player.respawnInvulnTime ?? 0;
  });

  onUpdate(() => {
    if (player.invulnFor > 0) player.invulnFor = Math.max(0, player.invulnFor - dt());
    if (player.invulnFor > 0 && !player.down) {
      const on = Math.floor(time() * (CFG.player.invulnBlinkHz ?? 10) * 2) % 2 === 0;
      player.opacity = on ? 1 : 0.3;
    } else {
      player.opacity = 1;
    }
  });
}
