// Headless smoke test: loads the game in headless Chromium, collects console
// errors/pageerrors for a few seconds, exits 1 if any. Run: node scripts/smoke.mjs [url]
import { spawnSync } from "node:child_process";

const url = process.argv[2] || "http://localhost:5173/";
const out = spawnSync(
  "chromium",
  [
    "--headless", "--disable-gpu", "--no-sandbox", "--enable-unsafe-swiftshader",
    "--virtual-time-budget=10000",
    "--enable-logging=stderr", "--v=0",
    "--dump-dom", url,
  ],
  { encoding: "utf8", timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
);

const log = out.stderr || "";
const errors = log
  .split("\n")
  .filter((l) => /CONSOLE/.test(l) && /"(error|warn)"/.test(l.toLowerCase()))
  .map((l) => l.trim());

if (out.status !== 0 && !out.stdout) {
  console.error("PAGE LOAD FAILED\n" + log.slice(-2000));
  process.exit(2);
}
if (errors.length) {
  console.error("CONSOLE ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK: no console errors on", url);
