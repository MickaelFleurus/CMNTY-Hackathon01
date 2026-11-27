# Game Design v2 - Survivors × Tower Defense ("Waves & Walls")

**Engine:** KAPLAY (web, JS) · **Status:** brainstormed conclusion, supersedes
the pure-survivors loop in `game-design.md` (which stays as the movement/spawn
baseline we already built).

## Elevator pitch

Vampire Survivors mechanics (auto-attack, hordes, XP) grafted onto a
tower-defense spine: you fight waves out in the field, then port home, spend,
and **choose what your base becomes** - and that choice changes the entire
next run segment. The pick is the game.

## The identity hook

> Depending on which version you pick for the run, your gameplay experience
> differs by a big margin.

Every run the player shapes their base along two axes (defense/offense ×
passive/active). Defense pick → play style: kite enemies into your base's
reach. Offense pick → play style: mobile DPS hero. Passive pick → the base is
a safe aura engine you can leave. Active pick → the base is a living thing you
must protect - it becomes your life total.

## The core loop (one "cycle")

1. **Plank** - you start with nothing but a plank (starter melee poke / the
   humblest weapon). Wave 1 of enemies comes at you in the field.
2. **Survive the wave** - survivors-style: move, auto-attack, XP gems drop,
   collect to level (level-ups still work survivors-style during the wave).
3. **Portal opens** - when the wave is cleared (or timer expires), a
   teleport appears; stepping in returns you to your **base**.
4. **Shop** - at base, a shop opens with **1 pick out of 4**, always the same
   grid:
   | | Defense | Offense |
   |---|---|---|
   | **Passive** | base emits a **defense aura** (armor/slow/regen aura, growing range per upgrade) | base emits an **offense aura** (buffs your damage/attack speed; stronger the more you invest) |
   | **Active** | base **regens your HP every X s** while you're in range (flesh out: heal tick + brief shield on trigger?) | base **fights for you** (a tower that auto-attacks; stronger than passives) |
5. **Next wave** - portal out, field wave harder than the last, repeat.
6. **Boss** - a boss eventually spawns **near your base**. If your base (and
   you) aren't strong enough by boss time, you lose - the boss punishes a
   weak or lopsided build. Gimmick idea (iterate): bosses demand a *specific*
   counter, so the 1-of-4 shop choice matters more than raw numbers.

## The passives/actives trade (the design heart)

- **Passives** scale *reach*: every upgrade level grows the **aura radius**,
  so eventually you don't need to camp home - freedom, and the horde still
  comes to *you*.
- **Actives** are *stronger per level but bind your fate to the base*: the
  active structure (e.g. the offense tower) is **targetable by enemies**, and
  **if the tower dies, you die** - the tower effectively IS your life. You
  become a bodyguard, not a roamer.
- Defense vs offense passives: defense auras protect/restore, offense auras
  multiply your killing speed - one says "outlast", the other says "delete".

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

## Weapons & upgrades catalog (level-up pool)

Everything the player can get from a **level-up card** during field waves
(pick 1 of 3). Shop picks (the 2×2 base grid) are separate and listed above.
Every entry has its own look, taken from the Survivors Starter Kit
(`gfx/SurvivorsStarterKit_v1.0/`, see `docs/assets.md`): a projectile or
effect sprite in the world, and an icon on its card.

### Slots and levels

- The player holds up to **4 weapons** and **4 stat upgrades**. Once the
  slots are full, cards only offer levels for what you already have.
- Each weapon goes up to **level 5**; each level adds one of the weapon
  upgrades below (fixed path per weapon, so the card can say exactly what
  you get).
- Weapons all apply the global stats (Might, Cooldown, Area…) and the base
  aura buffs (`player.buffs.damageMult`, `attackSpeedMult`).

### Weapons

How each one targets is its identity, and no two play the same:

