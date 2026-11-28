// Golem style pick screen + the "golem-style-pick" event (docs/game-design-v2.md
// → "The golem awakening flow"). When the golem wakes (first wave-end), the game
// pauses and the player picks 1 of 3 styles for this life. The pick fires:
//
//   getTreeRoot().trigger("golem-style-pick", { style })
//
// where style is "guardian" | "berserker" | "warden". Guardian/Berserker
// behaviors live in their own systems (golem-guardian.js / golem-berserker.js);
// they listen for this event. Warden is a placeholder (locked card).
//
// Interaction mirrors the level-up screen (upgrades.js): paused root, fixed()
// UI, manual hit-testing (hover/click don't fire while paused), keys 1-3.
import { GOLEM_STYLES } from "../config.js";

const STYLES = [
  {
    id: "guardian",
    name: "Guardian",
    desc: "Defensive auras and a shield that protect you while you roam near the golem. The stay-home build - exploring is riskier.",
    key: "1",
  },
  {
    id: "berserker",
    name: "Berserker",
    desc: "Fights mobs itself: swipes and charges, kills for you. Holds well alone - the explorer build. Go after chests.",
    key: "2",
  },
  {
    id: "warden",
    name: "Warden",
    desc: "Crowd control: slows and holds the horde. (Coming soon - locked for now.)",
    key: "3",
    locked: true,
  },
];

export function startGolemStyles() {
  const root = getTreeRoot();
  let open = false;

  const show = () => {
    const root = getTreeRoot();
    if (open || root.paused) return;
    open = true;
    root.paused = true;

    const ui = add([fixed(), z(1000), "golem-style-ui"]);

    // dim + title
    ui.add([
      rect(width(), height()),
      pos(0, 0),
      color(10, 8, 18),
      opacity(0.62),
    ]);
    ui.add([
      text("THE GOLEM WAKES - CHOOSE ITS STYLE", { size: 34, width: width() }),
      pos(width() / 2, 90),
      anchor("top"),
      color(GOLEM_STYLES.titleColor[0], GOLEM_STYLES.titleColor[1], GOLEM_STYLES.titleColor[2]),
    ]);
    ui.add([
      text("This choice lasts until you die. Keys 1-3, or click a card.", {
        size: 15,
        width: width(),
      }),
      pos(width() / 2, 136),
      anchor("top"),
      color(170, 170, 190),
    ]);

    // cards (same geometry as the level-up screen)
    const cw = GOLEM_STYLES.cardW;
    const ch = GOLEM_STYLES.cardH;
    const gap = 30;
    const startX = (width() - (STYLES.length * cw + (STYLES.length - 1) * gap)) / 2;
    const cy = height() / 2 - ch / 2 + 20;

    const cards = [];
    STYLES.forEach((s, i) => {
      const x = startX + i * (cw + gap);
      const card = ui.add([
        pos(x, cy),
        rect(cw, ch, { radius: 8 }),
        color(24, 22, 38),
        outline(3, rgb(120, 110, 160)),
        z(1),
      ]);
      card.add([
        text(s.name, { size: 26 }),
        pos(cw / 2, 26),
        anchor("top"),
        color(GOLEM_STYLES.titleColor[0], GOLEM_STYLES.titleColor[1], GOLEM_STYLES.titleColor[2]),
      ]);
      card.add([
        text(s.desc, { size: 14, width: cw - 40 }),
        pos(cw / 2, 72),
        anchor("top"),
        color(200, 200, 215),
      ]);
      card.add([
        text(s.locked ? "LOCKED" : `Press ${s.key}`, { size: 15 }),
        pos(cw / 2, ch - 40),
        anchor("top"),
        color(s.locked ? rgb(120, 100, 110) : rgb(255, 220, 90)),
      ]);
      if (!s.locked) cards.push({ s, x, y: cy });
    });

    // manual hit-testing (paused root: hover/click comps don't fire)
    const cardAt = (p) => cards.find((c) => p.x >= c.x && p.x <= c.x + cw && p.y >= c.y && p.y <= c.y + ch);

    let hover = null;
    const moveH = onMouseMove(() => {
      const c = cardAt(mousePos());
      if (c === hover) return;
      hover = c;
      cards.forEach((k) => {
        const card = ui.children.find((ch2) => ch2.pos.x === k.x && ch2.pos.y === k.y);
        if (card) card.outline.color = k === hover ? rgb(255, 220, 90) : rgb(120, 110, 160);
      });
    });
    const clickH = onMousePress(() => {
      const c = cardAt(mousePos());
      if (c) pick(c.s.id);
    });
    const keyH = onKeyPress("1", () => pick("guardian"));
    const keyH2 = onKeyPress("2", () => pick("berserker"));
    const keyH3 = onKeyPress("3", () => pick("warden"));

    function pick(styleId) {
      if (!open) return;
      open = false;
      root.paused = false;
      ui.destroy();
      moveH.cancel();
      clickH.cancel();
      keyH.cancel();
      keyH2.cancel();
      keyH3.cancel();
      getTreeRoot().trigger("golem-style-pick", { style: styleId });
    }
  };

  // The golem wakes at the end of wave 1 - show the pick right after the
  // wave-end fanfare (cycle.js needs a beat to finish its aftermath before
  // the screen freezes for the pick).
  root.on("golem-awake", () => {
    wait(GOLEM_STYLES.openDelay, show);
  });
}
