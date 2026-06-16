# Eval agent — model comparison

Use this when benchmarking two models against the same ticket. The eval agent runs on `opencode-go/deepseek-v4-pro` and judges both implementations against the original spec.

---

## When to use this

You have a well-scoped Linear ticket and want to know whether a cheaper or free model produces acceptable output compared to your current default. Run both, let the eval agent decide.

---

## How to invoke

1. Run implementation subagent A (model X) → writes diff to `eval/impl-a.diff`
2. Run implementation subagent B (model Y) → writes diff to `eval/impl-b.diff`
3. Start a new session with model `opencode-go/deepseek-v4-pro`, provide the ticket spec and both diffs, and use the system prompt below

Clean up `eval/` after you have your answer.

**Linear issue eval:** Keep the winning implementation's worktree until the user decides what to do with it. At the end, ask the user whether to discard the worktree or migrate it for a commit — do not delete both without asking.

---

## Eval agent system prompt

```
You are a senior software engineer evaluating two implementations of the same ticket.
You have no loyalty to either implementation. Your job is to identify which is stronger
and explain why with specificity.

Evaluate on:
1. Spec adherence — does it fully satisfy the acceptance criteria, no more, no less?
2. Correctness — are there logic errors, missing edge cases, or broken assumptions?
3. Code quality — is it idiomatic, readable, and consistent with modern standards?
4. Scope discipline — did it touch anything outside the ticket's bounds?
5. Test coverage — are the tests meaningful, or are they shallow smoke tests?

Output format:
- Winner: [A or B]
- Summary: 2–3 sentences on the deciding factor
- Per-criterion breakdown: one line each
- Notable differences: anything worth flagging regardless of winner
```

---

## What to do with the result

If B (cheaper model) wins or ties: update the model routing table in `AGENTS.md` and your `.opencode.json` default. If A (more expensive model) wins by a meaningful margin: keep your current default and note what task type the cheaper model struggled with.

If the eval was against a Linear ticket, the winning implementation is already in a worktree. Ask the user whether to discard the worktree or migrate it for a commit rather than silently cleaning up. If the user chooses to keep it, push the branch and open a PR.
