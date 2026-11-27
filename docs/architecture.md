# Architecture

**Engine:** KAPLAY (`kaplay` npm pkg, v3001.x) · **Bundler/dev server:** Vite ·
**Language:** JavaScript ES modules (no TS unless team votes for it)

## Directory layout (target)

```
index.html            Vite entry; loads src/main.js
src/
  main.js             boots kaplay(), sets global config, loads assets, starts title/game scene
  scenes/
    game.js           the main gameplay scene (spawn/despawn world entities)
  systems/            pure gameplay logic modules, each owns one concern:
    player.js         player entity factory + movement comp wiring
    enemies.js        enemy factories, spawning director, chase behavior
    weapons.js        weapon defs (fire timers, projectiles, damage)
    xp.js             gems, pickup, leveling curve
    upgrades.js       upgrade pool, level-up choice UI data
    hud.js            timers, HP/level/kills display
  config.js           tuning constants (speeds, spawn rates, xp curve) in ONE place
assets/               sprites, audio (add as needed; keep tiny for now)
docs/                 design + agent docs
```

A system module exports plain functions (e.g. `spawnEnemy(pos)`, `makeWeapon(player, def)`)
that use the global `kaplay()` context — KAPLAY's API is global-by-default, so
systems don't need to import engine internals. Keep system files independent of
each other where possible; communication happens through KAPLAY component
tags/objects (e.g. `"enemy"`, `"projectile"`, `"xp-gem"` tags) and events
(`on("hurt", ...)`, custom `on("xp", ...)`), NOT by direct imports between systems.

## KAPLAY concepts to use

- **Game objects + components**: `add([sprite/rect, pos, area, body, health(), "enemy"])`
- **Tags** for grouping & collision groups (`"enemy"`, `"player"`, `"gem"`)
- `onCollide("projectile", "enemy", ...)` for damage
- **Scenes** (`scene("game", ...)` / `go("game")`) for game vs. level-up vs. death
  (or use paused overlays for level-up — team's choice, document it here once decided)
- **Camera**: `camScale`, `addLevel` or manual world coords with camera follow

## Decisions made

- Vite over plain script tags (ES modules, fast reload).
- Tuning constants centralized in `src/config.js` — no magic numbers in systems.
- JS not TS (hackathon speed; revisit if the codebase grows).

## Not yet decided

- Scene-per-screen vs. paused overlay for level-up UI.
- Art approach (placeholder rects → free sprite pack → hand-drawn).