| Weapon | Targeting / behaviour | Look (projectile · icon) | Level path (Lv2 → Lv5) |
|---|---|---|---|
| **Plank** (starter) | **Hits in front of the player**: short poke in the facing direction | placeholder (no sprite in the pack yet) · `Icon_Axe` | +damage → +reach → hits behind too → +damage |
| **Whip** | **Hits in front of the player**: wide horizontal slash in the facing direction | `Proj_Whip` · `Icon_Whip` | +area → also slashes behind → +damage → +area |
| **Magic Bolt** | **Hits the nearest enemy**: homing bolt | `Proj_Magic_Bolt` · `Icon_Magic_Bolt` | +1 bolt → +damage → **rebound** 1 → +1 bolt |
| **Knife** | **Throws several**: a fan of knives in the facing direction | `Proj_Knife` · `Icon_Knife` | every level: +1 knife per volley **and** **pierce** +1 (PR #41) |
| **Axe** | **Goes through enemies**: thrown up in an arc, falls through the horde, high pierce | `Proj_Axe` · `Icon_Axe` | +damage → pierce +3 → +1 axe → +area |
| **Boomerang** | **Goes through enemies** twice: flies out to the nearest enemy and comes back | `Proj_Boomerang` · `Icon_Boomerang` | pierce +2 → +1 boomerang → +speed → **rebound** off the screen edge |
| **Fireball** | **Explodes**: flies to the nearest enemy, blows up on impact (area damage) | `Proj_Fireball` + `FX_Explosion` · `Icon_Fireball` | +blast area → +damage → +1 fireball → leaves a short burn |
| **Lightning** | **Happens randomly on the screen**: strikes random enemies on screen | `Proj_Lightning` + `FX_Hit_Spark` · `Icon_Lightning` | +1 strike → +damage → **chains** to 1 nearby enemy → +1 strike |
| **Holy Water** | **Happens randomly on the screen**: flasks land at random spots near the player and leave a burning puddle | `Proj_Holy_Water_Flask` → `Proj_Holy_Water_Flames` · `Icon_Holy_Water` | +duration → +1 flask → +area → +damage |
| **Orbit Orb** | **Around the player**: orbs circle the player and hit what they touch | `Proj_Orbit_Orb` · `Icon_Orbit_Orb` | +1 orb → +speed → +1 orb → +radius |
| **Aura** | **Around the player**: constant damage zone that also pushes enemies back a little | `Proj_Aura` · `Icon_Aura` | +area → +damage → knockback → +area |

### Weapon upgrades (the building blocks of each level path)

| Upgrade | What it does | Card icon |
|---|---|---|
| **Amount** | +1 projectile per attack (more knives / bolts / orbs / strikes) | the weapon's own icon |
| **Pierce** | passes through N more enemies before disappearing (amount varies per weapon) | the weapon's own icon |
| **Rebound** | after a hit, bounces to the nearest other enemy (or off the screen edge for Boomerang) | the weapon's own icon |
| **Chain** | the hit jumps to a nearby enemy (Lightning only) | `Icon_Lightning` |
| **Area** | bigger hitbox / blast / puddle / slash | `Icon_Area` |
| **Damage** | +damage for that weapon only | the weapon's own icon |
| **Speed** | faster projectile / orbit | the weapon's own icon |
| **Duration** | effect stays longer (puddles, burns, orbs) | the weapon's own icon |

### Stat upgrades (global, apply to every weapon / to the player)

| Upgrade | Effect per level | Icon | Max |
|---|---|---|---|
| **Max HP** | +20 max health | `Icon_Max_HP` | 5 |
| **Move Speed** | +10% movement speed | `Icon_Move_Speed` | 5 |
| **Might** | +15% damage, all weapons | `Icon_Might` | 5 |
| **Cooldown** | weapons fire 10% faster | `Icon_Cooldown` | 5 |
| **Area** | +10% size of every hitbox / blast | `Icon_Area` | 5 |
| **Armor** | −1 damage per hit taken | `Icon_Armor` | 5 |
| **Regen** | heal 0.5 HP/s | `Icon_Regen` | 5 |
| **Magnet** | pick up XP from further away | `Icon_Magnet` | 3 |
| **Growth** | +10% XP gained | `Icon_Growth` | 5 |
| **Luck** | better drops (hearts, coins) and more rare cards | `Icon_Luck` | 5 |

Status in code: the level-up screen (`src/systems/upgrades.js`, PR #25)
offers Max HP, Move Speed, Might, Cooldown, Magnet and Knife. On `main` only
Magnet is applied. **PR #41** (chippe, in review) applies the other cards and
adds the Knife (`src/systems/knife.js`). The current auto-attack "pistol"
(`weapons.js`) behaves like Magic Bolt (nearest enemy) using the knife
sprite.

## UI we need

### Damage numbers

Every hit shows a small floating number at the point of impact so the player
can read the fight at a glance:

- **Damage dealt** - pops over the enemy when a projectile or melee hit
  lands. Bigger font for crit-scale hits (later). Rise + fade, then gone.
- **Damage taken** - pops over the player (and over the tower when the
  tower is hit) in a different color (red for damage to us, white for
  damage to enemies), so incoming pressure is visible without watching
  the HP bars.
- Numbers should reflect the **full damage calculation**, not the raw hit:
  a combination of base damage, player level, level-up stat bonuses,
  weapon level and weapon type, plus the aura buffs. To keep one source
  of truth, every weapon computes its projectile `damage` through one
  shared helper that takes those factors in - damage numbers then just
  display what that helper produced.
- Implementation notes: spawn as short-lived text objects on the existing
  hit events (`on("hit", "projectile", …)` for dealt, the player/tower
  hurt paths for taken); pool or cap the count so 100 enemies hitting at
  once don't spawn 100 texts. Tuning (lifetime, rise speed, cap, font
  sizes) goes in `src/config.js` (`DAMAGE_NUMBERS`).

### HUD redesign (the top-of-screen strip)

The current HUD is a row of plain text on the top edge. It should become a
real interface:

- **HP orb (Diablo-style)** - a round vial on the left of the HUD bar:
  the filled "liquid" height shows current HP vs the orb's full height as
  max HP, red liquid on a dark glass background, with the numeric value
  (e.g. `72/100`) overlaid. The orb replaces the flat HP bar for the
  player.
- **HP bars are green-to-empty, not red.** The current bar reads as "full
  health" when red and drops to black - invert that: full = green, low =
  amber/red, empty segment dark gray (never pure black). Applies to the
  player bar if kept alongside the orb, the tower bar, and enemy HP bars.
- **Weapon / level / XP get proper UI slots**, not free text: a weapon
  icon + level pips for the current weapon, the level number in a badge,
  and the XP bar attached to it (XP fills the slot's underline). Coin
  count gets an icon too. Goal: the top strip reads left→right as
  `HP orb · weapon+XP slot · wave/level center · coins/kills right`, all
  in icon+number form.

### Screen layout / camera

- The **player should be centered on screen**, not parked top-center.
  Either center the camera on the player (small look-ahead offset in the
  move direction is fine) or make the play view fill the screen with a
  proper **top navigation/info bar** (the redesigned HUD strip above)
  instead of text floating over the playfield.
- **Portrait on phones.** The web player currently letterboxes the
  1280x720 view, which stays widescreen (and tiny) on a phone in
  portrait. If feasible, switch the mobile layout to a portrait-friendly
  view: pick a portrait design resolution (e.g. 720x1280), detect a
  narrow/portrait screen and swap the game's aspect + HUD arrangement
  accordingly (HUD strips along the top/bottom, joystick bottom center).
  Desktop keeps the widescreen letterboxed view. If a full portrait
  layout is too much, a middle ground is asking the player to rotate
  the phone (with an on-screen hint), but a real portrait layout is the
  goal.

### Pause

A pause toggle (**Space or Esc**) freezes the whole game behind a small
overlay ("PAUSED - press Esc to resume"): enemies, spawns, wave timer,
weapons, regen and the survival timer all stop, while the HUD and overlay
keep rendering. Pausing during the shop or the level-up screen is a no-op
(those already hold the game). It never pauses on the game-over screen -
from there only Restart works.

### Game over screen (with run stats)

Shown when the run ends (the tower is destroyed, `"run-over"` event). The
game stops behind it (dimmed), and the screen shows:

- **Why the run ended**, e.g. "Your tower fell on wave 7".
- **Run stats:**
  - waves survived, bosses defeated;
  - time survived;
  - enemies killed;
  - player deaths (and the highest respawn step reached);
  - player level reached;
  - coins earned, plus the shop picks taken (e.g. "Active offense ×3,
    Passive defense ×1"), so the player sees which build they played.
- **Minimap or compass** (Akram): a small corner minimap (base = gold
  diamond, player = white dot, enemy dots) or, if the minimap reads
  poorly, a compass arrow near the player that always points at the base.
  Complements the base-under-attack arrow, which only speaks up when the
  tower is being hit.
- **Best run** for comparison (waves survived), stored in the browser.
  "New best!" if this run beat it.
- **Restart** button (also Space / Enter, and tap on mobile): starts a fresh
  run from wave 1 with a plank, no reload needed.

Stats are counted during the run by the systems that already know them
(enemy deaths, the cycle director, respawn, shop). The game over screen only
reads them.

### Base under attack

The player is often away from the base, so they must always know when it is
being hit and how much HP it has left:

- **Tower HP bar in the HUD**, always visible, next to the player's HP. It
  flashes when the tower takes damage.
- **Hit flash on the tower** itself (brief red tint) and a small HP bar
  above it.
- **Off-screen arrow**: when the base is off-screen, an arrow at the screen
  edge points toward it. Normally it's quiet; while the base is being
  attacked it turns red and pulses.
- **"Base under attack!" banner** at the top of the screen when the tower
  starts taking damage. It shows again only after the tower has been left
  alone for a few seconds, so it doesn't spam.
- **Danger state** when the tower drops below ~25% HP: a red pulse around
  the screen edges and a stronger arrow, so the player knows to go home now.
- **Art direction for path visuals** (Akram, ComfyUI asset generation):
  upgrade paths grow visually distinct per tier - offense paths drift
  toward red with tier, defense paths toward white/gray; actives get an
  aggressive silhouette (spikes/horns), passives stay soft-cornered.
  First asset passes by Akram.
- **While the player is dead**, the respawn countdown is shown next to the
  tower HP bar, so they can watch whether the tower will hold until they're
  back.

## The golem awakening flow (revising the run structure)

The base starts as an **inert golem statue**, and the run opens in classic
survivors mode. This changes the early game and adds a golem identity pick:

- **Wave 1 is player-only.** Enemies attack only the player, and the
  statue ignores (and is ignored by) them. Losing this wave is a real
  run-over - **no respawn yet**, deaths only become a respawn timer once
  the golem is awake and is your life total.
- **At the end of wave 1** the golem reanimates, and the player picks
  **1 of 3 golem styles** for this life:
  - **Guardian** (passive-centered): defensive auras and shields,
    protects the player while they roam near it.
  - **Berserker** (offense-centered): fights mobs itself - swipes,
    charges, kills for you.
  - a third style (open - e.g. **Warden**: crowd-control/slow, or
    **Summoner**: spawns helpers). To iterate with playtests.
- The style **can't be changed until you die** (new run = new pick), so
  the choice shapes the whole run like the shop quadrants do.
- **Golem self-defense (all styles, built in):** a Minecraft-golem-style
  **AOE knockback swipe** - anything that hits the golem gets flung far
  away (optionally a small amount of damage). Reason: without it the
  golem is guaranteed to die once enough mobs surround it; the swipe
  keeps the ring of enemies at bay so the tower's death is a slow
  pressure race, not an instant loss.
- **Wave-1 alternative (not decided - don't build unless we agree the
  golem mechanic isn't fun early):** keep the statue as a pure
  **respawn point**; the golem "activates" fully after wave 5 instead.
  Parked until playtested.
- **Golem skill tree (later, needs wave-5+ pacing):** after roughly 5
  waves with a golem style picked, spend currency on **per-style skill
  trees** - e.g. Berserker unlocks a flamethrower or lifesteal (the
  more enemies it damages/kills, the more HP you/the golem regain);
  Guardian unlocks stronger auras/shields. The existing shop-pick
  upgrades and the tree should not duplicate each other - shop = generic
  power, tree = style identity.
- **Upgrade UI rework:** the current golem upgrade interface is rough.
  Rebuild it as the skill tree UI, **keyboard-driven** (keys 1–9 per
  node, visible key hints on each node), same interaction style as the
  level-up screen.

Open question for review: do golem styles *replace* the 2×2
passive/active shop grid, or sit on top of it as a separate layer?
(Working answer: sit on top - the shop stays generic; the golem style is
the run's identity pick.)

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
    committed - so gimmick teaches, next run adapts).
- Losing condition: **the tower is destroyed** (see "Lose condition + player
  respawn"). Player death only starts the respawn timer.

## What stays from v1 (built or in flight)

- Movement + touch joystick + infinite gray-zone ground (done, PR #5).
- Enemy chase + spawn director + levels + drop events (done, PR #6).
- XP gems, level-up pick-1-of-3, HUD - still wanted *during* field waves.

## New build order (delta on top of the above)

1. **Base entity + shop scene** - a base object at a fixed home location;
   portal at wave end; shop UI with the 2×2 grid (one pick per cycle).
2. **Cycle director** - wave N in field → clear → portal → shop → wave N+1.
   Reuses Mickael's director with a "wave" wrapper.
3. **Passive aura system** - growing-radius aura comps; read `docs/tasks.md`
   contract (tags) for implementation.
4. **Active defense (HP regen tick)** - flesh out: regen X HP every Y s
   in-range; maybe an on-take-damage shield proc as upgrade tiers rise.
5. **Active offense (player-tethered tower)** - targetable base, tower HP,
   death = run death.
6. **Player respawn ladder** - player death = timer instead of game over;
   step up per death, step down per wave cleared / boss defeated.
7. **Smart enemy targeting** - focus the weaker target, else split between
   player and tower (see "Enemy targeting").
8. **Base-under-attack UI** - tower HP bar, hit flash, off-screen arrow,
   banner, danger state (see "UI we need").
9. **Game over screen + stats + restart** - listens to `"run-over"`.
   **Weapons & upgrades** (see "Weapons & upgrades catalog") can be built in
   parallel with 6–9: first wire the existing stat cards, then add weapons
   one per PR (one file each under `src/systems/`, like `knife.js`).
10. **Boss wave + gimmick** - last; keep one boss, one gimmick for MVP.

## Open questions (brainstorm residue)

- Does XP-leveling stay per-wave (resets each cycle) or persist across the
  run? (Leaning: persists; shop picks are the per-cycle power gain.)
- Can the player skip the shop (save coins for a bigger pick)? Bank or not?
- ~~Is the tower always on the map, or only after the active-offense pick?~~
  **Decided: the base is the tower.** It has HP from the start of the run,
  enemies attack it, and its destruction ends the run. The active-offense
  pick makes the base itself shoot and levels it up.
- Coins vs XP as the shop currency - both exist already in the asset pack.
- Are the 4 shop options fixed every cycle, or does the pool grow with
  unlocks? (Fixed = readable; growing = roguelite.)
