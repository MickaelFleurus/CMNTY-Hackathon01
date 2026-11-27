// Floating damage numbers (docs/game-design-v2.md → "Damage numbers").
//
//   - white over enemies when a projectile/melee hit lands (dealt)
//   - red over the player, amber over the tower (taken)
//   - rise + fade, short-lived, tagged "fx" so runstate clears them when
//     the run is over; capped per frame so hordes don't spawn 100 texts.
//
// Contract (no imports between systems):
//   - listens to root events: "damage-dealt" { pos, amount }, and root
//     events fired here: nothing. Producers:
//     * enemies.js fires "damage-dealt" for projectile hits
//     * enemies.js fires "damage-taken" { kind: "player"|"tower", pos,
//       amount } for contact damage on the player / tower
//   - root events only — no system imports another.
import { DAMAGE_NUMBERS } from "../config.js";

const COLORS = {
  dealt: [255, 255, 255],
  player: [255, 90, 90],
  tower: [255, 190, 80],
};

let spawnedThisFrame = 0;
let lastReset = 0;

export function startDamageNumbers() {
  getTreeRoot().on("damage-dealt", ({ pos: at, amount } = {}) => spawn(at, amount, "dealt"));
  getTreeRoot().on("damage-taken", ({ kind, pos: at, amount } = {}) => {
    if (kind === "tower") spawn(at, amount, "tower");
    else spawn(at, amount, "player");
  });

  // reset the per-frame cap every render tick
  onUpdate(() => {
    if (time() - lastReset >= 1 / 120) {
      spawnedThisFrame = 0;
      lastReset = time();
    }
  });
}

function spawn(at, amount, style) {
  if (!at || typeof amount !== "number" || amount <= 0) return;
  if (spawnedThisFrame >= DAMAGE_NUMBERS.maxPerFrame) return;
  spawnedThisFrame += 1;

  const [r, g, b] = COLORS[style] ?? COLORS.dealt;
  add([
    text(String(Math.round(amount)), { size: DAMAGE_NUMBERS.size }),
    pos(at.x + (rand(-1, 1) * DAMAGE_NUMBERS.jitter), at.y - DAMAGE_NUMBERS.lift),
    anchor("center"),
    color(r, g, b),
    opacity(1),
    z(60),
    move(UP, DAMAGE_NUMBERS.riseSpeed),
    lifespan(DAMAGE_NUMBERS.lifetime, { fade: DAMAGE_NUMBERS.fade }),
    "fx",
    "damage-number",
  ]);
}
