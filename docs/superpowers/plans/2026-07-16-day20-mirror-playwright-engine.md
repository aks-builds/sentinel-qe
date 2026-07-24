# Day 20 — Playwright Integration in the Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Python Playwright service in `apps/engine`, per the design spec's Phase 3 Day 20 deliverable — the browser-automation building block that Day 21's ChatGPT/Claude.ai conversation-flow tests (against local fixtures, per design spec §13) will be built on top of.

**Architecture:** A single stateless function, `fetch_page_content(url) -> PageContent`, launches a headless Chromium browser via Playwright's sync API, navigates to a URL, extracts the page title and body text, and closes the browser — matching the "launch fresh per call, no persistent session" simplicity of every other Day 16-19 Mirror building block. Exposed via `POST /mirror/ui/navigate`, dependency-injected the same way `get_provider`/`get_judge` already are in `routers/mirror.py`, so tests can override it without a real browser. Deliberately does **not** touch ChatGPT.com/Claude.ai or build any page-object/conversation-flow logic — that is Day 21's scope, resolved separately per the design spec's §13 amendment (local fixtures first, live sites only as an explicit later config swap). Day 20's own live verification target is a static HTML fixture checked into this plan's tests, proving the mechanism (real browser launch → navigate → extract → close) actually works end-to-end.

**Tech Stack:** `playwright` (Python, sync API) added to `apps/engine`'s existing Poetry project. No new web-app or SDK changes.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/engine/pyproject.toml` | Modify | Add `playwright` dependency |
| `apps/engine/sentinel_engine/playwright_service/__init__.py` | Create | Package marker |
| `apps/engine/sentinel_engine/playwright_service/browser.py` | Create | `PageContent`, `fetch_page_content()` |
| `apps/engine/tests/playwright_service/__init__.py` | Create | Package marker |
| `apps/engine/tests/playwright_service/test_browser.py` | Create | Mocked unit tests for `fetch_page_content` |
| `apps/engine/sentinel_engine/routers/mirror.py` | Modify | Add `POST /mirror/ui/navigate` |
| `apps/engine/tests/test_mirror_navigate.py` | Create | Router-level tests (dependency override, no real browser) |
| `apps/engine/tests/fixtures/hello.html` | Create | Static fixture for the live smoke test |
| `CLAUDE.md` | Modify | Day 20 → Day 21 handoff |

## Parallelization note

This day's tasks form a tight dependency chain (dependency install → `browser.py` → router wiring → smoke test), and Task 1 needs a real `poetry lock`/`poetry install` + a real Chromium binary download — the same "needs a live external command a subagent's worktree might handle unpredictably" judgment that put Day 11's Ollama/`poetry lock` setup directly with the controller. **No subagent dispatch this day** — all tasks done directly and sequentially, matching Day 12's precedent (small, tightly-coupled, no parallelizable tracks).

---

### Task 1: Add the Playwright dependency

**Files:**
- Modify: `apps/engine/pyproject.toml`

- [ ] **Step 1: Add the dependency**

In `apps/engine/pyproject.toml`, under `[tool.poetry.dependencies]`, add:

```toml
playwright = "^1.48.0"
```

- [ ] **Step 2: Lock and install**

Run (from `apps/engine`):
```bash
poetry lock
poetry install
```
Expected: resolves and installs `playwright` and its transitive deps into the project's virtualenv.

- [ ] **Step 3: Install the Chromium browser binary**

Run:
```bash
poetry run playwright install chromium
```
Expected: downloads and installs a headless-capable Chromium build (~150-300MB). This is a one-time local machine setup step, not something CI/a fresh clone gets for free — note this in Task 8's `CLAUDE.md` handoff.

- [ ] **Step 4: Commit**

```bash
cd apps/engine
git add pyproject.toml poetry.lock
git commit -m "chore(day20): add Playwright dependency to engine"
```

---

### Task 2: `fetch_page_content()` — the core browser wrapper

**Files:**
- Create: `apps/engine/sentinel_engine/playwright_service/__init__.py`
- Create: `apps/engine/sentinel_engine/playwright_service/browser.py`
- Create: `apps/engine/tests/playwright_service/__init__.py`
- Create: `apps/engine/tests/playwright_service/test_browser.py`

**Depends on:** Task 1 (needs `playwright` importable).

- [ ] **Step 1: Write the failing tests**

