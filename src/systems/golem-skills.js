// Golem style skill nodes (docs/game-design-v2.md → "Golem skill tree"):
// per-style branches for the shop tree (shop.js). Each node is
//   { id, name, desc, icon, maxLevel, params }
// and the shop shows only the picked style's nodes, firing
// "golem-skill-pick" { style, id, level, params } on buy. The effect
// systems (golem-berserker / golem-guardian / golem-warden) consume it.
//
// The shop keys 1-4 per branch (shop.js); the shared price
// SHOP.upgradeCost and the one-upgrade-per-break rule are unchanged.

// Berserker (owner: golem-berserker.js): the melee identity. Nodes deepen
// the two berserker attacks: swipes fling harder and faster, charges land
// harder and more often.
const BERSERKER = [
  {
    id: "berserker-swipe",
    name: "Furious Swipe",
    icon: "icon-might",
    desc: "Swipes fling enemies harder\nand recover faster.",
    maxLevel: 5,
    params: {
      swipeRadius: { base: 190, perLevel: 15 },
      swipeForce: { base: 900, perLevel: 120 },
      swipeDamage: { base: 10, perLevel: 4 },
      swipeInterval: { base: 2.5, perLevel: -0.25, min: 1.2 },
    },
  },
  {
    id: "berserker-charge",
    name: "Seismic Charge",
    icon: "icon-lightning",
    desc: "Charges land harder, reach\nfurther and strike sooner.",
    maxLevel: 5,
    params: {
      chargeDamage: { base: 16, perLevel: 5 },
      chargeRadius: { base: 110, perLevel: 10 },
      chargeForce: { base: 1100, perLevel: 100 },
      chargeReach: { base: 240, perLevel: 20 },
      chargeInterval: { base: 5, perLevel: -0.4, min: 3 },
    },
  },
  {
    id: "berserker-growth",
    name: "Growing Fury",
    icon: "icon-armor",
    desc: "All berserker damage scales\nsteeper with each wave.",
    maxLevel: 3,
    params: {
      damageGrowth: { base: 0.35, perLevel: 0.1 },
    },
  },
];

// Guardian (owner: golem-guardian.js, from GOLEM_GUARDIAN's keys).
const GUARDIAN = [
  {
    id: "guardian-aura",
    name: "Wider Aura",
    icon: "icon-armor",
    desc: "Protective aura reaches\nfurther and slows harder.",
    maxLevel: 5,
    params: {
      radius: { base: 220, perLevel: 40 },
      enemySlow: { base: 0.75, perLevel: -0.05, min: 0.5 },
    },
  },
  {
    id: "guardian-shield",
    name: "Deep Shield",
    icon: "icon-regen",
    desc: "Shield absorbs more and\nholds longer after you leave.",
    maxLevel: 5,
    params: {
      shield: { base: 15, perLevel: 5 },
      shieldDuration: { base: 6, perLevel: 1 },
    },
  },
];

// Warden (owner: golem-warden.js, from GOLEM_WARDEN's keys).
const WARDEN = [
  {
    id: "warden-field",
    name: "Vast Field",
    icon: "icon-armor",
    desc: "Slow field reaches further\nand slows the horde more.",
    maxLevel: 5,
    params: {
      radius: { base: 260, perLevel: 35 },
      enemySlow: { base: 0.6, perLevel: -0.05, min: 0.4 },
    },
  },
  {
    id: "warden-pulse",
    name: "Faster Pulse",
    icon: "icon-lightning",
    desc: "Pulses strike sooner and\nslow much harder.",
    maxLevel: 5,
    params: {
      pulseInterval: { base: 4, perLevel: -0.4, min: 2 },
      pulseSlow: { base: 0.3, perLevel: -0.04, min: 0.1 },
    },
  },
];

const SKILLS = {
  berserker: BERSERKER,
  guardian: GUARDIAN,
  warden: WARDEN,
};

/** The picked style's skill nodes, or null before a pick (shop shows the
 * "golem wakes soon" empty state). */
export function getGolemSkills(style) {
  return SKILLS[style] ?? null;
}
