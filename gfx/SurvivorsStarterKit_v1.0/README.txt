SURVIVORS STARTER KIT  v1.0
16x16 pixel art for Survivors-like / bullet heaven games
=====================================================

WHAT'S INSIDE
  Enemies/      34 enemies, 16x16 - Move (4), Hit (2), Death (6)
  Bosses/       6 bosses, 32x32 - Move (4), Attack (4), Hit (2), Death (8)
  Heroes/       4 heroes, 16x16 - Idle (4), Walk (4), Hit (2), Death (6)
  Weapons/      11 animated projectiles + 20 upgrade icons (16x16)
  Pickups/      12 pickups, 4 frames each (XP gems, coins, heart, meat, chest, magnet, bomb, clock...)
  Effects/      6 effects (hit spark, poof, explosion, level up, heal, sparkle)
  Tiles/        4 ground sets (Grass, Dungeon, Snow, Sand): 4 seamless variants + 4 decorated tiles each
  Atlas/        everything in one PNG + JSON (TexturePacker JSON-Hash format, with an "animations" list)
  animations.json   sheet layout, frame counts and suggested FPS for every file
  Preview/      animated previews

SHEET LAYOUT
  Character sheets (Enemy_*.png, Boss_*.png, Hero_*.png): one animation per row, frames left to right.
    Enemy:  row 1 Move, row 2 Hit, row 3 Death            (cell 16x16)
    Boss:   row 1 Move, row 2 Attack, row 3 Hit, row 4 Death (cell 32x32)
    Hero:   row 1 Idle, row 2 Walk, row 3 Hit, row 4 Death  (cell 16x16)
  Every animation is also exported as a separate horizontal strip in the Strips/ folders.
  Projectiles, pickups and effects are horizontal strips.

TIPS
  * Use nearest-neighbour / point filtering and integer scaling (x2, x3, x4) to keep pixels crisp.
  * Heroes face right and projectiles point right: flip or rotate them in the engine.
  * Hit frame 1 is a white flash, frame 2 a red-tinted recoil. Death frames end empty - remove the sprite after.
  * Suggested FPS: Move 8, Walk 10, Idle 6, Attack 8, Hit/Death 12, pickups 6, effects 12.
  * Aura (Proj_Aura.png) is semi-transparent on purpose - draw it under the hero.
  * Outline colour everywhere is #221830, so all sprites read on light and dark ground.

ENEMY LIST
  Bat, Skull, Slime, Ghost, Rat, Zombie, Skeleton, Shroom, Goblin, Mummy, Cultist, Snowman, Cactus,
  Crystal Golem, Spider, Beetle, Crab, Imp, Crow, Bee, Grimoire, Pumpkin, Toad, Mimic, Eyeball,
  Flame Skull, Candle, Jelly Cube, Jellyfish, Worm, Snake, Biter Plant, Wisp, Magma Slime

BOSSES: Slime King, Stone Golem, Vampire Lord, Reaper, Demon Lord, Treant
HEROES: Knight, Wizard, Ranger, Cleric
PROJECTILES: Knife, Axe, Boomerang, Holy Water Flask, Holy Water Flames, Lightning, Whip, Orbit Orb, Magic Bolt, Aura, Fireball
ICONS: Knife, Axe, Lightning, Whip, Holy Water, Boomerang, Orbit Orb, Magic Bolt, Aura, Fireball, Might, Armor, Max HP, Regen, Move Speed, Magnet, Cooldown, Area, Luck, Growth
PICKUPS: XP Blue, XP Green, XP Red, XP Purple Big, Coin, Coin Bag, Heart, Meat, Chest, Magnet, Bomb, Clock
EFFECTS: Hit Spark, Poof, Explosion, Level Up, Heal, Sparkle

LICENSE
  See LICENSE.txt - use in personal and commercial games, no resale of the assets themselves.

Made by Sneznyj 3D - https://sneznyj.itch.io
