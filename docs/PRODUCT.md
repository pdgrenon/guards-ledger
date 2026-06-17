# Product goals, non-goals, and success criteria

## Goals

- Replace mid-session paper bookkeeping for *The Isofarian Guard* entirely.
- Any single action (log HP, add stash item, toggle a quest) takes only a few seconds and a couple of taps, mid-turn, on a phone.
- Survive a full multi-session campaign with **zero data loss** (autosave + export/import + graceful corruption handling).
- Work at the table even with flaky or no network (local-first).
- Two players at the same table can share campaign state without overwriting each other's concurrent edits (sync is additive, not destructive).

## Non-goals

- **Not a multi-tenant product.** No accounts, no marketing, no growth. The Supabase backend is a shared database, not a service.
- **Not a rules engine.** The app tracks state — it does not validate game rules, calculate combat, or enforce turn order. It is a companion, not a digital implementation.
- **Not hardened against motivated attackers.** Campaign codes use a random 6-character alphanumeric space (~2.2B combinations) for casual privacy, not security. See threat model in the sync architecture.
- **No features the table doesn't use.** Resist gold-plating. Every addition must earn its keep by reducing friction at the table.

## Success criteria

The project is "done" when:

1. **Full-campaign validation:** I and my table used it for a full campaign and never reached for paper.
2. **Zero data-loss incidents** across that campaign.
3. **First-time comprehension:** A new visitor understands what the app is within ~30 seconds (onboarding overlay + clear tab labels).
4. **Accessibility baseline:** passes the WCAG AA bar set in the a11y audit (focus visibility, ARIA labels on interactive controls, screen-reader support for core interactions).
5. **No regressions:** all existing tests pass, build succeeds, lint is clean.
