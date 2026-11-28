# Task Split - MVP Wave 1

Three-way split of the MVP scope (see [`game-design.md`](game-design.md) for
the original concept; the design pivoted - see
[`game-design-v2.md`](game-design-v2.md) - and Wave 2 tasks will be split
separately). One branch per task - cut it with
`scripts/feature.sh start <slug>`. Claim rows by editing this file in a tiny
PR.

| # | Owner | Branch | Task | Deliverables | Out of scope |
|---|-------|--------|------|--------------|--------------|
| 1 | **Akram** | `akram/player-movement` | **Player movement + map + auto-attack** - WASD/arrows top-down movement; on-screen virtual joystick when the viewport is too narrow (mobile); gray placeholder zone as the map (real map art later, once movement logic is proven); auto-attack: laser pistol firing every ~1s at nearest enemy in range (whip-style arc later) | `src/systems/player.js` (movement + joystick), `src/config.js` (speed, fire rate), gray placeholder map in the game scene, `src/systems/weapons.js` with the pistol | enemy AI, XP, level-up, art/sprites |
| 2 | **Mickael** | `mickael/enemies` | **Enemies + spawn director** - one enemy type that chases the player, HP + death, continuous spawning from screen edges with a ramping rate over time | `src/systems/enemies.js` (enemy factory, chase, spawn director), `src/config.js` (spawn rate, HP, speed) | player movement, weapons, damage-from-weapons logic (cooperate with Akram on the projectile hit contract below) |
| 3 | **chippe** | `chippe/xp-levelup` | **XP + level-up + HUD** - enemies drop XP gems on death, walk-over pickup, level-up screen with pick-1-of-3 upgrades, HUD (survival timer, level, kill count) | `src/systems/xp.js`, `src/systems/upgrades.js`, `src/systems/hud.js`, `src/config.js` (xp curve) | enemy spawning, weapons, stat effects wiring (agrees on upgrade *data* shape with the others) |

## Shared contract (agree before merging)

- Tags: `"player"`, `"enemy"`, `"projectile"`, `"xp-gem"` - use these exact
  KAPLAY tags so systems interoperate without importing each other.
- **Enemies are not in KAPLAY's collision system** (no `area()`; a dense
  horde made KAPLAY's broadphase collapse to ~3 fps). So
  `onCollide*(…, "enemy")` never fires. `enemies.js` does its own grid hit
  detection instead:
  - **Weapons:** give projectiles the `"projectile"` tag, `anchor("center")`
    and a numeric `damage` prop. Optional: `pierce` (enemies it can hit
    before being destroyed, default 1) and `hitRadius` (px; default = half
    its `area()` bbox). `enemies.js` calls `enemy.hurt(damage)`, destroys the
    projectile when `pierce` runs out (each enemy hit at most once per
    projectile), and fires `on("hit", "projectile", (proj, enemy) => …)`.
    Targeting can keep looping `get("enemy")` (`pos` is the enemy center).
  - **Player:** enemies touching the `"player"` call `player.hurt(n)` (needs
    `health()`; the player keeps its own `area()`).
- **Waves** (for the cycle director: field wave → portal → shop → next wave).
  Nothing spawns until a wave starts. Root events, no import needed:
  - `getTreeRoot().trigger("enemy-start-wave", n)` starts wave `n` (omit
    `n` for the next one). Enemy level = `1 + 2*(n-1)`. There is **no
    per-wave enemy count**: each unlocked type (`ENEMY_TYPES` in
    `src/config.js`) sends groups at its spawn interval until the wave timer
    runs out. The interval shrinks during a wave and is multiplied by
    `ENEMY_WAVES.rate` (`perWave^(n-1)`, floor `minMult`), so every wave
    spawns faster than the last.
  - `getTreeRoot().trigger("enemy-clear")` despawns every enemy (no drops),
    e.g. when the player ports home.
  - `getTreeRoot().on("wave-start", (n) => …)` and
    `getTreeRoot().on("wave-end", ({ wave, reason, kills }) => …)`, where
    `reason` is `"cleared"`: the wave was survived (timer ran out, or the
    boss died on a boss wave). Killing everything does not end a wave
    early. Any leftovers die on the spot
    when the wave ends: death animation, **no drops, no `"killed"` event**
    (`ENEMY_WAVES.killOnEnd`).
  - `src/main.js` currently chains waves itself (TEMP, 3 s gap) until the
    cycle director takes over.
- Kills/drops: `on("killed", "enemy", (e, { pos, level, tier, type }) => …)`
  and `on("drop", "enemy", (e, { kind, pos, level, tier, type, value }) => …)`
  (chippe listens, Mickael owns death drop position).
- All tuning numbers live in `src/config.js`; expect small conflicts there,
  rebase before PR.
- **Contract changes:** when you change anything in this section, add a
  matching check to `scripts/check-contracts.mjs` (run by
  `scripts/feature.sh finish`) and comment on every open PR it affects.

## Sequencing

These three are independent enough to run in parallel - the only contact
points are the tags/config contract above. Merge order preference:
movement → enemies → weapons → xp (each unblocks testing of the next), but
don't block: build against the contract and PR independently.
