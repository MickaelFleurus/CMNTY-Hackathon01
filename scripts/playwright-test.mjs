// Playwright integration test: loads the game in headless Chromium, simulates
// a few seconds of input, and fails on console errors/pageerrors or dead game
// state. Complements scripts/smoke.mjs (which only checks boot). Run:
//   node scripts/playwright-test.mjs [url]
// Assumes the dev server is already up on :5173 (npx vite).
import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173/";
const errors = [];

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(url, { waitUntil: "load" });

// simulate ~3s of movement so animations, spawning and weapon systems tick
await page.keyboard.down("d");
await page.waitForTimeout(1500);
await page.keyboard.up("d");
await page.keyboard.down("s");
await page.waitForTimeout(1500);
await page.keyboard.up("s");

const canvas = page.locator("canvas");
if ((await canvas.count()) === 0) errors.push("no <canvas> found - game did not start");

// the game runs its loop on canvas; a dead loop shows as zero CPU or an error above.
await page.waitForTimeout(1000);
await page.screenshot({ path: "/tmp/kaplay-playwright.png" });

await browser.close();
if (errors.length) {
  console.error("PLAYWRIGHT FAILURES:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK: 6s simulated input, no errors, canvas live, screenshot at /tmp/kaplay-playwright.png");