Create `apps/engine/tests/playwright_service/__init__.py` (empty file).

Create `apps/engine/tests/playwright_service/test_browser.py`:

```python
from unittest.mock import MagicMock, patch

import pytest

from sentinel_engine.playwright_service.browser import fetch_page_content


def _mock_playwright_context(mock_page: MagicMock) -> MagicMock:
    mock_browser = MagicMock()
    mock_browser.new_page.return_value = mock_page

    mock_chromium = MagicMock()
    mock_chromium.launch.return_value = mock_browser

    mock_playwright_instance = MagicMock()
    mock_playwright_instance.chromium = mock_chromium
    return mock_playwright_instance, mock_browser


def test_fetch_page_content_navigates_and_extracts_title_and_text():
    mock_page = MagicMock()
    mock_page.title.return_value = "Example Title"
    mock_page.inner_text.return_value = "Example body text"
    mock_playwright_instance, mock_browser = _mock_playwright_context(mock_page)

    with patch("sentinel_engine.playwright_service.browser.sync_playwright") as mock_sync_playwright:
        mock_sync_playwright.return_value.__enter__.return_value = mock_playwright_instance

        result = fetch_page_content("https://example.com")

    mock_page.goto.assert_called_once_with("https://example.com")
    mock_page.inner_text.assert_called_once_with("body")
    mock_browser.close.assert_called_once()
    assert result.title == "Example Title"
    assert result.text == "Example body text"


def test_fetch_page_content_closes_browser_even_if_navigation_fails():
    mock_page = MagicMock()
    mock_page.goto.side_effect = RuntimeError("navigation failed")
    mock_playwright_instance, mock_browser = _mock_playwright_context(mock_page)

    with patch("sentinel_engine.playwright_service.browser.sync_playwright") as mock_sync_playwright:
        mock_sync_playwright.return_value.__enter__.return_value = mock_playwright_instance

        with pytest.raises(RuntimeError):
            fetch_page_content("https://example.com")

    mock_browser.close.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/playwright_service/test_browser.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.playwright_service'`

- [ ] **Step 3: Write the implementation**

Create `apps/engine/sentinel_engine/playwright_service/__init__.py` (empty file).

Create `apps/engine/sentinel_engine/playwright_service/browser.py`:

```python
from dataclasses import dataclass

from playwright.sync_api import sync_playwright


@dataclass
class PageContent:
    title: str
    text: str


def fetch_page_content(url: str) -> PageContent:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            page = browser.new_page()
            page.goto(url)
            return PageContent(title=page.title(), text=page.inner_text("body"))
        finally:
            browser.close()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/playwright_service/test_browser.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
cd apps/engine
git add sentinel_engine/playwright_service/__init__.py sentinel_engine/playwright_service/browser.py tests/playwright_service/__init__.py tests/playwright_service/test_browser.py
git commit -m "feat(day20): fetch_page_content — Playwright browser wrapper"
```

---

### Task 3: `POST /mirror/ui/navigate`

**Files:**
- Modify: `apps/engine/sentinel_engine/routers/mirror.py`
- Create: `apps/engine/tests/test_mirror_navigate.py`

**Depends on:** Task 2 (`fetch_page_content`, `PageContent`).

- [ ] **Step 1: Write the failing tests**

Create `apps/engine/tests/test_mirror_navigate.py`:

```python
import pytest
from fastapi.testclient import TestClient

from sentinel_engine.main import app
from sentinel_engine.playwright_service.browser import PageContent
from sentinel_engine.routers.mirror import get_page_fetcher


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    yield
    app.dependency_overrides.clear()


def test_navigate_returns_title_and_text():
    app.dependency_overrides[get_page_fetcher] = lambda: (
        lambda url: PageContent(title="t", text="hello")
    )
    client = TestClient(app)

    response = client.post("/mirror/ui/navigate", json={"url": "https://example.com"})

    assert response.status_code == 200
    assert response.json() == {"title": "t", "text": "hello"}


def test_navigate_rejects_missing_url():
    client = TestClient(app)

    response = client.post("/mirror/ui/navigate", json={})

    assert response.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/test_mirror_navigate.py -v`
Expected: FAIL — `ImportError: cannot import name 'get_page_fetcher' from 'sentinel_engine.routers.mirror'`

- [ ] **Step 3: Write the implementation**

In `apps/engine/sentinel_engine/routers/mirror.py`, add the import alongside the existing ones at the top:

