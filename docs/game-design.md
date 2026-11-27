# Game Design — Top-Down Vampire-Survivors-Style

**Working title:** TBD · **Engine:** KAPLAY (web, JS) · **Status:** baseline

> **Note:** the design pivoted to a survivors × tower-defense hybrid — see
> [`game-design-v2.md`](game-design-v2.md) for the current vision. This file
> remains the record of the original concept and the baseline systems
> (movement, spawning, auto-attack) that v2 builds on.

## Elevator pitch

Arena survival: you alone in a dark space, endless hordes close in from every
side, and your weapons fire automatically. Survive as long as possible, level
up, pick upgrades, and try to last longer each run. No aiming — movement IS
the gameplay.

## Core loop

1. **Move** (WASD / arrows) through a large scrolling arena.
2. **Enemies spawn** continuously from screen edges, walking toward you.
3. **Auto-attacks**: your equipped weapons fire on their own timers at nearby
   enemies (starting weapon: a simple projectile in the facing direction).
4. **Enemies die** → drop XP gems → you collect them by walking close.
5. **Level up** → choose 1 of 3 random upgrades (new weapon, weapon level-up,
   stat boost).
6. **Difficulty ramps**: spawn rate, enemy speed, and HP increase over time.
7. **Death** → run summary (time survived, kills, level) → restart.

## MVP scope (hackathon)

Cut everything not essential. Must-haves, in rough build order:

1. Player movement + camera follow on an (effectively infinite) map.
2. One enemy type (chases player), continuous edge spawning with ramping rate.
3. One auto-weapon (projectile), damage + enemy HP/death.
4. XP gems + pickup, level-up UI (pick 1 of 3 upgrades).
5. 3–4 upgrades: max HP, move speed, weapon level, extra weapon.
6. Death screen + restart, simple timer HUD.

Nice-to-have later (do NOT start these until MVP works end-to-end):
more enemy types (tanky, fast swarmers, ranged), boss every N minutes,
map tiles/decoration, sound/music, chest pickups, meta-progression.

## Feel targets

- Runs last ~5–15 minutes.
- Screen should feel busy but readable: player always visible, enemy density
  high but not a solid blob.
- Snappy: instant response on input, no menus longer than one screen.
