# Task Split — MVP Wave 1

Three-way split of the MVP scope (see [`game-design.md`](game-design.md) for
the full concept). One branch per task — cut it with
`scripts/feature.sh start <slug>`. Claim rows by editing this file in a tiny
PR.

| # | Owner | Branch | Task | Deliverables | Out of scope |
|---|-------|--------|------|--------------|--------------|
| 1 | **Akram** | `akram/player-movement` | **Player movement + map + auto-attack** — WASD/arrows top-down movement; on-screen virtual joystick when the viewport is too narrow (mobile); gray placeholder zone as the map (real map art later, once movement logic is proven); auto-attack: laser pistol firing every ~1s at nearest enemy in range (whip-style arc later) | `src/systems/player.js` (movement + joystick), `src/config.js` (speed, fire rate), gray placeholder map in the game scene, `src/systems/weapons.js` with the pistol | enemy AI, XP, level-up, art/sprites |
| 2 | **Mickael** | `mickael/enemies` | **Enemies + spawn director** — one enemy type that chases the player, HP + death, continuous spawning from screen edges with a ramping rate over time | `src/systems/enemies.js` (enemy factory, chase, spawn director), `src/config.js` (spawn rate, HP, speed) | player movement, weapons, damage-from-weapons logic (cooperate with Akram on the `onCollide` contract) |
| 3 | **chippe** | `chippe/xp-levelup` | **XP + level-up + HUD** — enemies drop XP gems on death, walk-over pickup, level-up screen with pick-1-of-3 upgrades, HUD (survival timer, level, kill count) | `src/systems/xp.js`, `src/systems/upgrades.js`, `src/systems/hud.js`, `src/config.js` (xp curve) | enemy spawning, weapons, stat effects wiring (agrees on upgrade *data* shape with the others) |

## Shared contract (agree before merging)

- Tags: `"player"`, `"enemy"`, `"projectile"`, `"xp-gem"` — use these exact
  KAPLAY tags so systems interoperate without importing each other.
- Damage flows through `onCollide("projectile", "enemy", ...)` in
  `weapons.js`; enemies expose `hp()` and die → emit `"xp-gem"` spawn point
  (chippe listens, Mickael owns death drop position).
- All tuning numbers live in `src/config.js`; expect small conflicts there,
  rebase before PR.

## Sequencing

These three are independent enough to run in parallel — the only contact
points are the tags/config contract above. Merge order preference:
movement → enemies → weapons → xp (each unblocks testing of the next), but
don't block: build against the contract and PR independently.
