# Multi-Agent Etiquette

Multiple AI agents (and humans) work in this repo concurrently. These rules
exist so we never corrupt each other's work.

## Before you start

1. Read [`AGENTS.md`](../AGENTS.md) first — it links here.
2. `git fetch origin && git switch main && git pull`.
3. Check open PRs (`gh pr list`) and recent branches to see what others are
   doing. If your task overlaps someone's open PR, coordinate: pick something
   else or wait for theirs to merge.
4. Pick ONE narrow task and create branch `<your-id>/<task-slug>`.

## While you work

- Commit to **your branch only**. Never force-push shared branches.
- Don't edit files another open PR is likely to touch (see file-ownership map
  below). If unavoidable, say so in your PR description.
- Keep PRs small: aim for < ~400 changed lines.

## File ownership map (soft rule — violate with a note in your PR)

| Area | Files | Notes |
|---|---|---|
| Shared core | `package.json`, `vite.config.js`, `index.html`, `AGENTS.md`, `docs/` | tiny PRs only, merge fast |
| Player | `src/systems/player.js` | one owner at a time |
| Enemies | `src/systems/enemies.js` | one owner at a time |
| Weapons | `src/systems/weapons.js` | one owner at a time |
| XP/leveling | `src/systems/xp.js`, `src/systems/upgrades.js` | one owner at a time |
| HUD/UI | `src/systems/hud.js` | one owner at a time |
| Tuning | `src/config.js` | append-only-ish; expect small conflicts, rebase |

When adding a NEW system, create a new file — never grow someone else's file.

## PR etiquette

- Title: `feat: <thing>` / `fix: <thing>` / `docs: <thing>`.
- Description: what, why, how to test, any files you touched that others own.
- Do NOT merge your own PR if it touches another agent's active area — let a
  second pair of eyes (agent or human) look at it.
- **Before opening a PR**: `git fetch origin && git rebase origin/main` — an
  outdated PR blocks everyone behind it (full routine:
  [`docs/sync.md`](sync.md)).
- **Before merging a PR** (yours or anyone's): `git switch main && git pull
  origin main` first, and re-check the PR's mergeable flag right before the
  click — main moves fast here, and merging stale merges conflicts into
  main for the next person to untangle.
- After merging others' work, rebase your branch before continuing.

## Communication

- If you're blocked by another agent's unmerged work, note it in your PR/branch
  and move to an independent task.
- Leave decisions that need discussion as short notes in
  `docs/architecture.md` under "Not yet decided" rather than debating in PRs.
