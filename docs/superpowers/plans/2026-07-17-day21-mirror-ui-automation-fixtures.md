# Day 21 — ChatGPT/Claude.ai UI Automation Against Local Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI automation for ChatGPT + Claude.ai conversation-flow tests, per the design spec's Phase 3 Day 21 deliverable — built entirely against local static HTML fixtures, per the already-resolved design spec §13 scope fork (no live production sites, no real test accounts needed or used).

**Architecture:** A `ConversationSession` context manager (`sentinel_engine/playwright_service/conversation.py`) wraps a single persistent Playwright page across multiple turns — `send_message(text)` fills the input, clicks send, waits for that turn's response element (selector carries a `data-turn` counter so waiting is deterministic, never a fixed sleep), and returns the extracted response text. Two thin factory functions (`chatgpt_session`, `claude_session`) pre-configure the selectors for each simulated product. Two fixture HTML pages (`chatgpt_fixture.html`, `claude_fixture.html`) use genuinely different element IDs/classes from each other and embed a small vanilla-JS handler that appends a canned reply on "send" — enough to exercise real DOM interaction (type → click → wait → read) and multi-turn conversation state, deterministically and fully offline. Exposed via `POST /mirror/ui/conversation`, DI'd the same way Day 20's `/mirror/ui/navigate` already is.

**Tech Stack:** Same `playwright` dependency Day 20 added — no new dependencies.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/engine/sentinel_engine/playwright_service/conversation.py` | Create | `ConversationSession`, `chatgpt_session()`, `claude_session()` |
| `apps/engine/tests/playwright_service/test_conversation.py` | Create | Mocked unit tests |
| `apps/engine/tests/fixtures/chatgpt_fixture.html` | Create | ChatGPT-like static fixture (`#prompt-input`, `#send-button`, `.response-bubble`) |
| `apps/engine/tests/fixtures/claude_fixture.html` | Create | Claude-like static fixture (`#composer-input`, `#submit-button`, `.assistant-message`) |
| `apps/engine/sentinel_engine/routers/mirror.py` | Modify | Add `POST /mirror/ui/conversation` |
| `apps/engine/tests/test_mirror_conversation.py` | Create | Router-level tests (dependency override) |
| `CLAUDE.md` | Modify | Day 21 → Day 22 handoff |

## Parallelization note

Same judgment as Day 20: a short, tightly-coupled sequential chain (wrapper → fixtures → router → smoke test) with no genuinely independent tracks worth the coordination cost of a worktree dispatch. **No subagent dispatch this day** — done directly by the controller.

---

### Task 1: `ConversationSession` + product factory functions

**Files:**
- Create: `apps/engine/sentinel_engine/playwright_service/conversation.py`
- Create: `apps/engine/tests/playwright_service/test_conversation.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/engine/tests/playwright_service/test_conversation.py`:

