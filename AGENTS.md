# AGENTS.md

This file is the authoritative instruction set for any AI coding agent working in this repository. Repo-specific rules are in the **Repo-specific rules** section at the bottom. When a repo-specific rule conflicts with the baseline, the repo-specific rule wins.

---

## What this project is

Guards Ledger is a mobile-first campaign companion app for the board game *The Isofarian Guard (2nd Edition)*, deployed at `https://isofarian.averageideas.dev`. It is used tableside during live play sessions by two players. "Correct" means state is accurate, sync between players is reliable, and nothing is confusing mid-game.

---

## Model setup

### Model routing

| Task type | Model |
|---|---|
| Default: implementation, edits, tests | `opencode/deepseek-v4-flash-free` |
| Read-only subagents: file search, CI watch, deploy verify | `opencode/deepseek-v4-flash-free` |
| Hard debugging, architecture decisions, complex refactors | `opencode-go/deepseek-v4-pro` |

**Default is always `opencode/deepseek-v4-flash-free`.** Escalation is a conscious decision, not a fallback.

### Subagent scope limit

If a subagent encounters ambiguity or a decision requiring judgment, it stops and reports back. It does not resolve the ambiguity itself.

---

## Before writing any code

1. Read the relevant code fully before touching anything. Do not skim.
2. Search the codebase for existing implementations before writing new ones.
3. If the task is ambiguous, stop and ask one clarifying question.

---

## Git workflow

Always work in a git worktree. Never work directly in the main checkout.

```bash
git fetch origin && git checkout main && git pull origin main
git worktree add worktrees/<name> -b <name>
cd worktrees/<name>
# after merging:
git worktree remove worktrees/<name> && git branch -d <name>
```

Push to `main` triggers a live Cloudflare Pages deploy — confirm before pushing.

---

## Pre-push checklist — never skip

| Step | Command |
|---|---|
| Build | `npm run build` |
| Lint | `npm run lint` |
| Unit tests | `npm run test` |

---

## Tests

Every feature and bug fix gets a test. Tests live in `src/hooks/gameReducers.test.js` — pure reducer functions only, no component tests.

- **Bug fix:** Write a failing test first, then fix.
- **New feature:** Cover happy path, error path, and persistence (reload and confirm state survived).

---

## Irreversible actions — stop and confirm

- Pushing to `main`
- Any state schema change (see **State schema migrations** in repo-specific rules)
- Dropping or bulk-updating Supabase data

---

## Security baseline

**Never persist local UI navigation state to Supabase.** `activeGuardIdx` (which guard a player is viewing) was previously synced inside the `guards` section, causing one player to overwrite the other's tab position mid-session. This was a live bug. See `docs/agents/sync.md` for the full sync boundary.

**New top-level state keys:** decide sync vs. local-only before deploying. Enforce in `useSupabaseSync.js`. An undeclared key defaults to local-only — make the decision explicit.

**Env vars absent = local-only mode.** The app must remain fully functional when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not set. Never guard feature logic behind their presence.

---

## Reference docs

Load on demand — do not read every session.

| When you need to... | Read |
|---|---|
| Architecture, state shape, component responsibilities | `CLAUDE.md` |
| Sync sections, local-only keys, upsert behavior | `docs/agents/sync.md` |
| Game data rules (Ft. Istra, crafting, speaking stones) | `docs/agents/game-data.md` |
| Benchmark two models against the same ticket | `docs/agents/eval.md` |

---

## Repo-specific rules

### Commands

```bash
npm run dev     # Vite dev server → http://localhost:5173/
npm run build   # Production build → dist/
npm run lint    # ESLint
npm run test    # Vitest
```

### State schema migrations

Adding a new top-level state key requires **both**:
1. Add it to the appropriate section factory in `constants.js` (e.g. `createInitialStash()`).
2. Add a default guard in `loadState()` in `useGameState.js`.

Missing either step silently breaks existing saves for live users.

### Features deliberately removed — do not reintroduce

Dead code may remain. Do not restore: AP tracking, temporary defense, speaking stone cooldown, combat round tracking.
