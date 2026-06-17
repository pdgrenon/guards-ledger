# The Guard's Ledger — Product case study

A tableside campaign companion for *The Isofarian Guard (2nd Edition)* board game.
**Live at [isofarian.averageideas.dev](https://isofarian.averageideas.dev)**

---

## Problem

*The Isofarian Guard* is a campaign-driven board game with significant mid-session bookkeeping: eight playable guards each with independent HP, equipment, satchel inventory, and chip bags; six cities with prestige tracking and quest checkboxes; a 60+ item party stash; stonebound cube placement across the map; and a sprawling campaign log of events, plans, and milestones.

Playing with paper means:
- Frequently erasing and rewriting guard HP as combat ebbs and flows
- Remembering which materials are in the stash vs. in a guard's satchel when crafting
- Manually tracking who has which equipment and whether stat bonuses are applied correctly
- Losing track of which quests are complete in which city
- Crossing out and re-writing campaign plans as the story branches

None of this is hard — it's just friction. And friction adds up over a 20+ session campaign.

---

## Target user

Me, and the 1–2 other people at my table. This is a scratch-your-own-itch project, built for a specific use case: two players, one phone or tablet per player, sharing a single campaign state over a Supabase backend.

I'm honest about the scope. This is not a market play, not a SaaS pivot, and not trying to be a digital implementation of the game. It's a focused tool for a specific table. That constraint is a strength — it means every decision is measured against "does this make our next session better?" rather than "does this unlock a new audience?"

---

## Goals and non-goals

See [`docs/PRODUCT.md`](docs/PRODUCT.md) for the full breakdown. In summary:

**Goals:** Replace paper entirely for a full campaign. Every action takes seconds on a phone. Zero data loss. Works offline. Two players edit simultaneously without conflicts.

**Non-goals:** Not a multi-tenant product. Not a rules engine. Not hardened security. Not feature-crept beyond what the table uses.

---

## Key decisions and tradeoffs

### Per-guard column split, but not for everything

Guard state is split into one database column per guard (`guard_0` through `guard_7`). This means two players can edit different guards at the same time without conflict — one adjusts Grigory's HP while the other manages Alek's equipment, and neither overwrites the other.

The initial impulse was to generalize this: split every section (resources, cities, campaign) into its own granular rows. We did the analysis ([AVE-89](https://linear.app/average-ideas/issue/AVE-89), [91](https://linear.app/average-ideas/issue/AVE-91), [92](https://linear.app/average-ideas/issue/AVE-92)) and decided against it. Guards are genuinely independent — two players touch different guards simultaneously. Resources, cities, and campaign are not; players edit them one at a time by social convention. Splitting those sections would add complexity with no real benefit.

**Decision:** One durable field-level merge ([AVE-94](https://linear.app/average-ideas/issue/AVE-94)) handles concurrent edits for non-guard sections. Guards get the dedicated column treatment because the concurrency pattern is real.

### Local-first architecture

The app loads and runs entirely from a static build. All state lives in `localStorage`. A Supabase backend provides multiplayer sync, but it's fully optional — the app works identically without it.

This means:
- Zero server dependency for core functionality
- No loading states, no network errors in the critical path
- The backend is a sync bus, not a source of truth

The tradeoff is that conflict resolution happens client-side: the last writer wins at the field level. For a two-player table game played physically in the same room, this is the right call — the social layer (talking to each other) resolves any ambiguity.

### Derived-not-stored discipline

Prestige (derived from three boolean quest fields per city) and equipment stat bonuses (derived from equipped item names) are never persisted. They are computed on every render. This eliminates an entire class of state-drift bugs where derived data falls out of sync with its source.

The cost is trivial recomputation on every render. Worth it.

### "First draft" preserved as a deployable artifact

The `first-draft` branch holds an early snapshot of the codebase and is deployed to its own URL via GitHub Pages. This is intentional — it exists so anyone can compare the earliest working version against the current build and see the growth. A literal "show your work" artifact.

### One-stack discipline

The entire app is React 19 + Vite + a single CSS file. No state library (no Redux, no Zustand, no Context beyond prop drilling). No UI framework. No external component libraries. This is a deliberate constraint — it keeps the dependency surface small, the build fast, and every line of code auditable.

---

## What I cut and why

### Column-split generalization

Cancelled. The complexity of splitting resources, cities, and campaign into granular rows didn't earn its keep given the actual concurrency pattern at the table.

### AP tracking, temporary defense, speaking stone cooldowns

Removed. These were tracked in early versions but the table never used them mid-game. They added visual noise. Keeping them would violate the "no features the table doesn't use" non-goal.

### Combat round tracking

Same story: built once, never referenced during play. Removed.

### Campaign-code security hardening

The original campaign codes used a 4-character alphanumeric space (~1.7M combinations) which was trivially brute-forceable. We widened it to 6 characters (~2.2B combinations) — enough for casual privacy at the table. Full auth (passwords, rate-limiting) was considered and cut. The threat model is "someone at the next table in the game cafe guesses your code," not "targeted attack."

### Sentry source maps

Sentry error monitoring is integrated, but source maps are not uploaded automatically — the org/project setup and auth token configuration was deferred. The monitoring catches errors with minified stack traces; source map support is parked for when it causes actual debugging friction.

### Accessibility in modals

Focus trapping and return-focus-on-close were scoped but cut from the accessibility pass. The modals (confirm dialog, onboarding, material source popup) have `role="dialog"`, `aria-modal`, `aria-label`, and Escape-to-close, but Tab cycling and focus restoration are not yet implemented. The impact was considered low for a tableside app used on a touchscreen.

---

## Outcome

The app is live and functional at `isofarian.averageideas.dev`. It replaces paper entirely for our table across all tracked sections: guards, cities, stash, stonebound, campaign plans, and crafting reference.

**What's good:**
- Local-first means zero friction — open the URL, start playing
- Multiplayer sync works reliably with value-based echo suppression
- The derived-not-stored approach has eliminated an entire category of bugs
- The craft tab, with its combined stash+satchel inventory and prestige discounts, is genuinely useful at the table

**What I'd do next:**
- **Encounters tab** (partially blocked on data entry) — a reference for enemy stats and encounter rewards, reducing book lookups mid-game
- **Goals tracker** — lightweight session objectives that players can set and check off
- **Source map upload** for Sentry — actionable stack traces when errors surface in the wild
- **Full a11y focus trapping** in modals — a polish item that would complete the WCAG AA pass

---

## Screenshots

*Screenshots of each tab (Guards, Cities, Stash, Crafting, Campaign, Log) in phone viewport, showing populated state from the demo save, would go here.*

*Before/after comparison of the `first-draft` branch vs. current build could also be effective here to show visual and functional evolution.*
