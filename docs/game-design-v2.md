# Game Design v2 — Survivors × Tower Defense ("Waves & Walls")

**Engine:** KAPLAY (web, JS) · **Status:** brainstormed conclusion, supersedes
the pure-survivors loop in `game-design.md` (which stays as the movement/spawn
baseline we already built).

## Elevator pitch

Vampire Survivors mechanics (auto-attack, hordes, XP) grafted onto a
tower-defense spine: you fight waves out in the field, then port home, spend,
and **choose what your base becomes** — and that choice changes the entire
next run segment. The pick is the game.

## The identity hook

> Depending on which version you pick for the run, your gameplay experience
> differs by a big margin.

Every run the player shapes their base along two axes (defense/offense ×
passive/active). Defense pick → play style: kite enemies into your base's
reach. Offense pick → play style: mobile DPS hero. Passive pick → the base is
a safe aura engine you can leave. Active pick → the base is a living thing you
must protect — it becomes your life total.

## The core loop (one "cycle")

1. **Plank** — you start with nothing but a plank (starter melee poke / the
   humblest weapon). Wave 1 of enemies comes at you in the field.
2. **Survive the wave** — survivors-style: move, auto-attack, XP gems drop,
   collect to level (level-ups still work survivors-style during the wave).
3. **Portal opens** — when the wave is cleared (or timer expires), a
   teleport appears; stepping in returns you to your **base**.
4. **Shop** — at base, a shop opens with **1 pick out of 4**, always the same
   grid:
   | | Defense | Offense |
   |---|---|---|
   | **Passive** | base emits a **defense aura** (armor/slow/regen aura, growing range per upgrade) | base emits an **offense aura** (buffs your damage/attack speed; stronger the more you invest) |
   | **Active** | base **regens your HP every X s** while you're in range (flesh out: heal tick + brief shield on trigger?) | base **fights for you** (a tower that auto-attacks; stronger than passives) |
5. **Next wave** — portal out, field wave harder than the last, repeat.
6. **Boss** — a boss eventually spawns **near your base**. If your base (and
   you) aren't strong enough by boss time, you lose — the boss punishes a
   weak or lopsided build. Gimmick idea (iterate): bosses demand a *specific*
   counter, so the 1-of-4 shop choice matters more than raw numbers.

## The passives/actives trade (the design heart)

- **Passives** scale *reach*: every upgrade level grows the **aura radius**,
  so eventually you don't need to camp home — freedom, and the horde still
  comes to *you*.
- **Actives** are *stronger per level but bind your fate to the base*: the
  active structure (e.g. the offense tower) is **targetable by enemies**, and
  **if the tower dies, you die** — the tower effectively IS your life. You
  become a bodyguard, not a roamer.
- Defense vs offense passives: defense auras protect/restore, offense auras
  multiply your killing speed — one says "outlast", the other says "delete".

## Lose condition + player respawn

- **The tower being destroyed is the game over.** It is the run's life
  total. Player death is **not** game over.
- **Player death → respawn timer.** When the player dies they are out until
  the respawn timer runs out, then they respawn at the base and go back to
  protecting the tower. While the player is dead, the tower is on its own,
  so a long respawn is a real threat.
- **The respawn duration is a ladder of steps** (values tuned in
  `src/config.js`, e.g. 3 s → 5 s → 8 s → 12 s → 18 s…):
  - every player death moves the timer **up one step** (the next death
    waits longer);
  - every **wave cleared** or **boss defeated** moves it **down one step**
    (never below the first step).
  - Dying often in a short time is punished hard; playing well wins the
    time back.
- The HUD shows the respawn countdown while the player is dead and the
  current respawn step otherwise, so the player knows what the next death
  costs.

## Enemy targeting (smart enemies)

Enemies don't all run at the nearest thing. They pick between the two
targets, **the player** and **the tower**, so the player can't just stand
in one place:

1. **Focus the weaker target.** If one of the two is clearly closer to dying
   (lower HP *as a fraction of its max HP*), enemies prefer it and try to
   finish it off. This rule wins over rule 2.
2. **Otherwise spread the pressure.** If enough enemies are already
   attacking the tower, a new or idle enemy goes for the player, and the
   other way round. The horde splits itself between both targets instead of
   stacking on one.
3. **Only one target available** (player dead and waiting to respawn, or no
   tower yet): everything goes for the one that's left.
4. Enemies **re-evaluate regularly** (a short interval, not every frame) and
   don't switch target constantly. A little stickiness keeps their movement
   readable and stops them from jittering between the two targets.

Tuning values (how much weaker a target must be before enemies focus it,
how many attackers count as "enough", re-evaluation interval) go in
`src/config.js`.

## Boss + gimmick sketch (needs iteration)

- Boss waves are announced a wave ahead (HUD warning) so the player can shop
  with intent.
- Gimmick candidates:
  - **Anti-kite**: boss ignores the player until provoked; sits siegeing the
    base → active-defense players must sortie.
  - **Anti-camp**: boss degrades any base aura it stands in → passive players
    must lure it out.
  - **Phase counter**: each boss has a weakness matching one of the 4 shop
    quadrants, so the "right" pick differs per boss (but the player already
    committed — so gimmick teaches, next run adapts).
- Losing condition: **the tower is destroyed** (see "Lose condition + player
  respawn"). Player death only starts the respawn timer.

## What stays from v1 (built or in flight)

- Movement + touch joystick + infinite gray-zone ground (done, PR #5).
- Enemy chase + spawn director + levels + drop events (done, PR #6).
- XP gems, level-up pick-1-of-3, HUD — still wanted *during* field waves.

## New build order (delta on top of the above)

1. **Base entity + shop scene** — a base object at a fixed home location;
   portal at wave end; shop UI with the 2×2 grid (one pick per cycle).
2. **Cycle director** — wave N in field → clear → portal → shop → wave N+1.
   Reuses Mickael's director with a "wave" wrapper.
3. **Passive aura system** — growing-radius aura comps; read `docs/tasks.md`
   contract (tags) for implementation.
4. **Active defense (HP regen tick)** — flesh out: regen X HP every Y s
   in-range; maybe an on-take-damage shield proc as upgrade tiers rise.
5. **Active offense (player-tethered tower)** — targetable base, tower HP,
   death = run death.
6. **Player respawn ladder** — player death = timer instead of game over;
   step up per death, step down per wave cleared / boss defeated.
7. **Smart enemy targeting** — focus the weaker target, else split between
   player and tower (see "Enemy targeting").
8. **Boss wave + gimmick** — last; keep one boss, one gimmick for MVP.

## Open questions (brainstorm residue)

- Does XP-leveling stay per-wave (resets each cycle) or persist across the
  run? (Leaning: persists; shop picks are the per-cycle power gain.)
- Can the player skip the shop (save coins for a bigger pick)? Bank or not?
- Is the tower always on the map (so the lose condition always applies), or
  only after the active-offense pick? If it's pick-only, what ends a run for
  players who never pick it?
- Coins vs XP as the shop currency — both exist already in the asset pack.
- Are the 4 shop options fixed every cycle, or does the pool grow with
  unlocks? (Fixed = readable; growing = roguelite.)
