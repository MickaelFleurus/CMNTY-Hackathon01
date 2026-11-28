# Task Split - Wave 2 (v2 redesign: survivors × tower-defense)

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
| 1 | **chippe** | `chippe/xp-levelup` (carry over from wave 1) | **XP gems + level-up + HUD** - enemies drop gems (listen to `on("drop","enemy",…)`), walk-over pickup, level-up pick-1-of-3 during field waves, HUD (wave number, HP, coins, level) | `src/systems/xp.js`, `src/systems/upgrades.js`, `src/systems/hud.js`, `src/config.js` (xp curve, coin values) | shop logic, portal, base entity |
| 2 | **Akram** | `akram/base-shop` | **Base entity + shop scene + coins** - a base at a fixed home position on the map, portal spawns when a wave ends and teleports the player home, shop UI with the 2×2 grid (passive-defense / passive-offense / active-defense / active-offense), one pick per cycle, coins as currency. Shop **picks are data**: each option declares its effect type + parameters; applying the effect is the other systems' job | `src/systems/base.js`, `src/systems/shop.js`, `src/systems/portal.js`, `src/config.js` (SHOP section: option defs, coin economy) | aura effects, regen, tower behavior, enemy waves (agree the pick-data shape with Mickael/chippe first - see contract below) |
| 3 | **Mickael** | `mickael/cycle-director` | **Cycle director + aura/regen/tower effects** - wraps the wave director into the v2 cycle (wave → clear → portal event → shop → next wave, harder each cycle); implements the three effect systems the shop picks select: passive auras (growing-radius buff zones read from the player's pick), active-defense HP-regen tick (in-range heal every X s), active-offense tethered tower (targetable by enemies - needs his own grid-hit path extended to `hp` on the tower; tower death = run over) | `src/systems/cycle.js`, `src/systems/auras.js`, `src/systems/regen.js`, `src/systems/tower.js`, `src/config.js` (CYCLE, AURA, REGEN, TOWER sections) | shop UI, portal visuals, XP gems |
| 4 | **Mickael** | `mickael/boss` (after #3) | **Boss wave + one gimmick** - end-of-cycle boss spawning near the base, punishes a weak build; pick ONE gimmick for MVP from the v2 doc's candidates (anti-kite siege boss recommended: it sits siegeing the base and ignores the player until provoked) | `src/systems/boss.js`, `src/config.js` (BOSS section) | multiple bosses, phase-counter system |
| 5 | **unclaimed** (put your name here) | `<name>/sound` | **Sound & music** - one audio system that plays every sound and music track listed in the GDD's "Sound & music" section by **listening to existing game events** (`getTreeRoot().on(...)`), so no other system needs to import it. Volume sliders (music / effects) + mute key, saved in the browser; rate limits and random pitch for frequent sounds; distance-based volume; music crossfade per `cycle-phase`; audio unlocked on first input. Where the GDD says **(new event)**, add the one-line `trigger` in the owning system in a **separate tiny PR** (or ask its owner) | `src/systems/audio.js`, `sfx/` (assets + license files), `src/config.js` (`AUDIO` section), one import in `src/main.js`, a short `docs/assets.md` note on the sound packs | changing gameplay, new game events beyond one-line triggers, composing a full soundtrack (start with placeholder / CC0 tracks) |

## New contract (agree in PR review before merging #2/#3)

- **Shop pick shape** (Akram emits, Mickael consumes): each option is
  `{ id, quadrant: "passive-defense" | "passive-offense" | "active-defense" | "active-offense", level, params: {...} }`,
  triggered as `getTreeRoot().trigger("shop-pick", pick)`. No system imports
  another.
- **Cycle director** (`cycle.js`, built). The loop is wave → aftermath →
  break → shop at the golem → next wave:
  - It fires `getTreeRoot().trigger("cycle-phase", { phase, wave, portal })`
    with `phase` one of `"wave"`, `"aftermath"`, `"break"`, `"shop"` or
    `"starting"`.
  - **Aftermath** (right after `wave-end`): enemies have poufed away
    (`enemies.js`), `CYCLE.afterWaveDelay` s of calm, then
    `golem-swipe { duration: CYCLE.swipeTime }` (a rainbow band sweeps up the
    golem, `tower.js`), then `"break"`. `portal` is true when the player is
    far from the golem (> `CYCLE.portalMinDistance`) when the break starts.
  - **Guide arrow** (`guide-arrow.js`): during `"break"`, if the nearest of
    the golem (shop) and the portal is off-screen, an arrow at the screen
    edge points at it (gold "SHOP" / violet "PORTAL", `GUIDE_ARROW`).
  - **Portal** (`portal.js`): spawns next to the player on `"break"` with
    `portal: true` and despawns on any other phase. Walking in fires
    `portal-enter`, and the cycle director drops the player just below the
    golem.
  - **Shop** (`shop.js`): the cycle director fires `shop-open` when the
    player is inside the **shop circle** (`CYCLE.shopCircle` px from the
    golem's body center, drawn during the break as a pulsing glowing ring with an inward ripple and an "UPGRADE THE GOLEM / Step into the circle" hint under it, `CYCLE.shopCirclePulseHz` / `shopHint`)
    (alive, not frozen). The shop doesn't teleport anyone. Closing it (pick
    or **E** to skip) fires `shop-close`, and the cycle director starts the
    next wave after `CYCLE.nextWaveDelay`.
    The shop is a **skill tree** (chippe): one branch per quadrant, nodes
    Lv1 → maxLevel, keys 1-4 buy the next node of each branch (key badge next
    to it), Esc / E skip. One shared price, `SHOP.upgradeCost` (`baseCost ×
    costGrowth ^ upgradesOwned`), replaces the per-option costs. Fires
    `shop-refused` { id, cost, coins } when too poor. TEMP keys 1-4 in
    `main.js` are off while it is open.
  - The player and enemies can't overlap the golem: `base.solidRect()` is
    its visible body (`TOWER.body`).
- **Tower is an enemy-family target** (Mickael): the tower gets `hp()` and is
  targeted via the `"tower"` tag. It is **not hit per attack**: its HP
  **drains** every frame while enemies touch its body, **in steps**
  (`enemies.js`, via `tower.hurt(n)`): each touching enemy is worth
  `pressure` points (`ENEMY_TYPES[].pressure`: zombie / bat 1, crystal
  golem 4, +1 per color tier; boss 8, 12 from the second boss on). Step =
  `floor(points / 4) + 1` (0 with nobody on it), drain = step ×
  `ENEMY.towerDrain.hpPerStep` (2) HP/s. So 1–3 points drain 2 HP/s, 4–7
  drain 4, 8–11 drain 6, and so on. `damage-taken { kind: "tower" }` reports the drained
  total every `towerDrain.reportInterval` s. `tower.js` pulses a faint red
  tint, faster the faster it drains (`TOWER.drainFlash`).
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
    levels it up and repairs it. At every `wave-end` the golem gets back
    `TOWER.waveEndRepair` (10%) of its max HP (never above max), and
    `golem-repaired { amount }` fires. When it's destroyed:
    `getTreeRoot().trigger("run-over", { reason: "tower-destroyed" })`, the
    **only** lose condition once the golem is awake (see below).
  - `level` = how many times that quadrant has been picked (1, 2, 3…).
    The shop sends it.
- **Player buffs** (written by `auras.js` every frame, `1` outside auras):
  `player.buffs = { damageTaken, damageMult, attackSpeedMult }`. Any player
  weapon must use `damageMult` for its damage and divide its cooldown by
  `attackSpeedMult` (see `weapons.js`). `player.shield` (regen) is absorbed
  before damage by `enemies.js`.
- **Golem awakening / wave 1** (`tower.js`, `respawn.js`): during wave 1 the
  base is an inert statue. `base.awake === false`: it is still solid
  (`solidRect()`, enemies are pushed out and walk around it), but enemies
  don't target it or damage it, it has no HP bar and it doesn't shoot. It
  wakes on the first `"wave-end"`: `base.awake = true` and
  `getTreeRoot().trigger("golem-awake")` (once). Until then
  `player.canRespawn === false` and a player death ends the run:
  `run-over { reason: "player-died" }`, no respawn. **Anything that targets
  or damages the tower must skip it while `awake === false`.**
  Look: the golem stays a **grey, still statue** (greyscale shader,
  `animSpeed = 0`) until its power is picked, which for now is the first
  `"shop-close"` after waking (pick or skip). Then the shader is removed, the idle
  animation starts, `base.powered = true` and `"golem-powered"` fires once.
  When the golem style pick lands, it should drive this instead. The
  power-on is animated: colour sweeps up from the feet (`TOWER.powerOnTime`),
  then `"golem-powered"` fires.
- **Golem death sequence** (`tower.js`): at 0 HP the golem fires
  `"golem-dying"` at once. `enemies.js` stops the wave (no `wave-end`) and
  poufs every enemy, `runstate.js` sets `player.frozen`, `respawn.js` and
  `cycle.js` stop, and the camera glides to the golem. After
  `TOWER.deathDelay` s the colour drains top to bottom
  (`TOWER.powerDownTime`), **then** `run-over { reason: "tower-destroyed" }`
  fires and the game-over screen opens. Anything that should stop when the
  golem falls must listen to `"golem-dying"`, not only `"run-over"`.
- **Golem shock wave** (`golem-shockwave.js`, `GOLEM_SHOCKWAVE`): once
  `base.awake`, it starts when `minContact` (3) enemies have touched the
  golem's body for `windup` (1.5) s in a row, then fires again each time its `cooldown` (6 s) is over, as long as at least one enemy is still
  touching it when the wave is ready (none → back to waiting for 3). Each
  wave fires `enemy-knockback` (over `radius`) plus
  `golem-shockwave { x, y, radius }` and draws an expanding ring. It works
  whatever the shop picks, and stops on `golem-dying`.
- **Knockback** (`enemies.js`): `getTreeRoot().trigger("enemy-knockback",
  { x, y, radius, force, damage? })` pushes every visible live enemy in range
  straight away at `force` px/s × (1 − type `knockbackResist`), decaying by
  `ENEMY.knockbackDecay`. Pushed enemies don't chase until it fades. Any
  system can use it (e.g. an aura weapon).
- **Run over**: `getTreeRoot().on("run-over", ({ reason }) => …)`. `reason`
  is `"tower-destroyed"` (tower.js) or `"player-died"` (respawn.js, wave 1
  only). The game-over screen (`gameover.js`) shows a line per reason.
- **Run over freezes the game** (`runstate.js`, `enemies.js`). On `"run-over"`:
  the wave timer stops at its value, nothing spawns, no further wave can
  start (`wave-end` is not fired), and enemies, projectiles, coins and the
  portal are paused in place. `player.frozen = true` stops movement,
  weapons and regen, so **any new player-driven system must check
  `player.frozen` as well as `player.down`**. Input is NOT blocked (the
  scene isn't paused), so the game-over screen's Restart works. It can open
  on `"run-over"` or `"run-frozen"`. The director exposes `isOver()`.
- **Player death → respawn** (`respawn.js`). Once the golem is awake,
  player death is not game over:
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
  - Minions spawn at half their usual rate (`ENEMY_WAVES.boss.minionRateMult`),
    for as long as the boss lives. There is **no timer**: the wave
    ends `"cleared"` when the boss dies, and leftover minions die with it.
  - Reward: a big XP gem and 15 coin drops.
  - Root events:
    - `boss-incoming` `{ wave }` fires when the wave BEFORE a boss wave ends,
      so the HUD can warn and the player can shop with intent.
      `boss-warning.js` shows a "BOSS NEXT WAVE" banner with the boss's name,
      then a small reminder under the timer for the whole break.
    - `boss-wave` `{ wave }` fires when it starts (`boss-warning.js`: a short
      "BOSS WAVE" banner).
    - `boss-defeated` `{ wave, type, name, pos }` fires when the boss dies
      (the respawn ladder steps down).
  - `wave-end` now also carries `boss: true|false`. The director exposes
    `isBossWave()`.
  - **Planned, NOT designed yet: bosses will get a distance (ranged)
    attack.** Don't implement it until it's designed. For now, bosses only
    hit on contact. Hooks to reuse: the boss's `target`/`provokedUntil`
    (who it would shoot at), its `attack` animation, and `"projectile"`
    objects for anything it fires at the player or tower. Those will need a
    separate hit path, because enemies.js only resolves projectiles
    hitting **enemies**.
- **Enemy attack patterns** (`ENEMY_TYPES[].spawn.group` / `.behavior`):
  - **Zombies** come in groups of 3–6, spaced out.
  - **Golems** come alone, with a lot of HP.
  - A group keeps its formation while travelling, closes up near its target,
    and shares ONE target (player or tower) for the whole group.
  - **Bats** (`behavior: "sweep"`) target nobody. A tight swarm of 9–14
    flies straight across the screen, leaves it, waits `returnDelay` s,
    then sweeps back. They fly over the golem (no collision) but hurt
    whatever they touch on the way: the player, and the tower when they
    pass over it. Their `target` is always `null`. While they wait
    off-screen they are **hidden and out of play**: `hidden = true`, no
    `"enemy"` tag (weapons and the tower can't aim at them), and no hits or
    contact damage either way.
  - Walkers steer around the solid golem (shortest path via its corners)
    unless the golem is their target.
- **Smart enemy targeting** (`enemies.js`, tuning in `ENEMY_TARGETING`):
  each enemy picks the player or the tower. It focuses the clearly weaker
  one (hp fraction gap ≥ `focusMargin`), otherwise the horde splits
  (`towerShare`). Targets are re-evaluated every ~0.75 s with stickiness.
  When only one target is available, everyone goes for it.
- **Base**: effects center on the first object tagged `"base"` (`base.js`).
  TEMP keys 1–4 in `main.js` still fire shop picks for testing.
- **Rare bonus drops** (chippe, `bonus.js`): a `"bonus"` row at the top of the
  drop tables (0.5%, replaces the normal drop). Bomb, Freeze, Rage, Golem heal,
  Magnet, Recall (R). Rage sets `player.rage = { damageMult, attackSpeedMult }`
  + `player.trigger("rage-changed")`, folded into `player.stats` by
  `upgrade-effects.js`, so weapons need nothing new. Magnet fires
  `"magnet-all"` (xp.js) and sets `coin.homing`. `"bonus-picked" { kind }` on
  pickup. A drop with `{ kind: "bonus", bonus: "bomb" }` forces one (chests).
- **HUD** (chippe, `hud.js`): HP orb + level badge + weapon slots (icon, level
  pips) + stat icons + XP underline, bottom left; coins / kills with icons top
  right; wave + timer top center. Reads `ownedUpgrades` / `UPGRADES` (icon,
  tint, maxLevel) from `upgrades.js`, so a new weapon card shows up by itself.
  HP colors (green → amber → red, dark gray empty) in `src/util/hpColor.js`.
- **Base under attack UI** (chippe, `base-alert.js`): golem HP bar in the HUD
  (flashes on hit, respawn countdown next to it while dead), "THE GOLEM IS
  UNDER ATTACK!" banner (only when the player is `BASE_ALERT.bannerMinDistance`
  px or more away; once per attack, again after `BASE_ALERT.bannerQuiet` s of quiet),
  red off-screen arrow while it is hit (not during the break) and a red edge
  pulse below `BASE_ALERT.dangerRatio`. Fires
  `getTreeRoot().trigger("base-under-attack", { hp, maxHP })` with each banner.
- **Minimap** (chippe, `minimap.js`): top-left corner, centered on the player.
  Golem = gold diamond (red pulse while losing HP, clamped to the edge as a
  compass when far), enemies = red dots (bosses pink, bigger), portal violet,
  bonus drops yellow. Reads tags only; tuning in `MINIMAP`.
- **Chests & hidden treasures** (chippe, `chests.js`): spawned on `wave-start`,
  cleared on `wave-end`. Chests (tag `"chest"`): stand next to one for
  `CHESTS.openTime` s (walking away cancels), farther = better loot, some
  guarded (zombies spawn on approach). Loot: coins (`spawnCoins`), a free card
  (`"free-level-up-card"` → upgrades.js, level unchanged), full heal, golem
  repair, free golem upgrade (`"golem-upgrade-free"` → shop.js, no
  `upgradesOwned`). Golem chests: pick 1 of 3 golem stats (paused screen
  `"golem-chest-ui"`): Max HP, Armor (wraps `base.hurt`), Swipe (scales
  `GOLEM_SHOCKWAVE.radius/force`); fires `"golem-stat-pick" { stat, level }`.
  Treasures (tag `"treasure"`, invisible): sparkle within `hintRadius`, dig
  `digTime` s. Events: `"chest-opened"`, `"treasure-dug"`. Level up never opens
  over another paused screen (golem style pick / golem chest).
- **Level up stats** (chippe, `upgrade-effects.js`): level up cards write
  `player.stats = { speedMult, damageMult, attackSpeedMult }` (all start at 1).
  It is separate from `player.buffs` (auras, rewritten every frame), so both
  stack: `damage × buffs.damageMult × stats.damageMult`, `cooldown ÷
  buffs.attackSpeedMult ÷ stats.attackSpeedMult`, `speed × stats.speedMult`.
  Any new weapon should apply both, and skip firing while `player.down`,
  `player.frozen` or `player.attackDisabled`.
  Cards are announced as `player.trigger("upgrade", { id, level })`.
- **Player invulnerability** (`invuln.js`): `player.invulnFor` = seconds the
  player can't be hit (0 = can be hit). `enemies.js` sets it to
  `CFG.player.invulnTime` (1 s) on every enemy hit and ignores contact while
  it's > 0; a respawn gives `CFG.player.respawnInvulnTime` (2 s). The player
  blinks with `opacity` meanwhile (never `hidden`, which means dead).
  **Anything new that damages the player must skip it while
  `player.invulnFor > 0`, and set it after a hit.**
- **Tags added in wave 2**: `"base"`, `"portal"`, `"tower"`, `"aura"`.
  Existing wave-1 tags (`"player"`, `"enemy"`, `"projectile"`, `"xp-gem"`)
  unchanged.
- All new tuning numbers in `src/config.js` under new sections
  (`SHOP`, `CYCLE`, `AURA`, `REGEN`, `TOWER`, `BOSS`); expect config
  conflicts, rebase before PR.

## Sounds (`sounds.js`)

- Every sound is triggered from events or tags other systems already
  produce; no gameplay file calls `play()`. To give something a sound, fire
  an event (or tag the object) and hook it in `sounds.js`.
- Tags it reads: `"plank"` + `"fx"` (one per poke), `"bullet"` (pistol, set in
  `weapons.js`), `"axe"` (loop while any exist). Events: `killed`,
  `pickup-collected`, `bonus-picked`, player `levelup`, `wave-end`.
- The axe whoosh repeats every `SOUND.axeEvery` s while axes fly, only
  while the game runs (not on the level-up screen, in the shop, paused,
  frozen / down player). It's one-shots, not a KAPLAY loop: in 3001 a
  paused-then-resumed loop restarts at a wrong offset (often silent).
  `run-over` plays the game over sound and fades the background music out
  (`LoopMusic.mp3`, one loop for the whole run, never paused). Footsteps aren't a loop: one per
  `SOUND.stride` px actually walked (teleports ignored). **M** toggles mute (saved in the browser).

## Run stats (`run-stats.js`)

- Saved as ONE JSON object in `localStorage["golem-necromancer-stats"]`:
  `{ version: 1, latest: {…run…}, total: {…all runs…} }`. Counters are plain
  numbers; per-name counts are flat maps (`kills`, `cards`, `shopPicks`,
  `pickups`, `bonuses`, `milestones`). Format documented at the top of
  `run-stats.js`. `window.gameStats` has `get / export / import / reset`.
- It only **listens** to existing events. If you add something worth
  counting, fire an event and count it there, don't import run-stats.
- New root event **`pickup-collected { kind, value }`**: fired by `xp.js`
  (XP gems, hearts) and `base.js` (coins) when the player collects a ground
  pickup. Bonus drops already fire `bonus-picked { kind }`.
- The starter weapon isn't counted as a picked card: `startRunStats()` runs
  after `grantUpgrade("weapon-plank")` in `main.js`.

## Sequencing

1 (chippe) and 2 (Akram) start in parallel. 3 depends on the pick-data shape
only (contract above), so Mickael can start it against the contract without
waiting for #2's UI. 4 waits for 3. 5 (sound) has no dependency and can start any time.
