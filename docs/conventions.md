# Conventions

## Git

- **Never push to `main`.** Branch per task: `<agent-or-name>/<short-slug>`.
- Commit messages: short imperative summary line, e.g. `add enemy chase AI`.
  Group related changes; don't mix refactors with features.
- Before opening a PR: `git fetch origin && git rebase origin/main`.
- PRs target `main`, one feature each, with a title + 2–5 line description
  (what changed, why, how to test).

## Code style

- Plain JS ES modules, 2-space indent, no build-time lint config yet — match
  the style of existing files.
- **No magic numbers.** Tuning values (speeds, timers, spawn rates, HP, XP)
  live in `src/config.js` as named constants and are imported from there.
- KAPLAY globals (`add`, `onKeyDown`, `onCollide`, `pos`, ...) are used as-is;
  system modules export functions, don't run top-level side effects except
  where the pattern demands it (e.g. a `scene()` registration file).
- Prefer KAPLAY built-ins (components, timers, events, camera) over hand-rolled
  equivalents.

## Assets

- Placeholder art: colored `rect()`s with `outline()` are fine during MVP.
- Real assets go in `assets/`; keep individual files small (<200KB) for now.
- Never commit generated/binary junk (`dist/`, `node_modules/`, OS junk).

## Testing / verification

Run `npm test` — it chains both gates (on the hackathon machine use
`/usr/bin/npm test`; the nvm-shimmed npm doesn't run scripts). Both need the
dev server on :5173 (`npx vite` in a background terminal):

1. **`scripts/smoke.mjs`** — boots the game in headless Chromium for ~10s,
   fails on any console error/pageerror. Catches KAPLAY runtime crashes
   (missing sprites, component dependency errors) that `vite build` misses.
2. **`scripts/playwright-test.mjs`** — simulates ~6s of real keyboard input,
   asserts the game canvas exists, saves a screenshot to
   `/tmp/kaplay-playwright.png`. Catches "boots but doesn't play" bugs.
   First run needs `npx playwright install chromium`.

Screenshot tip for agents: read `/tmp/kaplay-playwright.png` after the test
to visually verify the game actually rendered (player visible, enemies
chasing, HUD ticking) instead of trusting "no errors".

Minimum bar for a PR: both gates pass + the feature works as described in
the PR + you didn't break the core loop (move, spawn, shoot, collect, level).
