# Sentinel — Daily Session Context

## What This Project Is
Sentinel is a self-hosted enterprise AI Quality Engineering platform.
Five modules: Probe (agent testing), Mirror (external AI product testing),
Guard (security), Cognify (cognitive benchmarking), Reach (accessibility).

Full spec: `docs/superpowers/specs/2026-06-26-sentinel-design.md`

## Session Protocol
- **Start every session:** Read this file. Read the plan for the current day.
- **End every session:** Update the "Current Status" and "Next Session" sections below.

---

## Current Status

**Phase:** Probe v1 (Days 6–15)
**Day completed:** Day 14
**What was built:**
- **`SpanCritique`**: a manual, on-demand "Critique this span" action rendered per row in `TraceWaterfall`. Picks one of the four Days 11-13 detector types, fills in whatever fields it needs (pre-filling `selected_tool`/`parameters_valid`/`parameter_errors` from a `tool_call:*` span's own `attributes` when available), and shows the result as a `Badge` + raw JSON. Deliberately manual/ephemeral, not automatic or persisted — resolved with the user before building: none of the four detectors can run against real trace data automatically, since the SDKs never capture the reasoning/context/message content they need, and extending the SDKs to do so is out of scope for this day.
- **`POST /api/probe/critique/[type]`**: a thin, auth-gated web route that proxies to `{ENGINE_URL}/probe/hallucination/{type}` — the first time the browser-facing app actually calls the Python engine for something beyond the Day 4 health check.
- `getSpansForTrace` (Day 10) now also returns each span's parsed `attributes`.
- Built via 1 round of 3 parallel worktree-isolated tracks (ClickHouse attributes, the proxy route, the UI — all fully disjoint) with zero wiring needed afterward: `page.tsx` already passes `getSpansForTrace`'s result straight through to `TraceWaterfall`, so extending both independently composed automatically.
- Tests: 74/74 vitest passing (67 pre-existing + 7 new). Type-check clean.
- **The live smoke test surfaced the most important finding of the whole hallucination-engine arc (Days 11-14), and it revises Days 11-13's conclusions, not just adds to them.** Re-running the SAME unambiguous inputs multiple times through the real `llama3.2:3b` (not single-draw testing like Days 11-13 did) shows **all four detectors** have a real false-positive rate, not just Execution's "naming" quirk from Day 12:
  - **Execution**, given an obviously-correct tool selection, was wrong or unparseable **4 out of 7** times (57%) — sometimes claiming `search_orders` "doesn't support looking up order history" (factually false — that's its exact stated purpose), sometimes failing to produce the `CORRECT_TOOL:` line at all.
  - **Reasoning**, given a trivially true 2-step chain ("capital of France is Paris"), came back `hallucination_detected: true` on a retest, with nonsensical reasoning ("user input lacks sufficient context," "contradicts an earlier statement" — there was no such contradiction).
  - **Perception** was solid on repeat testing (3/4 correct across this session's two rounds) but still had one outright unparseable response.
  - Communication wasn't re-tested this session (Day 13's single draw was clean); treat that as unconfirmed at scale, not as a fourth "reliable" data point.
  - **Revises the Day 11-12 lesson** ("boolean-ish verdicts are reliable, naming a correct answer is not") — that was true *directionally* but understated how often even the boolean verdicts themselves come back wrong or unparseable. `llama3.2:3b` is a genuinely unreliable judge at this task, not just imprecise at one sub-task.
- **Practical implication, not yet acted on:** anyone using `SpanCritique` today should expect a meaningful chance of a wrong verdict on any single click, especially for Execution. A production version of this feature would need either a bigger/better model, a lower temperature, majority-vote-over-N-samples, or surfacing the parse-failure case distinctly from a real negative verdict in the UI (right now both look identical: a `destructive` badge). None of this was fixed today — Day 14's job was the UI plumbing, and this finding was made via that plumbing, not something to silently patch without the user weighing in on which fix (if any) is worth the added cost/complexity.

**Notes:**
- Ollama + `llama3.2:3b` still running/pulled from Day 11 — no re-setup needed, but see the reliability finding above before trusting its verdicts for anything real.
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 14's commits haven't been pushed yet.

---

## Next Session — Day 15

**Plan file:** `docs/superpowers/plans/2026-07-11-day15-probe-cicd-gate.md` *(to be written)*

**Goal:** Probe CI/CD gate — GitHub Action, threshold config, PR comment posting, per the design spec's Phase 2 Day 15 deliverable. **Last day of Phase 2** — Phase 3 (Mirror v1, Days 16-22) begins after this.

**Architecture decisions locked in:**
- **The judge reliability finding above is directly relevant to Day 15's threshold-gate design.** A CI gate that blocks merges on "hallucination rate > X%" needs to account for a judge that's wrong or unparseable a meaningful fraction of the time on its own — consider whether Day 15 needs a way to distinguish a genuine detected hallucination from a parse-failure/judge-uncertainty case (right now they're indistinguishable in the API response), or whether that's explicitly deferred with the gate treating both the same for now (a defensible MVP choice, but should be a stated decision, not an oversight).
- Mirror's live-site-automation scope constraint (design spec §13, fixtures not live sites for Days 20-21) becomes relevant starting Day 16, not this day.
- This is the last day before Phase 3; there's no Day 16 architecture note carried over yet since Mirror v1 hasn't been scoped in detail beyond the spec's own day-by-day table.