```python
from unittest.mock import MagicMock, patch

from sentinel_engine.playwright_service.conversation import (
    ConversationSession,
    chatgpt_session,
    claude_session,
)


def _mock_playwright():
    mock_page = MagicMock()
    mock_browser = MagicMock()
    mock_browser.new_page.return_value = mock_page
    mock_chromium = MagicMock()
    mock_chromium.launch.return_value = mock_browser
    mock_playwright_instance = MagicMock()
    mock_playwright_instance.chromium = mock_chromium
    mock_playwright_factory = MagicMock()
    mock_playwright_factory.start.return_value = mock_playwright_instance
    return mock_playwright_factory, mock_playwright_instance, mock_browser, mock_page


def test_enter_navigates_to_the_given_url():
    mock_factory, _, _, mock_page = _mock_playwright()

    with patch(
        "sentinel_engine.playwright_service.conversation.sync_playwright",
        return_value=mock_factory,
    ):
        with ConversationSession(
            url="file:///fixture.html",
            input_selector="#in",
            send_selector="#send",
            response_selector=".resp",
        ):
            pass

    mock_page.goto.assert_called_once_with("file:///fixture.html")


def test_send_message_fills_clicks_and_extracts_the_correctly_numbered_turn():
    mock_factory, _, _, mock_page = _mock_playwright()
    mock_page.inner_text.return_value = "Hello there"

    with patch(
        "sentinel_engine.playwright_service.conversation.sync_playwright",
        return_value=mock_factory,
    ):
        with ConversationSession(
            url="file:///fixture.html",
            input_selector="#in",
            send_selector="#send",
            response_selector=".resp",
        ) as session:
            result = session.send_message("Hi")

    mock_page.fill.assert_called_once_with("#in", "Hi")
    mock_page.click.assert_called_once_with("#send")
    mock_page.wait_for_selector.assert_called_once_with(".resp[data-turn='1']")
    mock_page.inner_text.assert_called_once_with(".resp[data-turn='1']")
    assert result == "Hello there"


def test_send_message_increments_the_turn_counter_across_calls():
    mock_factory, _, _, mock_page = _mock_playwright()

    with patch(
        "sentinel_engine.playwright_service.conversation.sync_playwright",
        return_value=mock_factory,
    ):
        with ConversationSession(
            url="file:///fixture.html",
            input_selector="#in",
            send_selector="#send",
            response_selector=".resp",
        ) as session:
            session.send_message("first")
            session.send_message("second")

    assert mock_page.wait_for_selector.call_args_list[0].args[0] == ".resp[data-turn='1']"
    assert mock_page.wait_for_selector.call_args_list[1].args[0] == ".resp[data-turn='2']"


def test_exit_closes_the_browser_and_stops_playwright():
    mock_factory, mock_instance, mock_browser, _ = _mock_playwright()

    with patch(
        "sentinel_engine.playwright_service.conversation.sync_playwright",
        return_value=mock_factory,
    ):
        with ConversationSession(
            url="file:///fixture.html",
            input_selector="#in",
            send_selector="#send",
            response_selector=".resp",
        ):
            pass

    mock_browser.close.assert_called_once()
    mock_instance.stop.assert_called_once()


def test_chatgpt_session_uses_chatgpt_style_selectors():
    session = chatgpt_session("file:///chatgpt_fixture.html")
    assert session.input_selector == "#prompt-input"
    assert session.send_selector == "#send-button"
    assert session.response_selector == ".response-bubble"


def test_claude_session_uses_claude_style_selectors():
    session = claude_session("file:///claude_fixture.html")
    assert session.input_selector == "#composer-input"
    assert session.send_selector == "#submit-button"
    assert session.response_selector == ".assistant-message"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/playwright_service/test_conversation.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.playwright_service.conversation'`

- [ ] **Step 3: Write the implementation**

Create `apps/engine/sentinel_engine/playwright_service/conversation.py`:

```python
from playwright.sync_api import sync_playwright


class ConversationSession:
    def __init__(self, url: str, input_selector: str, send_selector: str, response_selector: str):
        self.url = url
        self.input_selector = input_selector
        self.send_selector = send_selector
        self.response_selector = response_selector
        self._turn = 0
        self._playwright = None
        self._browser = None
        self._page = None

    def __enter__(self) -> "ConversationSession":
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch()
        self._page = self._browser.new_page()
        self._page.goto(self.url)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self._browser.close()
        self._playwright.stop()

    def send_message(self, text: str) -> str:
        self._turn += 1
        self._page.fill(self.input_selector, text)
        self._page.click(self.send_selector)
        turn_selector = f"{self.response_selector}[data-turn='{self._turn}']"
        self._page.wait_for_selector(turn_selector)
        return self._page.inner_text(turn_selector)


def chatgpt_session(url: str) -> ConversationSession:
    return ConversationSession(
        url=url,
        input_selector="#prompt-input",
        send_selector="#send-button",
        response_selector=".response-bubble",
    )


def claude_session(url: str) -> ConversationSession:
    return ConversationSession(
        url=url,
        input_selector="#composer-input",
        send_selector="#submit-button",
        response_selector=".assistant-message",
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/playwright_service/test_conversation.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
cd apps/engine
git add sentinel_engine/playwright_service/conversation.py tests/playwright_service/test_conversation.py
git commit -m "feat(day21): ConversationSession — multi-turn Playwright page driver"
```

---

### Task 2: Fixture HTML pages

**Files:**
- Create: `apps/engine/tests/fixtures/chatgpt_fixture.html`
- Create: `apps/engine/tests/fixtures/claude_fixture.html`

