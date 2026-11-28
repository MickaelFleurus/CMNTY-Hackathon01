# Assets - Survivors Starter Kit v1.0

`gfx/SurvivorsStarterKit_v1.0/` contains a complete 16x16 pixel-art pack made
by Sneznyj 3D (itch.io; commercial use OK - see `LICENSE.txt` in that folder).
Use these instead of placeholder rects once a system works. Full details in
that folder's `README.txt`; this doc is the quick index for agents.

## What's in there

| Folder | Contents |
|---|---|
| `Heroes/` | 4 heroes (Knight, Wizard, Ranger, Cleric), 16x16 - rows: Idle(4), Walk(4), Hit(2), Death(6) |
| `Enemies/` | 34 enemies, 16x16 - rows: Move(4), Hit(2), Death(6) |
| `Bosses/` | 6 bosses, 32x32 - rows: Move(4), Attack(4), Hit(2), Death(8) |
| `Weapons/Projectiles/` | 11 animated projectiles (Knife, Whip, Lightning, Magic Bolt, Orbit Orb, Fireball, ...) - horizontal strips |
| `Weapons/Icons/` | 20 upgrade icons (perfect for the level-up UI) |
| `Pickups/` | XP gems (4 tiers), coins, heart, meat, chest, magnet, bomb, clock - 4-frame strips |
| `Effects/` | hit spark, poof, explosion, level-up, heal, sparkle |
| `Tiles/` | 4 seamless 16px ground sets: Grass, Dungeon, Snow, Sand |
| `Atlas/` + `animations.json` | everything in one PNG + frame data (TexturePacker JSON-Hash) |

## Usage rules for agents

1. **Sheet layout** - character sheets are one animation per row, frames
   left-to-right. Projectiles/pickups/effects are horizontal strips.
2. **KAPLAY loading** - use `loadSpriteAtlas()` with `animations.json`, or
   `loadSprite(name, path)` + `slice`/`sprite(x,y)` for strips. Nearest-
   neighbour filtering + integer scaling (x2/x3/x4) to keep pixels crisp -
   in KAPLAY: `kaplay({ crisp: true, scale: 2 })` or `loadSprite(..., {
   sliceX, anims })`.
3. **Direction** - heroes face right, projectiles point right; flip with
   `flipX` when moving left.
4. **Frame counts & FPS** - read `animations.json` (Move 8fps, Walk 10, Idle
   6, Hit/Death 12, pickups 6, effects 12). Death animations end on an empty
   frame - despawn the object when the anim finishes.
5. **Recommended first picks** - `Hero_Knight` for the player, `Enemy_Bat`
   (simple) + `Enemy_Zombie` (basic horde) for Mickael's wave, `Pickup_XP_Blue`
   for chippe's gems, `Proj_Knife` or `Proj_Magic_Bolt` for the pistol
   stand-in, `Tiles_Grass` for the placeholder map.
6. **Known art defect, fixed copies:** in the pickup strips XP Blue/Green/Red,
   Heart and Magnet, the "bob up" frames (1-2) are drawn one pixel higher
   but their top outline row was clipped off, so the top row vanishes while
   they bob. `node scripts/fix-pickup-sprites.mjs` writes repaired copies
   next to them as `*_fixed.png` (originals untouched). **Use the
   `_fixed` files** (already done in `PICKUP_SPRITES`).
7. **Don't modify or rename files inside the pack** - it's vendored third-
   party art; if you need a variant, add your own file next to it.

## Placeholder art to replace

Things drawn with stand-in art because the pack has nothing for them yet.
**When real art exists, swap it in and remove the line here.**

| What | Placeholder now | Where to change it |
|---|---|---|
| **Plank** weapon (starter, long poke) | knife sprite (`Proj_Knife`, frame 0), recolored bright pink by a small shader (`PLANK.tint`), stretched to the plank's length (`PLANK.length`, `PLANK.thickness`) | `src/systems/plank.js` (`poke()` + the pink shader, which can go once real art exists), `src/config.js` → `PLANK` |
| **Plank** level-up card icon | `Icon_Knife` tinted the same pink | `src/systems/upgrades.js` → the `weapon-plank` entry (`icon`, `tint`) |

Owners per `docs/tasks.md`: Akram wires the hero + projectile + tile map,
Mickael the enemies, chippe the pickups/icons for the level-up UI.
