# Keeping Your Branch Fresh (Sync Discipline)

Most merge conflicts are preventable. They happen when a branch sits on an old
`main` while other branches merge around it. The fix is a habit, not a tool:

## The rule

**`git pull origin main` at the START of every work session, and AGAIN
immediately before opening a PR.**

The pre-PR pull is the important one — it's what keeps PRs small and
conflict-free at merge time.

## The routine

```sh
# start of session
git switch main
git pull origin main
git switch <your-branch>
git rebase main          # or merge, team's choice — rebase keeps history linear

# ...work, commit, push...

# before opening a PR (or pushing new commits to an open one)
git fetch origin
git rebase origin/main   # resolve conflicts HERE, on your side, not at merge time
git push --force-with-lease   # needed only if you rebased pushed commits
```

`scripts/feature.sh finish` already does the fetch + rebase + push part for
you — use it and the pre-PR sync is automatic.

## Why rebase instead of merge

- Keeps `main` history linear and readable.
- Conflicts surface one commit at a time on your machine, where you have
  full context — not in a PR where the author must guess.
- If you dislike rebase, merging `main` into your branch is acceptable; just
  do it *before* the PR, never inside it.

## Before merging someone else's PR

The PR author's rebase guarantees *their* branch is current — but main can
move again while you review. Before clicking merge:

```sh
git switch main
git pull origin main
git fetch origin          # refresh the PR's head too
# then merge in the GitHub UI or with `gh pr merge <n> --merge`
```

If the PR flipped to CONFLICTING while you reviewed, don't merge it — ping
the author to rebase again. GitHub's mergeable flag is refreshed on page
load; check it right before the click, not from memory.

## Force-push etiquette

After a rebase of a pushed branch you must force-push. Always
`git push --force-with-lease` (never bare `--force`) — it refuses to
overwrite commits someone else pushed to your branch since your last fetch.

## When conflicts are expected

`src/config.js` is the shared tuning file everyone appends to — small
conflicts there are normal; rebase and keep both sides. Files in the
ownership map (`docs/agents.md`) shouldn't conflict at all if you follow it.

## One-line version

**Start of session: pull. Before PR: fetch + rebase. Never bare force-push.**
