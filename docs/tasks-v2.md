# Task Split — Wave 2 (v2 redesign: survivors × tower-defense)

Split of the v2 scope (see [`game-design-v2.md`](game-design-v2.md)). Same
rules as wave 1 (see [`tasks.md`](tasks.md)): one branch per task via
`scripts/feature.sh start <slug>`, tag contract still applies, tuning
numbers go in `src/config.js`, PRs don't merge themselves.

Wave 1 leftovers first: chippe's XP/level-up/HUD system (task 1) is
**built** (`xp.js`, `upgrades.js`, `hud.js`). The level up screen pauses the
game and only opens during field waves: never while the player is down or
frozen, or while the shop is open (it waits for `shop-close`). The HUD shows
wave, survival time, level, HP/shield/respawn, base HP, coins and kills.

| # | Owner | Branch | Task | Deliverables | Out of scope |
|---|-------|--------|------|--------------|--------------|
| 1 | **chippe** | `chippe/xp-levelup` (carry over from wave 1) | **XP gems + level-up + HUD** — enemies drop gems (listen to `on("drop","enemy",…)`), walk-over pickup, level-up pick-1-of-3 during field waves, HUD (wave number, HP, coins, level) | `src/systems/xp.js`, `src/systems/upgrades.js`, `src/systems/hud.js`, `src/config.js` (xp curve, coin values) | shop logic, portal, base entity |
| 2 | **Akram** | `akram/base-shop` | **Base entity + shop scene + coins** — a base at a fixed home position on the map, portal spawns when a wave ends and teleports the player home, shop UI with the 2×2 grid (passive-defense / passive-offense / active-defense / active-offense), one pick per cycle, coins as currency. Shop **picks are data**: each option declares its effect type + parameters; applying the effect is the other systems' job | `src/systems/base.js`, `src/systems/shop.js`, `src/systems/portal.js`, `src/config.js` (SHOP section: option defs, coin economy) | aura effects, regen, tower behavior, enemy waves (agree the pick-data shape with Mickael/chippe first — see contract below) |
| 3 | **Mickael** | `mickael/cycle-director` | **Cycle director + aura/regen/tower effects** — wraps the wave director into the v2 cycle (wave → clear → portal event → shop → next wave, harder each cycle); implements the three effect systems the shop picks select: passive auras (growing-radius buff zones read from the player's pick), active-defense HP-regen tick (in-range heal every X s), active-offense tethered tower (targetable by enemies — needs his own grid-hit path extended to `hp` on the tower; tower death = run over) | `src/systems/cycle.js`, `src/systems/auras.js`, `src/systems/regen.js`, `src/systems/tower.js`, `src/config.js` (CYCLE, AURA, REGEN, TOWER sections) | shop UI, portal visuals, XP gems |
| 4 | **Mickael** | `mickael/boss` (after #3) | **Boss wave + one gimmick** — end-of-cycle boss spawning near the base, punishes a weak build; pick ONE gimmick for MVP from the v2 doc's candidates (anti-kite siege boss recommended: it sits siegeing the base and ignores the player until provoked) | `src/systems/boss.js`, `src/config.js` (BOSS section) | multiple bosses, phase-counter system |

## New contract (agree in PR review before merging #2/#3)

- **Shop pick shape** (Akram emits, Mickael consumes): each option is
  `{ id, quadrant: "passive-defense" | "passive-offense" | "active-defense" | "active-offense", level, params: {...} }`,
  triggered as `getTreeRoot().trigger("shop-pick", pick)`. No system imports
  another.
- **Cycle director** (`cycle.js`, built). The loop is wave → break → shop
  at the golem → next wave:
  - It fires `getTreeRoot().trigger("cycle-phase", { phase, wave, portal })`
    with `phase` one of `"wave"`, `"break"`, `"shop"` or `"starting"`.
    `"break"` follows the end of wave `wave`. `portal` is true when the
    player was far from the golem (> `CYCLE.portalMinDistance`) at the end
    of the wave.
  - **Portal** (`portal.js`): spawns next to the player on `"break"` with
    `portal: true` and despawns on any other phase. Walking in fires
    `portal-enter`, and the cycle director drops the player just below the
    golem.
  - **Shop** (`shop.js`): the cycle director fires `shop-open` when the
    player is within `CYCLE.shopRadius` of the golem during the break
    (alive, not frozen). The shop doesn't teleport anyone. Closing it (pick
    or **E** to skip) fires `shop-close`, and the cycle director starts the
    next wave after `CYCLE.nextWaveDelay`.
  - The player and enemies can't overlap the golem: `base.solidRect()` is
    its visible body (`TOWER.body`).
- **Tower is an enemy-family target** (Mickael): the tower gets `hp()` and is
  hit by the existing enemy grid-hit path tagged `"tower"`.
- **Base effects are built** (`auras.js`, `regen.js`, `tower.js`) and react to
  `"shop-pick"`. What each quadrant does, and the `params` keys a pick may
  override (plain number, or `{ base, perLevel, min?, max? }`). Defaults and
  per-level scaling are in `AURA` / `REGEN` / `TOWER` in `src/config.js`:
  - `passive-defense`: aura around the base. Keys `radius`, `damageTaken`
    (player damage ×), `enemySlow` (enemy speed ×).
  - `passive-offense`: aura around the base. Keys `radius`, `damageMult`,
    `attackSpeedMult` (player weapon ×).
  - `active-defense`: heals the player near the base. Keys `range`,
    `interval`, `heal`, plus a shield from `shieldFromLevel` (`shield`,
    `shieldDuration`).
  - `active-offense`: **the base is the tower** (decided in
    game-design-v2). From the start of the run, `tower.js` gives the `"base"`
    object `health()` and the `"tower"` tag, and enemies attack it. The pick
    makes it shoot. Keys `hp`, `range`, `fireInterval`, `damage`. A new pick
    levels it up and repairs it. When it's destroyed:
    `getTreeRoot().trigger("run-over", { reason: "tower-destroyed" })`, the
    **only** lose condition.
  - `level` = how many times that quadrant has been picked (1, 2, 3…).
    The shop sends it.
- **Player buffs** (written by `auras.js` every frame, `1` outside auras):
  `player.buffs = { damageTaken, damageMult, attackSpeedMult }`. Any player
  weapon must use `damageMult` for its damage and divide its cooldown by
  `attackSpeedMult` (see `weapons.js`). `player.shield` (regen) is absorbed
  before damage by `enemies.js`.
- **Run over**: `getTreeRoot().on("run-over", ({ reason }) => …)`. A game-over
  screen should listen to it (`main.js` shows a TEMP text until then).
- **Run over freezes the game** (`runstate.js`, `enemies.js`). On `"run-over"`:
  the wave timer stops at its value, nothing spawns, no further wave can
  start (`wave-end` is not fired), and enemies, projectiles, coins and the
  portal are paused in place. `player.frozen = true` stops movement,
  weapons and regen, so **any new player-driven system must check
  `player.frozen` as well as `player.down`**. Input is NOT blocked (the
  scene isn't paused), so the game-over screen's Restart works. It can open
  on `"run-over"` or `"run-frozen"`. The director exposes `isOver()`.
- **Player death → respawn** (`respawn.js`). Player death is not game over:
  - `player.down` is true while dead. Movement, weapons, regen and enemies
    all skip a downed player, so **any new player-driven system must check
    it**. The player is hidden and parked at the base.
  - `player.respawnIn` (s left), `player.respawnStep`, and
    `player.nextRespawn` (what the next death costs) are for the HUD.
  - Root events: `player-down` `{ respawnIn, step }`, `player-respawn`,
    and `respawn-step` `{ step, nextRespawn }`.
  - Ladder: `RESPAWN.steps`. +1 step per death; −1 per `wave-end` with
    reason `"cleared"` or per `boss-defeated` (the boss task should fire
    `getTreeRoot().trigger("boss-defeated")`).
- **Boss waves** (`ENEMY_WAVES.boss`, the `"boss"` type in `ENEMY_TYPES`):
  - Every **3rd wave** (3, 6, 9…) is a boss wave.
  - One **siege boss** spawns `spawn.distance` (420 px) from the base. The
    art rotates: Slime King → Vampire Lord → Reaper → Demon Lord → Treant.
  - The boss's HP scales with the wave (360 / 675 / 1050…). It has an HP bar
    with its name.
  - **Gimmick:** it attacks the tower and ignores the player **until the
    player damages it**. Then it chases the player for `provokeDuration`
    (5 s). Shots with `source: "tower"` (the base's bolts) don't provoke it.
  - Minions come at half their usual count. There is **no timer**: the wave
    ends `"cleared"` when the boss dies, and leftover minions die with it.
  - Reward: a big XP gem and 15 coin drops.
  - Root events:
    - `boss-incoming` `{ wave }` fires when the wave BEFORE a boss wave ends,
      so the HUD can warn and the player can shop with intent.
    - `boss-wave` `{ wave }` fires when it starts.
    - `boss-defeated` `{ wave, type, name, pos }` fires when the boss dies
      (the respawn ladder steps down).
  - `wave-end` now also carries `boss: true|false`. The director exposes
    `isBossWave()`.
- **Enemy attack patterns** (`ENEMY_TYPES[].spawn.group` / `.behavior`):
  - **Zombies** come in groups of 3–6, spaced out.
  - **Golems** come alone, with a lot of HP.
  - A group keeps its formation while travelling, closes up near its target,
    and shares ONE target (player or tower) for the whole group.
  - **Bats** (`behavior: "sweep"`) target nobody. A tight swarm of 9–14
    flies straight across the screen, leaves it, waits `returnDelay` s,
    then sweeps back. They fly over the golem (no collision) but hurt
    whatever they touch on the way: the player, and the tower when they
    pass over it. Their `target` is always `null`.
  - Walkers steer around the solid golem (shortest path via its corners)
    unless the golem is their target.
- **Smart enemy targeting** (`enemies.js`, tuning in `ENEMY_TARGETING`):
  each enemy picks the player or the tower. It focuses the clearly weaker
  one (hp fraction gap ≥ `focusMargin`), otherwise the horde splits
  (`towerShare`). Targets are re-evaluated every ~0.75 s with stickiness.
  When only one target is available, everyone goes for it.
- **Base**: effects center on the first object tagged `"base"` (`base.js`).
  TEMP keys 1–4 in `main.js` still fire shop picks for testing.
- **Level up stats** (chippe, `upgrade-effects.js`): level up cards write
  `player.stats = { speedMult, damageMult, attackSpeedMult }` (all start at 1).
  It is separate from `player.buffs` (auras, rewritten every frame), so both
  stack: `damage × buffs.damageMult × stats.damageMult`, `cooldown ÷
  buffs.attackSpeedMult ÷ stats.attackSpeedMult`, `speed × stats.speedMult`.
  Any new weapon should apply both, and skip firing while `player.down`,
  `player.frozen` or `player.attackDisabled`.
  Cards are announced as `player.trigger("upgrade", { id, level })`.
- **Tags added in wave 2**: `"base"`, `"portal"`, `"tower"`, `"aura"`.
  Existing wave-1 tags (`"player"`, `"enemy"`, `"projectile"`, `"xp-gem"`)
  unchanged.
- All new tuning numbers in `src/config.js` under new sections
  (`SHOP`, `CYCLE`, `AURA`, `REGEN`, `TOWER`, `BOSS`); expect config
  conflicts, rebase before PR.

## Sequencing

1 (chippe) and 2 (Akram) start in parallel. 3 depends on the pick-data shape
only (contract above), so Mickael can start it against the contract without
waiting for #2's UI. 4 waits for 3.