```python
from sentinel_engine.playwright_service.browser import PageContent, fetch_page_content
```

Then add at the end of the file:

```python
class NavigateRequest(BaseModel):
    url: str


class NavigateResponse(BaseModel):
    title: str
    text: str


def get_page_fetcher():
    return fetch_page_content


@router.post("/ui/navigate", response_model=NavigateResponse)
def navigate(request: NavigateRequest, fetcher=Depends(get_page_fetcher)) -> NavigateResponse:
    content: PageContent = fetcher(request.url)
    return NavigateResponse(title=content.title, text=content.text)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/test_mirror_navigate.py -v`
Expected: 2 passed

- [ ] **Step 5: Run the full engine test suite**

Run: `cd apps/engine && poetry run pytest`
Expected: all pass (no real browser is launched by any of these — every test mocks `fetch_page_content` or `sync_playwright` directly).

- [ ] **Step 6: Commit**

```bash
cd apps/engine
git add sentinel_engine/routers/mirror.py tests/test_mirror_navigate.py
git commit -m "feat(day20): POST /mirror/ui/navigate endpoint"
```

---

### Task 4: Live smoke test — a real browser against a local fixture

**Files:**
- Create: `apps/engine/tests/fixtures/hello.html`

**Depends on:** Task 3, and Task 1's real Chromium install.

- [ ] **Step 1: Create the fixture**

Create `apps/engine/tests/fixtures/hello.html`:

```html
<!DOCTYPE html>
<html>
<head><title>Sentinel Playwright Fixture</title></head>
<body>
<p>Hello from the Sentinel Playwright smoke test fixture.</p>
</body>
</html>
```

- [ ] **Step 2: Commit the fixture**

```bash
cd apps/engine
git add tests/fixtures/hello.html
git commit -m "test(day20): static fixture for the Playwright live smoke test"
```

- [ ] **Step 3: Run a real browser against it**

From `apps/engine`, start a Python REPL (or a throwaway script) and run:

```python
from pathlib import Path
from sentinel_engine.playwright_service.browser import fetch_page_content

fixture_path = Path("tests/fixtures/hello.html").resolve()
result = fetch_page_content(f"file://{fixture_path}")
print(result)
```

Expected: `PageContent(title='Sentinel Playwright Fixture', text='Hello from the Sentinel Playwright smoke test fixture.')` — a real headless Chromium instance launched, loaded the file, extracted exactly this text, and closed. This is the actual Day 20 deliverable proven live, independent of Day 21's ChatGPT/Claude.ai fixture work.

- [ ] **Step 4: Also verify through the real HTTP endpoint**

Start the engine (`poetry run uvicorn sentinel_engine.main:app --port 8000`), then from another shell:

```bash
curl -s -X POST http://localhost:8000/mirror/ui/navigate \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"file://$(cd apps/engine && pwd)/tests/fixtures/hello.html\"}"
```

Expected: `{"title":"Sentinel Playwright Fixture","text":"Hello from the Sentinel Playwright smoke test fixture."}`

Stop the engine afterward.

- [ ] **Step 5: Record the result**

No commit for this task — fold the result into Task 5's `CLAUDE.md` write-up.

---

### Task 5: `CLAUDE.md` Day 20 → Day 21 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 20 built and Task 4's actual live-smoke-test result (write once known, don't guess). Explicitly note: `poetry run playwright install chromium` is a one-time local machine setup step not captured by `poetry install` alone — anyone re-cloning this repo needs to run it once before Playwright-dependent code (or its live smoke tests) will work; the mocked unit tests don't need it.

- [ ] **Step 2: Update "Next Session — Day 21"**

Plan file: `docs/superpowers/plans/2026-07-17-day21-mirror-ui-automation-fixtures.md (to be written)`. Goal: UI automation for ChatGPT + Claude.ai conversation flow tests, per design spec §13's already-resolved scope: build against local static HTML fixtures checked into the repo that mimic each product's DOM closely enough to exercise conversation-flow logic (send message, wait for response, extract response text) deterministically and offline — not the real chatgpt.com/claude.ai sites. Reuse Day 20's `fetch_page_content`-style wrapper as the low-level primitive; Day 21 adds the higher-level "type into input, click send, wait for response element, extract text" page-object logic on top of it, plus the fixture HTML pages themselves (one per simulated product).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day20): update session context for day 21 handoff"
```
