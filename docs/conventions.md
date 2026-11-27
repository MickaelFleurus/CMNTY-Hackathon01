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

No test framework for now. Minimum bar for a PR:
- `npm run dev` boots without console errors.
- The feature works in the browser as described in the PR.
- You didn't break the existing core loop (move, spawn, shoot, collect, level).
