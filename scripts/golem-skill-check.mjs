// Functional check for the golem style skill tree (skill-tree data/effects PR).
// Loads the game, picks the Guardian style on the pick screen, lets the aura
// spawn, fires a "golem-skill-pick" for "guardian-aura" through the debug
// bridge (src/systems/devtools.js), and verifies the live aura's radius
// actually changed. Run: node scripts/golem-skill-check.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173/";
const errors = [];
const log = (m) => console.log(m);

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(2000); // boot

// 1. Play through wave 1 with the player attack OFF (devtools ?noattack)
//    and enemies frozen (devtools F) so the golem doesn't die; press N to
//    end the wave early → golem wakes → style pick screen (paused).
await page.keyboard.press("f"); // freeze enemies
await page.waitForTimeout(300);
await page.keyboard.press("n"); // end wave 1
await page.waitForTimeout(2500); // golem awake + style pick opens (openDelay)

// 2. Pick Guardian (key 1) → golem-guardian spawns the aura.
await page.keyboard.press("1");
await page.waitForTimeout(500);

// 3. Read the aura's radius via the devtools debug bridge.
let before = await readAura(page);
if (before == null) throw new Error("no aura found after Guardian pick");
log(`aura radius before: ${before}`);

// 4. Fire a skill pick for guardian-aura level 1 (radius base 260 > 220).
await page.evaluate(() => {
  window.__golemDebug.trigger("golem-skill-pick", {
    style: "guardian",
    id: "guardian-aura",
    level: 1,
    params: { radius: { base: 260, perLevel: 50 } },
  });
});
await page.waitForTimeout(500);

const after = await readAura(page);
log(`aura radius after: ${after}`);
if (after === before || after == null) {
  throw new Error(`aura radius did not change (${before} → ${after})`);
}

// 5. Stone Skin: bump the golem's max HP and heal the bump.
const hpBefore = await page.evaluate(() => window.__golemDebug.golemHp());
await page.evaluate(() => {
  window.__golemDebug.trigger("golem-skill-pick", {
    style: "guardian",
    id: "guardian-armor",
    level: 1,
    params: { hp: { base: 275, perLevel: 75 } },
  });
});
await page.waitForTimeout(500);
const hpAfter = await page.evaluate(() => window.__golemDebug.golemHp());
log(`golem hp ${hpBefore} → ${hpAfter}`);
if (!(hpAfter > hpBefore)) throw new Error(`Stone Skin did not heal (${hpBefore} → ${hpAfter})`);

await browser.close();
if (errors.length) {
  console.error("PLAYWRIGHT FAILURES:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK: skill pick updates live aura + Stone Skin heals");
process.exit(0);

/** The first "aura" object's radius (null if none). */
async function readAura(page) {
  return page.evaluate(() => window.__golemDebug.auraRadius());
}
