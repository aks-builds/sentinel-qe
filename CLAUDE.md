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

**Phase:** Mirror v1 (Days 16–22) — Phase 3.
**Day completed:** Day 21
**What was built:**
- **`ConversationSession`** (`sentinel_engine/playwright_service/conversation.py`): a context manager holding one persistent Playwright page across multiple turns — `send_message(text)` fills the input, clicks send, waits for that turn's response element via a `data-turn` counter selector (deterministic, never a fixed sleep), returns the extracted text. Two factory functions, `chatgpt_session()`/`claude_session()`, pre-configure genuinely different selectors per product.
- **Two fixture pages** (`tests/fixtures/chatgpt_fixture.html`, `claude_fixture.html`), each with its own element IDs/classes and a small embedded JS handler that appends a numbered canned reply on click — real DOM interaction, fully offline and deterministic.
- **`POST /mirror/ui/conversation`**, DI'd the same way Day 20's `/mirror/ui/navigate` already is (`get_conversation_runner`) — no test in the suite launches a real browser. 75/75 engine tests passing (66 pre-existing + 9 new).
- **No subagent dispatch this day either** — same small-sequential-chain judgment as Day 20 and Day 12.
- **Live-verified with real multi-turn conversations against both fixtures** — direct calls (`chatgpt_session` sent 2 messages, got back turn-1 and turn-2's distinct correct replies, not a stale one; `claude_session` sent 1 message and got its own correctly-different reply from an independent browser/page) and through the actual running HTTP endpoint (`curl POST /mirror/ui/conversation` against the ChatGPT fixture, 2 messages, both responses correct). This is the "conversation state" verification the design spec's line 41 calls for. Used `Path.resolve().as_uri()` for every fixture URL per Day 20's Windows `file://` lesson — no repeat of that bug.

**Notes:**
- No external provider API keys still exist — unrelated to today.
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 21's commits haven't been pushed yet.
- **This closes out the automation-building half of Phase 3.** Day 22 is the last Mirror v1 day — wiring what Days 16-21 built into an actual UI toggle.

---

## Next Session — Day 22

**Plan file:** `docs/superpowers/plans/2026-07-18-day22-mirror-ui-suite-builder.md` *(to be written)*

**Goal:** Mirror UI test suite builder with an API-vs-UI mode toggle, per the design spec's Phase 3 Day 22 deliverable — **the last day of Phase 3 (Mirror v1, Days 16-22)**.

**Architecture decisions locked in:**
- Surface Days 20-21's engine endpoints (`/mirror/ui/navigate`, `/mirror/ui/conversation`) from the web app — likely a new `/api/mirror/ui/*` proxy route in `apps/web`, generalizing the existing Day 14 proxy pattern (`/api/probe/critique/[type]` → engine) rather than inventing a new one.
- Day 19's `RecordRunForm` already covers "API mode" (manual/already-computed results). Day 22's toggle adds a second, genuinely new "UI mode" path that drives the Day 21 fixture-based conversation flow through the new proxy route — both modes end up writing to the same `MirrorResult` rows Day 18 already persists, so no schema changes should be needed.
- Still fixtures-only for UI mode (no real ChatGPT.com/Claude.ai, no real test accounts) and still no external provider API keys for API mode — both gaps carried forward unchanged, not Day 22's job to close.
