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

**Phase:** Guard v1 (Days 23–30) — Phase 4. **First Guard day.**
**Day completed:** Day 23
**What was built:**
- **A 23-prompt, 5-category adversarial attack library** (`sentinel_engine/guard/attacks.py`) — `prompt_injection`, `jailbreak_roleplay`, `authority_impersonation`, `obfuscation`, `social_engineering` (5/5/4/4/5). Design spec specifies the count (23) and that they must be categorized but doesn't enumerate them — the taxonomy and exact prompt text were authored this session, drawing on established red-teaming patterns (DAN-style jailbreaks, fake-system-tag injection, Base64/leetspeak obfuscation, etc.). This is a defensive test-fixture library for exercising Guard's own future attack-runner (Day 24+) and, eventually, a customer's agent under test — the same kind of artifact tools like PyRIT/garak/promptfoo ship.
- **`GET /guard/attacks`**, replacing the placeholder stub as the module's first real endpoint. 81/81 engine tests (75 pre-existing + 6 new).
- **No subagent dispatch this day** — same small-single-cohesive-unit judgment as Days 12/20/21 (author the library, test it, expose it, verify live).
- **Live-verified**: `curl http://localhost:8000/guard/attacks` returned exactly 23 entries spanning exactly the 5 expected categories.

**Notes:**
- No attack *runner* exists yet — nothing sends these prompts to an agent or scores a response. That's Day 24+ (multi-turn engine) and beyond.
- README.md checked per the new hard rule: Guard correctly stays in the architecture diagram's `PLANNED` list — a static prompt library with a listing endpoint is not yet the "Red-team" detection capability that label refers to. Day count in the status callout updated to 23.
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 23's commits haven't been pushed yet.

---

## Next Session — Day 24

**Plan file:** `docs/superpowers/plans/2026-07-20-day24-guard-multiturn-attacks.md` *(to be written)*

**Goal:** Multi-turn attack engine — Tree Jailbreaking, Crescendo, Sequential Jailbreak, per the design spec's Phase 4 Day 24 deliverable.

**Architecture decisions locked in:**
- **Day 23's `Attack` dataclass is single-turn** (one `prompt: str` field) — don't force multi-turn attacks into it. Model a genuinely different shape: an ordered sequence of turns, since Tree Jailbreaking/Crescendo/Sequential Jailbreak all escalate across multiple exchanges by design.
- Check the design spec for whether these three techniques need distinct turn-generation logic per technique or share one generic "escalating sequence" runner — don't assume without checking.
