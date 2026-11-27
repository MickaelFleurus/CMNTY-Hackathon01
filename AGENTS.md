# AGENTS.md — Agent Instructions

**You are an agent working on this repo alongside other agents and humans.**

This file is your entry point. **Read it before doing anything.**

## Core workflow (non-negotiable)

1. **Never commit or push directly to `main`.** `main` is the integration
   branch and must remain stable. All work goes through a feature branch and a
   pull request. Full rules: [`docs/branching.md`](docs/branching.md).
2. **One branch per feature/task.** Branch naming: `<agent-or-name>/<short-task-slug>`
   (e.g. `agent-kai/enemy-spawning`). If several agents work on similar areas,
   include your unique id in the branch name so branches never collide.
   **Easiest way:** `scripts/feature.sh start <slug>` creates the branch for
   you (and `scripts/feature.sh finish` rebases, pushes, and opens the PR).
   Details: [`docs/branching.md`](docs/branching.md).
3. **Before starting work**, `git fetch origin && git switch main && git pull`
   so you're on the freshest `main`, then create your branch from it.
4. **Commit early, push often** to your own branch. Never push to someone
   else's branch without asking.
5. **When done**, open a PR against `main` with a clear title + description
   of what changed and why. Do not merge your own PR unless you're confident
   it doesn't conflict with others' work in flight.

## Read the docs before coding

Context lives in `docs/`. **Read the relevant files there before touching
code** — they explain the game design, architecture, and conventions. Start
with:

- [`docs/game-design.md`](docs/game-design.md) — what we're building (game concept)
- [`docs/architecture.md`](docs/architecture.md) — how the code is organized
- [`docs/conventions.md`](docs/conventions.md) — coding style, commit, and PR rules
- [`docs/agents.md`](docs/agents.md) — multi-agent etiquette (avoiding conflicts)
- [`docs/branching.md`](docs/branching.md) — branch/PR rules (why you can't push to `main`)
- [`docs/sync.md`](docs/sync.md) — pull/rebase routine to avoid merge conflicts
- [`docs/assets.md`](docs/assets.md) — the Survivors Starter Kit sprite pack (what's in it, how to load it)

If a doc is missing or unclear, improve it in your PR — docs are first-class
code here.

## Project snapshot

- **What we're building:** a top-down, web-based "Vampire Survivors"-style
  survival game using the [KAPLAY](https://kaplayjs.com/) JS game library and
  Vite.
- **Stack:** JavaScript (ES modules), KAPLAY (`kaplay` npm package), Vite for
  dev server + bundling.
- **Run locally:** `npm install && npm run dev`, then open the printed URL.
- **Current state:** minimal scaffolding — a player rectangle that moves and
  a placeholder enemy. Everything else is to be built.

## Conflict avoidance (the important part)

Multiple agents may be active at once. To not step on each other:

- **Claim your task before you start.** If there's a task list, check it and
  add yourself; if not, pick a narrow scope and say so in your branch/PR.
- **Keep changes small and focused** — one feature per branch. Huge PRs are
  hard to review and conflict-prone.
- **Avoid editing shared files** (`index.html`, `package.json`, `vite.config.js`,
  `AGENTS.md`, `docs/*`) unless that IS your task. If you must, do it in a
  separate tiny PR.
- **New systems in new files.** If you're adding an enemy type, weapon, UI
  element, etc., put it in its own module under `src/` and import it from
  `src/main.js` (or a scene file) — don't append to someone else's file.
- **Before opening a PR**, `git fetch origin && git rebase origin/main` on your
  branch to resolve conflicts early on your side.

## Reporting

When you finish a task (or get blocked), report clearly: what you did, what
branch/PR it's on, what's next, and any blockers.