**Depends on:** nothing (pure static files) — but committed after Task 1 so the plan reads as one coherent unit.

- [ ] **Step 1: Create the ChatGPT-style fixture**

Create `apps/engine/tests/fixtures/chatgpt_fixture.html`:

```html
<!DOCTYPE html>
<html>
<head><title>ChatGPT Fixture</title></head>
<body>
<textarea id="prompt-input"></textarea>
<button id="send-button">Send</button>
<div id="conversation"></div>
<script>
let turn = 0;
document.getElementById("send-button").addEventListener("click", () => {
  turn += 1;
  const input = document.getElementById("prompt-input").value;
  const bubble = document.createElement("div");
  bubble.className = "response-bubble";
  bubble.setAttribute("data-turn", String(turn));
  bubble.textContent = "ChatGPT fixture reply to: " + input;
  document.getElementById("conversation").appendChild(bubble);
});
</script>
</body>
</html>
```

- [ ] **Step 2: Create the Claude-style fixture**

Create `apps/engine/tests/fixtures/claude_fixture.html`:

```html
<!DOCTYPE html>
<html>
<head><title>Claude Fixture</title></head>
<body>
<textarea id="composer-input"></textarea>
<button id="submit-button">Submit</button>
<div id="messages"></div>
<script>
let turn = 0;
document.getElementById("submit-button").addEventListener("click", () => {
  turn += 1;
  const input = document.getElementById("composer-input").value;
  const bubble = document.createElement("div");
  bubble.className = "assistant-message";
  bubble.setAttribute("data-turn", String(turn));
  bubble.textContent = "Claude fixture reply to: " + input;
  document.getElementById("messages").appendChild(bubble);
});
</script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
cd apps/engine
git add tests/fixtures/chatgpt_fixture.html tests/fixtures/claude_fixture.html
git commit -m "test(day21): ChatGPT/Claude-style conversation fixtures"
```

---

### Task 3: `POST /mirror/ui/conversation`

**Files:**
- Modify: `apps/engine/sentinel_engine/routers/mirror.py`
- Create: `apps/engine/tests/test_mirror_conversation.py`

**Depends on:** Task 1 (`chatgpt_session`, `claude_session`).

- [ ] **Step 1: Write the failing tests**

Create `apps/engine/tests/test_mirror_conversation.py`:

```python
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from sentinel_engine.main import app
from sentinel_engine.routers.mirror import get_conversation_runner


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    yield
    app.dependency_overrides.clear()


def test_conversation_returns_a_response_per_message():
    app.dependency_overrides[get_conversation_runner] = lambda: (
        lambda product, url, messages: [f"echo:{m}" for m in messages]
    )
    client = TestClient(app)

    response = client.post(
        "/mirror/ui/conversation",
        json={"product": "chatgpt", "url": "file:///x.html", "messages": ["hi", "there"]},
    )

    assert response.status_code == 200
    assert response.json() == {"responses": ["echo:hi", "echo:there"]}


def test_conversation_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/mirror/ui/conversation", json={"product": "chatgpt"})

    assert response.status_code == 422


def test_default_conversation_runner_rejects_unknown_product():
    runner = get_conversation_runner()

    with pytest.raises(HTTPException):
        runner("unknown-product", "file:///x.html", ["hi"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/test_mirror_conversation.py -v`
Expected: FAIL — `ImportError: cannot import name 'get_conversation_runner' from 'sentinel_engine.routers.mirror'`

- [ ] **Step 3: Write the implementation**

In `apps/engine/sentinel_engine/routers/mirror.py`, add the import alongside the existing Playwright import:

```python
from sentinel_engine.playwright_service.conversation import chatgpt_session, claude_session
```

Then add at the end of the file:

```python
class ConversationRequest(BaseModel):
    product: str
    url: str
    messages: list[str]


class ConversationResponse(BaseModel):
    responses: list[str]


_CONVERSATION_SESSION_FACTORIES = {
    "chatgpt": chatgpt_session,
    "claude": claude_session,
}


def get_conversation_runner():
    def run(product: str, url: str, messages: list[str]) -> list[str]:
        factory = _CONVERSATION_SESSION_FACTORIES.get(product)
        if factory is None:
            raise HTTPException(status_code=400, detail=f'Unknown product "{product}"')
        with factory(url) as session:
            return [session.send_message(message) for message in messages]

    return run


@router.post("/ui/conversation", response_model=ConversationResponse)
def conversation(
    request: ConversationRequest, runner=Depends(get_conversation_runner)
) -> ConversationResponse:
    responses = runner(request.product, request.url, request.messages)
    return ConversationResponse(responses=responses)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/test_mirror_conversation.py -v`
