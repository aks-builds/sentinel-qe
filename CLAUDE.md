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

**Phase:** Mirror v1 (Days 16–22) — Phase 3.
**Day completed:** Day 20
**What was built:**
- **Playwright wired into `apps/engine`**: `playwright` added to Poetry, Chromium browser binary installed locally (`poetry run playwright install chromium` — a one-time machine setup step, NOT captured by `poetry install` alone; a fresh clone needs to run this once before any Playwright-backed code, including its own live smoke test, will work).
- **`fetch_page_content(url) -> PageContent`** (`sentinel_engine/playwright_service/browser.py`): launches headless Chromium, navigates, extracts `title` + body `inner_text`, always closes the browser (even on navigation failure — the `finally` path is explicitly tested). Exposed via `POST /mirror/ui/navigate`, dependency-injected the same way `get_provider`/`get_judge` already are — tests override `get_page_fetcher`, no test in the suite launches a real browser. 66/66 engine tests passing (62 pre-existing + 4 new).
- **No subagent dispatch this day** — tight sequential chain (dependency install → wrapper → endpoint → smoke test), matching Day 12's "small, no parallelizable tracks" precedent. All done directly by the controller.
- **Deliberately did NOT touch ChatGPT.com/Claude.ai or build any page-object/conversation-flow logic** — that's Day 21's scope per the design spec's already-resolved §13 amendment (local fixtures first). Day 20 is purely the browser-automation primitive.
- **Live-verified with a real headless browser, twice**: once by calling `fetch_page_content()` directly against a static local fixture (`tests/fixtures/hello.html`) — got back the exact expected title and text; once through the actual running HTTP endpoint (`poetry run uvicorn` + `curl POST /mirror/ui/navigate`) — same correct result. Both proved the real mechanism (launch → navigate → extract → close) works, independent of any Day 21 fixture-specific work.
- **Real gap found and fixed during the live check, worth remembering for Day 21:** a POSIX-style `file:///c/Users/...` path (what Git Bash naturally produces on this Windows machine) does **not** work as a Chromium `file://` URL — it silently 500s. Chromium on Windows needs a proper Windows-style URI (`file:///C:/Users/...`). Fix: build the URL with Python's `Path.resolve().as_uri()`, never string-concatenate a Bash-style path. Day 21's fixture-pointing code must do this correctly from the start.

**Notes:**
- No external provider API keys still exist — unrelated to today, Playwright doesn't touch providers.
- No mobile navigation yet — sidebar is desktop-only (unchanged since Day 3).
- Repo is public: `github.com/aks-builds/sentinel-qe`; push again before ending the session if Day 20's commits haven't been pushed yet.

---

## Next Session — Day 21

**Plan file:** `docs/superpowers/plans/2026-07-17-day21-mirror-ui-automation-fixtures.md` *(to be written)*

**Goal:** UI automation for ChatGPT + Claude.ai: conversation flow tests, per the design spec's Phase 3 Day 21 deliverable.

**Architecture decisions locked in:**
- Per design spec §13 (resolved earlier in this project): build against **local static HTML fixtures** checked into the repo that mimic ChatGPT.com/Claude.ai's DOM closely enough to exercise conversation-flow logic (type into input, click send, wait for response element, extract response text) deterministically and offline — never the real production sites, and never automatically pointed at them without the user's own test accounts and explicit ask.
- Reuse Day 20's `fetch_page_content`/Playwright-wrapper primitive as the low-level building block; Day 21 adds the higher-level page-object/interaction logic (fill input, click, wait-for-selector) on top of it, plus the fixture HTML pages themselves (one per simulated product).
- Remember Day 20's `file://` URL gotcha — always build fixture URLs with `Path.resolve().as_uri()`, not a hand-built string.
