#!/usr/bin/env sh
# feature.sh — the one command agents use per feature, start to finish.
#
#   scripts/feature.sh start <task-slug>   -> fresh branch off latest main
#   scripts/feature.sh finish              -> rebase, push, open PR (or update it)
#   scripts/feature.sh clean <branch>      -> delete a merged local branch
#
# Branch naming: $AGENT_ID/<task-slug> (AGENT_ID env var; falls back to git user.name).
# Rules are in docs/branching.md. Never push to main directly — this script won't.
set -eu

REPO=origin
MAIN=main
cmd=${1:-}
case "$cmd" in
  start)
    slug=${2:?usage: feature.sh start <task-slug>}
    agent=$(printenv AGENT_ID || git config user.name || echo agent)
    branch="$(echo "$agent" | tr '[:upper:] ' '[:lower:]-')/$slug"
    git fetch "$REPO"
    git switch -C "$branch" "$REPO/$MAIN"
    echo "✓ on fresh branch $branch (off $REPO/$MAIN)"
    ;;
  finish)
    title=${2:-}
    git fetch "$REPO"
    git rebase "$REPO/$MAIN"
    git push -u "$REPO" HEAD
    if ! gh pr list --head "$(git branch --show-current)" --state open | grep -q .; then
      if [ -n "$title" ]; then
        gh pr create --base "$MAIN" --fill-first --title "$title"
      else
        gh pr create --base "$MAIN" --fill
      fi
      echo "✓ PR opened; push more commits to the same branch to update it"
    else
      echo "✓ pushed; existing PR updated"
    fi
    ;;
  clean)
    branch=${2:?usage: feature.sh clean <branch>}
    git fetch "$REPO"
    git switch "$MAIN"
    git pull --ff-only "$REPO" "$MAIN"
    git branch -D "$branch"
    echo "✓ local branch deleted (GitHub removes the remote branch on merge if enabled)"
    ;;
  *)
    echo "usage: feature.sh start <slug> | finish [PR-title] | clean <branch>" >&2
    exit 1
    ;;
esac
