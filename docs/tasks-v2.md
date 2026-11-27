# Task Split — Wave 2 (v2 redesign: survivors × tower-defense)

Split of the v2 scope (see [`game-design-v2.md`](game-design-v2.md)). Same
rules as wave 1 (see [`tasks.md`](tasks.md)): one branch per task via
`scripts/feature.sh start <slug>`, tag contract still applies, tuning
numbers go in `src/config.js`, PRs don't merge themselves.

Wave 1 leftovers first: **chippe's XP/level-up/HUD system is still not
built** and everything below depends on it — that's chippe's task 1.

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
- **Portal event** (Akram → Mickael): `getTreeRoot().trigger("portal-enter")`
  when the player steps in; cycle director listens and opens the shop state.
- **Wave-end → portal handoff** (Mickael → Akram): cycle director fires
  `getTreeRoot().trigger("cycle-phase", { phase: "portal" | "shop" | "wave", wave })`;
  portal/shop/base systems only become interactive in their phase.
- **Tower is an enemy-family target** (Mickael): the tower gets `hp()` and is
  hit by the existing enemy grid-hit path tagged `"tower"`.
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
