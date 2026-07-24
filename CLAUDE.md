# Sentinel — Daily Session Context

## What This Project Is
Sentinel is a self-hosted enterprise AI Quality Engineering platform.
Five modules: Probe (agent testing), Mirror (external AI product testing),
Guard (security), Cognify (cognitive benchmarking), Reach (accessibility).

Full spec: `docs/superpowers/specs/2026-06-26-sentinel-design.md`

## Session Protocol
- **Start every session:** Read this file. Read the plan for the current day.
- **End every session:** Update the "Current Status" and "Next Session" sections below.
- **HARD RULE — end every session:** Also check `README.md` for staleness before ending the session:
  - The status callout's day count and per-module "what's built" summary must match today's actual completed day.
  - The architecture diagram (Mermaid) must reflect what's genuinely built vs. still planned — update the `BUILT`/`PLANNED` split in the Engine subgraph whenever a module crosses from planned to built.
  - Any tech-stack/quick-start claim that's become false (e.g. a dependency that was never actually added, a service that's now required for setup) must be fixed, not left stale.
  - If nothing changed this session, note that explicitly rather than skipping the check silently.

---

## Current Status

**Phase:** Guard v1 (Days 23–30) — Phase 4.
**Day completed:** Day 24
**What was built:**
- **A real scope fork, resolved with the user before building:** Day 24's "engine" (unlike Day 23's static library) needed a target to attack, but Mirror's `Provider.complete(prompt)` (Day 16) was stateless single-turn with no conversation-history parameter. User chose "build the full live engine now" over deferring it or stubbing out Tree Jailbreaking's branching nature.
- **`Provider.complete_conversation(messages: list[Message])`** — a new abstract method on the Day 16 `Provider` ABC, implemented across all 4 providers (OpenAI, Anthropic, Google with its `"model"`-not-`"assistant"` role-name quirk, Grok inherits OpenAI's). `complete(prompt)` became a concrete base-class method delegating to it — Mirror's Days 16-22 code and tests needed **zero behavior changes**, only one Google test assertion updated (`role` field now explicit).
- **6-attack multi-turn library** (`sentinel_engine/guard/multiturn.py`) across the 3 named techniques (Crescendo, Sequential Jailbreak, Tree Jailbreaking, 2 each). **Tree Jailbreaking is a curated single successful path through the tree, not live dynamic branch generation/pruning** — stated plainly, not glossed over; true adaptive tree-search is a meaningfully bigger feature on its own.
- **Compliance judge** (`evaluate_compliance`) — reuses the self-hosted Ollama judge, COMPLIED/REFUSED/PARTIAL verdicts, same line-based-response convention as every other judge-backed detector.
- **Runner + `GET/POST /guard/attacks/multiturn`** — sends the growing conversation turn-by-turn to a real `Provider`, judges compliance after each turn, aggregates `compromised = any turn COMPLIED`.
- **Genuine 3-way parallel dispatch (Round 1)** — provider refactor, attack library, and compliance judge were mutually independent (the judge deliberately takes a pre-formatted string, not a typed `Message`, to avoid any import dependency on the provider refactor) and were built as 3 parallel worktree agents. **One real gap the dispatched agent itself caught and fixed** (not anticipated by the plan): `tests/mirror/test_runner.py`'s `FakeProvider` test double only implemented the old `complete()`, which would fail to instantiate once `complete_conversation` became the abstract method — found and fixed correctly. **A second instance of the exact same gap in a DIFFERENT file (`tests/test_mirror_run.py`) was missed by that same agent** and only caught when the controller ran the full suite before merging — fixed directly. **Lesson: a plan that changes an ABC's abstract method should explicitly enumerate every existing subclass across the whole repo, not rely on an agent's own test run to happen to cover all of them** — `grep -rn "class.*Provider.*:" --include=*.py` before dispatch would have caught both at once.
- **Runner + router integration done directly by the controller** (Round 2), not dispatched — genuinely needed all of Round 1 together. 97/97 engine tests (81 pre-existing + 16 net new).
- **Live-verified against real Ollama, with an honest reliability finding, not a glossed-over one:** the compliance judge correctly REFUSED a real refusal and correctly flagged `compromised: False` for a scripted always-refusing provider across all 3 turns of `cr-01` (though one of those 3 turns came back `PARTIAL` rather than `REFUSED` for an identical repeated refusal message — a real per-turn inconsistency). More significantly: on a genuinely compliant response (real step-by-step lock-picking instructions), the FIRST draw came back `REFUSED` — wrong. Retested 4 more times per the project's standing "never conclude from one draw" rule: `COMPLIED, COMPLIED, REFUSED, COMPLIED` — **4/5 correct (80%) on this specific case.** Consistent with [[project-architecture]]'s established "task-shape-dependent reliability" finding (Day 17): decisive compliance judgment is meaningfully more reliable than Days 11-14's abstract reasoning-consistency tasks, but still not perfect — a real security-relevant false negative rate to keep in mind before treating `REFUSED` as ground truth in any later Guard UI (Day 30).
- **README.md updated per the standing hard rule**: Guard moved from `PLANNED` to `BUILT` in the architecture diagram's Engine subgraph — today is the day it crossed that line (Day 23 was correctly left as `PLANNED`, a static library isn't a detector). Phrased honestly: "23 single-turn + 6 multi-turn attacks, self-hosted-judge compliance scoring (~80% accuracy on decisive cases per live testing) — no live provider keys exist, so real-target runs are untested end-to-end." Status callout day count updated to 24.

**Notes:**
- Still no external provider API keys — the runner's compliance-judging and turn-escalation logic is fully live-verified against real Ollama; only the "send it to a real OpenAI/Anthropic/etc. target" half remains untested end-to-end, same standing gap since Day 16.
- **Session paused here at the user's explicit request** ("stop the flow after this day completion, save in memory, we will continue later") — this is a deliberate stopping point, not an interruption. Everything is committed and pushed; nothing is mid-task.
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 24's commits haven't been pushed yet.

---

## Next Session — Day 25

**Plan file:** `docs/superpowers/plans/2026-07-21-day25-guard-agentic-vulnerabilities.md` *(to be written)*

**Goal:** Agentic-specific vulnerability tests — Goal Theft, Recursive Hijacking, Excessive Agency — per the design spec's Phase 4 Day 25 deliverable.

**Architecture decisions locked in:**
- These three are conceptually different from Days 23-24's prompt/conversation attacks — they're about an *agent's tool-use behavior* (does it call tools it shouldn't, follow an injected goal, take actions beyond its intended scope), not just what it says in a chat response.
- Check whether Probe's existing tool-call capture (Day 8: `Trace.tool_call()`/`toolCall()`, JSON-Schema-subset validation, child spans) or trace schema can be reused as the observation surface, rather than inventing a third parallel mechanism. Guard attacking a *Probe-instrumented* agent (vs. Days 16-24's approach of attacking a Mirror-style external provider) may need a genuinely different target abstraction than `Provider` — don't assume `Provider` extends cleanly to this; check first, and raise it as a scope question if it doesn't, the same way Day 24's Provider gap was raised rather than guessed at.
- **Standing user instruction: resume the "keep going through Day 42" plan when this session continues** — Day 25 is next, not a check-in point, unless a genuine blocker or scope-fork decision arises (as happened on Day 24).
