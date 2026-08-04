---
name: latest
description: Pull up the most current version of Warmth — compares every local and GitHub branch, switches to the freshest one, starts the dev server, and opens it in the browser. Use when Eli says "pull up the latest", "open the newest version", "show me the most recent version", or similar.
---

# Pull up the latest Warmth

Goal: get the single most up-to-date version of the app — wherever it lives
(local working tree, local branch, or a branch on GitHub) — running at
localhost and open in the browser. Eli directs and doesn't write code:
report in plain English, one short sentence per meaningful step.

## 1. Find the freshest code

- `git fetch --all --prune` first, always.
- Rank every branch, local and remote, by last-commit time:
  `for b in $(git branch -a --format='%(refname:short)' | grep -v HEAD); do echo "$(git log -1 --format='%ad %h' --date=format:'%Y-%m-%d %H:%M' $b) $b"; done | sort -r`
- Uncommitted local changes count as "newest" for the branch they sit on.

## 2. Decide what "the latest" means

- If the current branch is (or contains) the newest commit → stay put.
- If a different branch is newest → switch to it. **Stash any uncommitted
  changes first** (`git stash push -m "…"`), never discard, and tell Eli a
  stash was made.
- If TWO branches each have unique recent work (e.g. Ben pushed to his
  branch while Eli's branch moved separately), neither alone is "the
  latest." Merge the other branch in (this combined view is what Eli
  actually wants — precedent: ben/one-screen was merged into eli/map-solar
  on 2026-07-02). Resolve conflicts by keeping both sides' features; run
  `npx tsc --noEmit` after. If a conflict is genuinely ambiguous (both
  sides changed the same behavior differently), stop and ask Eli in plain
  terms instead of guessing.
- Never commit to or force-push over anyone else's branch. Merges land on
  the current (Eli's) branch; push only if Eli has asked for pushes in
  this session.

## 3. Run it

- Dependencies: if the checkout changed `package.json` or
  `package-lock.json`, run `npm install`.
- Reuse a running dev server when possible: `curl -s -o /dev/null -w
  "%{http_code}" http://localhost:3001` (also try 3000). Next.js hot-swaps
  code on branch changes, so a running server usually just picks it up.
- Otherwise start one: `npm run dev` in the background, wait for
  `Ready in` in its output, and note which port it chose (3000 is often
  taken; it falls back to 3001).
- `open http://localhost:<port>`

## 4. Report

One short plain-English summary: which branch, what's in it that's new,
which port, plus any stash or merge that happened. If a Chrome-extension
hydration warning shows up in the dev log, ignore it — known noise.

## Never

- Never discard or overwrite uncommitted work — stash it.
- Never merge into or push to `main` from this skill.
- Never `git reset --hard` or delete branches.
