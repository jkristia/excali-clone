---
name: squash-commits
description: Squash all pending (unpushed) commits on the current branch into one commit. Suggests a commit message summarizing the changes; pass a message as an argument to use it directly instead of being asked.
argument-hint: [commit message]
allowed-tools: [Bash]
---

# Squash Commits

Squashes every commit on the current branch that hasn't been pushed yet into a single commit.

## Arguments

`$ARGUMENTS` — optional. If provided, use it verbatim as the commit message and skip the suggestion step. If omitted, suggest a message and wait for the user to confirm or edit it before squashing.

## Instructions

1. **Find the pending commits.**
   - Determine the upstream with `git rev-parse --abbrev-ref --symbolic-full-name @{u}`. If there is no tracking branch, ask the user what to squash against (e.g. `origin/main`) before continuing.
   - Run `git fetch` to make sure `<upstream>` reflects the actual remote state before checking anything — a stale local tracking ref is the one way this skill could misjudge what's already pushed.
   - List commits ahead of upstream: `git log --oneline <upstream>..HEAD`.
   - If `git log --oneline <upstream>...HEAD` (triple-dot) shows commits on both sides, the branches have diverged (someone else pushed) — stop and tell the user instead of squashing.
   - If there are 0 or 1 pending commits, tell the user there's nothing to squash and stop.
   - If the working tree isn't clean (`git status`), stop and tell the user to commit or stash first — never squash over uncommitted changes.

2. **Determine the commit message.**
   - If `$ARGUMENTS` is non-empty, use it as-is as the final commit message and skip to step 3.
   - Otherwise, draft a one-line summary (plus optional short bullet body) of the pending commits:
     - Base it on the substantive commits — features, fixes, behavior changes.
     - Leave trivial/noise commits (e.g. "update readme", "wip", "fix typo", "formatting") out of the description text itself — they still get folded into the squash, just not called out by name.
     - Show the suggested message to the user and wait for them to confirm it or give a replacement. Do not run the squash until they respond.

3. **Squash.**
   - Step 2 can involve an arbitrary wait for the user's response, so the fetch from step 1 may be stale by now — repeat the fetch and divergence check right before mutating anything: `git fetch`, then re-run `git log --oneline <upstream>...HEAD` and stop if it shows commits on both sides.
   - `git reset --soft <upstream>`
   - `git commit -m "<final message>"`
   - Run `git log --oneline -1` and `git status` and show the result to the user.

## Notes

- This only rewrites local, unpushed history — the `git fetch` + divergence re-check right before the squash (steps 1 and 3) ensures "already pushed" is judged against the real remote state, not a stale local ref, even if the user takes a while to confirm the message in step 2.