Expected: 3 passed

- [ ] **Step 5: Run the full engine test suite**

Run: `cd apps/engine && poetry run pytest`
Expected: all pass (no real browser launched by any of these).

- [ ] **Step 6: Commit**

```bash
cd apps/engine
git add sentinel_engine/routers/mirror.py tests/test_mirror_conversation.py
git commit -m "feat(day21): POST /mirror/ui/conversation endpoint"
```

---

### Task 4: Live smoke test — real multi-turn conversations against both fixtures

**Files:** none (verification only).

**Depends on:** Task 3, and Day 20's real Chromium install.

- [ ] **Step 1: Direct multi-turn check against each fixture**

From `apps/engine`, run a throwaway script (delete after):

```python
from pathlib import Path
from sentinel_engine.playwright_service.conversation import chatgpt_session, claude_session

chatgpt_url = Path("tests/fixtures/chatgpt_fixture.html").resolve().as_uri()
with chatgpt_session(chatgpt_url) as session:
    r1 = session.send_message("What is 2+2?")
    r2 = session.send_message("And 3+3?")

claude_url = Path("tests/fixtures/claude_fixture.html").resolve().as_uri()
with claude_session(claude_url) as session:
    r3 = session.send_message("What is 2+2?")

with open("smoke_result.txt", "w") as f:
    f.write(f"{r1}\n{r2}\n{r3}\n")
```

Expected `smoke_result.txt` contents:
```
ChatGPT fixture reply to: What is 2+2?
ChatGPT fixture reply to: And 3+3?
Claude fixture reply to: What is 2+2?
```

This proves real multi-turn conversation state: the second ChatGPT call gets turn 2's response, not turn 1's stale one, and the Claude session is a fully independent browser/page from the ChatGPT one. **Use `Path.resolve().as_uri()`, not a hand-built string** — Day 20 found that a POSIX-style Bash path silently 500s as a Chromium `file://` URL on Windows.

- [ ] **Step 2: Verify through the real HTTP endpoint**

Start the engine (`poetry run uvicorn sentinel_engine.main:app --port 8000`), then from another shell:

```bash
CHATGPT_URL=$(poetry run python -c "from pathlib import Path; print(Path('tests/fixtures/chatgpt_fixture.html').resolve().as_uri())")
curl -s -X POST http://localhost:8000/mirror/ui/conversation \
  -H "Content-Type: application/json" \
  -d "{\"product\": \"chatgpt\", \"url\": \"$CHATGPT_URL\", \"messages\": [\"Hello\", \"How are you?\"]}"
```

Expected: `{"responses":["ChatGPT fixture reply to: Hello","ChatGPT fixture reply to: How are you?"]}`

Stop the engine afterward.

- [ ] **Step 3: Clean up**

Delete any throwaway script and `smoke_result.txt`.

- [ ] **Step 4: Record the result**

No commit for this task — fold the result into Task 5's `CLAUDE.md` write-up.

---

### Task 5: `CLAUDE.md` Day 21 → Day 22 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 21 built and Task 4's actual live-smoke-test result (write once known, don't guess).

- [ ] **Step 2: Update "Next Session — Day 22"**

Plan file: `docs/superpowers/plans/2026-07-18-day22-mirror-ui-suite-builder.md` (to be written). Goal: Mirror UI test suite builder with an API-vs-UI mode toggle, closing out Phase 3 (Mirror v1). Surface Day 20-21's `/mirror/ui/navigate` and `/mirror/ui/conversation` engine endpoints from the web app (likely via a new `/api/mirror/ui/*` proxy route, generalizing the existing Day 14 proxy pattern) and let a suite's "run" form choose API mode (Day 18's existing `RecordRunForm`-style manual/API flow) or UI mode (drives the Day 21 fixture-based conversation flow) per run.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day21): update session context for day 22 handoff"
```
