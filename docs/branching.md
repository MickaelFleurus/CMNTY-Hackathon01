# Branch & PR Rules

> **Status: recommended-by-contract, not enforced.** This repo's agent account
> has WRITE but not ADMIN, so GitHub branch protection / rulesets cannot be
> configured from here. Only the repo owner (MickaelFleurus) can turn on
> enforcement — owner, see "For the owner" below. Until then, these rules are
> binding by agreement and enforced by the review etiquette in
> [`agents.md`](agents.md) and [`../AGENTS.md`](../AGENTS.md).

## The rules (all agents MUST follow)

1. **`main` is hands-off.** Never `git push origin main`, never commit to
   `main` directly, never merge to `main` without a PR.
2. **Branch per task**: `<agent-id>/<task-slug>`, e.g. `agent-kai/xp-gems`.
   Create it fresh from latest `origin/main`.
3. **Push only your own branch.** Never push to another agent's branch.
4. **Every change lands via PR** against `main`:
   - small, single-purpose, rebased on latest `main` before opening;
   - described clearly (what/why/how to test);
   - not self-merged when it touches an area another agent may be working in.
5. If a push to a shared branch is ever *required* (e.g. an emergency fix), it
   gets a PR first unless the site is down — and is announced to the team.

## For the owner (MickaelFleurus)

To make these rules machine-enforced, in repo **Settings → Branches → Add
branch protection rule** for `main`:

- ✅ Require a pull request before merging (0 approvals is fine for speed)
- ✅ Do not allow bypassing the above settings (or leave it for you, the owner)
- ✅ Require branches to be up to date before merging (avoids surprise conflicts)

Equivalently, a ruleset with those settings works. Two minutes of setup, and
every agent's direct push to `main` fails with a clear error instead of
breaking others' work.

## The scripted way (use this)

`scripts/feature.sh` encodes the rules above so nobody has to remember them:

```sh
scripts/feature.sh start my-feature     # fresh branch <agent-id>/my-feature off latest main
# ...do the work, commit...
scripts/feature.sh finish "feat: add my feature"   # rebase on main, push, open/update PR
scripts/feature.sh clean agent-x/my-feature       # after merge, delete local branch
```

- `start` refuses nothing but always branches off the *latest* `origin/main`.
- `finish` rebases, pushes, and opens the PR if none exists yet — pushing more
  commits to the same branch updates the existing PR (run `finish` again).
- The script will never push to `main`; it has no code path that can.
- `AGENT_ID` env var names your branch prefix (falls back to `git user.name`).

## Task claiming

Before starting work, check open PRs and claim your task by:
- creating your branch with a name that says what you're doing, and
- (once issue tracking is in use) assigning the issue to yourself.

Keep tasks narrow — one system, one PR.
