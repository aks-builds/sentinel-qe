# Day 16 — Mirror API Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror API runner — send prompt suites to OpenAI, Anthropic, Google, and Grok APIs, per the design spec's Phase 3 Day 16 deliverable. First day of Phase 3 (Mirror v1, Days 16-22).

**Architecture:** Mirror is explicitly exempt from the local-first/self-hosted judge constraint (design spec §12) — calling these four external providers *is* the feature under test, not an internal scoring shortcut. A `Provider` ABC (`sentinel_engine/mirror/providers/base.py`) mirrors Day 11's `Judge` ABC shape (one method, `complete(prompt) -> ProviderResponse`), with four concrete implementations calling each provider's real chat-completion endpoint over plain `httpx` (no provider SDKs — matching this project's zero-unnecessary-dependency convention). `GrokProvider` subclasses `OpenAIProvider` since xAI's API is deliberately OpenAI-compatible (same request/response shape, different base URL and default model) — a legitimate reuse, not premature abstraction, since the two APIs are contractually identical. A thin `run_prompt_suite(provider, prompts)` runner just loops a list of prompts through one provider. A new endpoint, `POST /mirror/run`, ties it together via the same `Depends()`-injectable-dependency pattern as Days 11-13's `get_judge()`, so tests substitute a `FakeProvider` without any real network access.

**No real provider API keys exist anywhere in this project, and none will be added today** — resolved with the user before this plan was written: build and unit-test everything with mocked HTTP calls (matching the `OllamaJudge` test pattern from Day 11 — `unittest.mock.patch("httpx.post")`), but explicitly skip the live end-to-end smoke test that every other day this session has done. This is a real, acknowledged gap, not a silent omission — Task 7 documents it rather than skipping past it.

Cost tracking (mentioned in Mirror's module overview) is deliberately **not** built today — Day 16's specific listed deliverable is the API runner itself; per-provider USD pricing tables are their own scope (volatile, provider-specific) and aren't in this day's task list. Token counts (`input_tokens`/`output_tokens`, when the provider returns them) are captured now since they're a free byproduct of parsing each response; converting them to a dollar figure is left for whichever future day actually needs it.

**Tech Stack:** Python 3.12, FastAPI, `httpx` (already a runtime dependency since Day 11) — no new dependencies.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/engine/sentinel_engine/mirror/__init__.py` | Create | Package marker |
| `apps/engine/sentinel_engine/mirror/providers/__init__.py` | Create | Package marker, re-exports |
| `apps/engine/sentinel_engine/mirror/providers/base.py` | Create | `Provider` ABC, `ProviderResponse` dataclass |
| `apps/engine/sentinel_engine/mirror/providers/openai_provider.py` | Create | `OpenAIProvider` |
| `apps/engine/tests/mirror/test_openai_provider.py` | Create | Tests |
| `apps/engine/sentinel_engine/mirror/providers/anthropic_provider.py` | Create | `AnthropicProvider` |
| `apps/engine/tests/mirror/test_anthropic_provider.py` | Create | Tests |
| `apps/engine/sentinel_engine/mirror/providers/google_provider.py` | Create | `GoogleProvider` |
| `apps/engine/tests/mirror/test_google_provider.py` | Create | Tests |
| `apps/engine/sentinel_engine/mirror/providers/grok_provider.py` | Create | `GrokProvider` (subclasses `OpenAIProvider`) |
| `apps/engine/tests/mirror/test_grok_provider.py` | Create | Tests |
| `apps/engine/sentinel_engine/mirror/runner.py` | Create | `PromptResult`, `run_prompt_suite(provider, prompts)` |
| `apps/engine/tests/mirror/test_runner.py` | Create | Tests |
| `apps/engine/sentinel_engine/routers/mirror.py` | Modify | `POST /mirror/run`, `get_provider` dependency |
| `apps/engine/tests/test_mirror_run.py` | Create | Endpoint tests |
| `CLAUDE.md` | Modify | Day 16 → Day 17 handoff |

## Parallelization note

**Task 1 first, done directly by the controller (tiny, and every other task in this plan imports from it):** the `Provider` ABC + `ProviderResponse` dataclass.

**Round 1 — three independent tracks (parallel, isolated worktrees), after Task 1 merges:** Task 2 (`OpenAIProvider`), Task 3 (`AnthropicProvider`), Task 4 (`GoogleProvider`). Each only imports `base.py` (Task 1) — none depend on each other.

**Task 5 (`GrokProvider`) is not part of Round 1** — it subclasses `OpenAIProvider` (`from .openai_provider import OpenAIProvider`), so its file won't import successfully until Task 2 is merged. It's small enough (4 lines) to do directly by the controller right after Task 2 merges, rather than waiting for the rest of Round 1 or spending a worktree round-trip on it.

**Sequential, after Round 1 and Task 5 merge (small, done directly):** Task 6 (`runner.py` + the `/mirror/run` endpoint — needs all four providers merged so the endpoint's provider-name lookup table is complete), Task 7 (test-suite verification — no live smoke test today, by design), Task 8 (handoff).

---

### Task 1: `Provider` ABC and `ProviderResponse`

**Files:**
- Create: `apps/engine/sentinel_engine/mirror/__init__.py`
- Create: `apps/engine/sentinel_engine/mirror/providers/__init__.py`
- Create: `apps/engine/sentinel_engine/mirror/providers/base.py`

- [ ] **Step 1: Create the package markers**

Create `apps/engine/sentinel_engine/mirror/__init__.py` (empty file).
Create `apps/engine/sentinel_engine/mirror/providers/__init__.py` (empty file).

- [ ] **Step 2: Create `base.py`**

Create `apps/engine/sentinel_engine/mirror/providers/base.py`:

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ProviderResponse:
    text: str
    input_tokens: int | None = None
    output_tokens: int | None = None


class Provider(ABC):
    """A single external AI provider's chat-completion API.

    Mirror tests AI products the customer already sends data to as part of
    normal usage -- calling these providers directly IS the feature under
    test, unlike Probe/Guard/Cognify/Reach's self-hosted Judge (design spec
    section 12). No local-first constraint applies here.
    """

    @abstractmethod
    def complete(self, prompt: str) -> ProviderResponse:
        """Send a single prompt to the provider and return its response."""
```

- [ ] **Step 3: Verify it imports cleanly**

Run: `cd apps/engine && poetry run python -c "from sentinel_engine.mirror.providers.base import Provider, ProviderResponse; print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add apps/engine/sentinel_engine/mirror
git commit -m "feat(day16): Provider ABC and ProviderResponse for Mirror's API runner"
```

---

### Task 2: `OpenAIProvider`

**Files:**
- Create: `apps/engine/sentinel_engine/mirror/providers/openai_provider.py`
- Create: `apps/engine/tests/mirror/__init__.py`
- Create: `apps/engine/tests/mirror/test_openai_provider.py`

**Depends on:** Task 1 merged.

- [ ] **Step 1: Write the failing tests**

Create `apps/engine/tests/mirror/__init__.py` (empty file — only needs creating once; if it already exists from a parallel task, leave it as-is).

Create `apps/engine/tests/mirror/test_openai_provider.py`:

```python
from unittest.mock import Mock, patch

from sentinel_engine.mirror.providers.openai_provider import OpenAIProvider


@patch("httpx.post")
def test_complete_posts_chat_completion_and_parses_response(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {
            "choices": [{"message": {"content": "hello"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
        },
        raise_for_status=lambda: None,
    )
    provider = OpenAIProvider(api_key="sk-test", model="gpt-4o-mini")

    result = provider.complete("say hi")

    assert result.text == "hello"
    assert result.input_tokens == 5
    assert result.output_tokens == 3
    mock_post.assert_called_once_with(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": "Bearer sk-test"},
        json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "say hi"}]},
        timeout=60.0,
    )


@patch.dict("os.environ", {"OPENAI_API_KEY": "sk-env"})
@patch("httpx.post")
def test_falls_back_to_env_var_when_no_api_key_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"choices": [{"message": {"content": "x"}}], "usage": {}},
        raise_for_status=lambda: None,
    )
    provider = OpenAIProvider()

    provider.complete("hi")

    assert mock_post.call_args[1]["headers"]["Authorization"] == "Bearer sk-env"


@patch("httpx.post")
def test_defaults_to_gpt_4o_mini_when_no_model_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"choices": [{"message": {"content": "x"}}], "usage": {}},
        raise_for_status=lambda: None,
    )
    provider = OpenAIProvider(api_key="sk-test")

    provider.complete("hi")

    assert mock_post.call_args[1]["json"]["model"] == "gpt-4o-mini"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/mirror/test_openai_provider.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.mirror.providers.openai_provider'`

- [ ] **Step 3: Write the implementation**

Create `apps/engine/sentinel_engine/mirror/providers/openai_provider.py`:

```python
import os

import httpx

from .base import Provider, ProviderResponse


class OpenAIProvider(Provider):
    base_url = "https://api.openai.com/v1"

    def __init__(self, api_key: str | None = None, model: str = "gpt-4o-mini"):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.model = model

    def complete(self, prompt: str) -> ProviderResponse:
        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"model": self.model, "messages": [{"role": "user", "content": prompt}]},
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        usage = data.get("usage", {})
        return ProviderResponse(
            text=data["choices"][0]["message"]["content"],
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/mirror/test_openai_provider.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/mirror/providers/openai_provider.py apps/engine/tests/mirror/__init__.py apps/engine/tests/mirror/test_openai_provider.py
git commit -m "feat(day16): OpenAIProvider"
```

---

### Task 3: `AnthropicProvider`

**Files:**
- Create: `apps/engine/sentinel_engine/mirror/providers/anthropic_provider.py`
- Create: `apps/engine/tests/mirror/__init__.py` (if not already created by a parallel task — see Task 2 Step 1's note)
- Create: `apps/engine/tests/mirror/test_anthropic_provider.py`

**Depends on:** Task 1 merged. Independent of Task 2/4/5.

- [ ] **Step 1: Write the failing tests**

If `apps/engine/tests/mirror/__init__.py` doesn't exist yet, create it (empty file).

Create `apps/engine/tests/mirror/test_anthropic_provider.py`:

```python
from unittest.mock import Mock, patch

from sentinel_engine.mirror.providers.anthropic_provider import AnthropicProvider


@patch("httpx.post")
def test_complete_posts_message_and_parses_response(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {
            "content": [{"type": "text", "text": "hello"}],
            "usage": {"input_tokens": 5, "output_tokens": 3},
        },
        raise_for_status=lambda: None,
    )
    provider = AnthropicProvider(api_key="sk-ant-test", model="claude-sonnet-5")

    result = provider.complete("say hi")

    assert result.text == "hello"
    assert result.input_tokens == 5
    assert result.output_tokens == 3
    mock_post.assert_called_once_with(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": "sk-ant-test",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-sonnet-5",
            "max_tokens": 1024,
            "messages": [{"role": "user", "content": "say hi"}],
        },
        timeout=60.0,
    )


@patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-ant-env"})
@patch("httpx.post")
def test_falls_back_to_env_var_when_no_api_key_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"content": [{"type": "text", "text": "x"}], "usage": {}},
        raise_for_status=lambda: None,
    )
    provider = AnthropicProvider()

    provider.complete("hi")

    assert mock_post.call_args[1]["headers"]["x-api-key"] == "sk-ant-env"


@patch("httpx.post")
def test_defaults_to_claude_sonnet_5_when_no_model_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"content": [{"type": "text", "text": "x"}], "usage": {}},
        raise_for_status=lambda: None,
    )
    provider = AnthropicProvider(api_key="sk-ant-test")

    provider.complete("hi")

    assert mock_post.call_args[1]["json"]["model"] == "claude-sonnet-5"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/mirror/test_anthropic_provider.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.mirror.providers.anthropic_provider'`

- [ ] **Step 3: Write the implementation**

Create `apps/engine/sentinel_engine/mirror/providers/anthropic_provider.py`:

```python
import os

import httpx

from .base import Provider, ProviderResponse


class AnthropicProvider(Provider):
    base_url = "https://api.anthropic.com/v1"

    def __init__(self, api_key: str | None = None, model: str = "claude-sonnet-5"):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.model = model

    def complete(self, prompt: str) -> ProviderResponse:
        response = httpx.post(
            f"{self.base_url}/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        usage = data.get("usage", {})
        return ProviderResponse(
            text=data["content"][0]["text"],
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens"),
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/mirror/test_anthropic_provider.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/mirror/providers/anthropic_provider.py apps/engine/tests/mirror/__init__.py apps/engine/tests/mirror/test_anthropic_provider.py
git commit -m "feat(day16): AnthropicProvider"
```

---

### Task 4: `GoogleProvider`

**Files:**
- Create: `apps/engine/sentinel_engine/mirror/providers/google_provider.py`
- Create: `apps/engine/tests/mirror/__init__.py` (if not already created by a parallel task)
- Create: `apps/engine/tests/mirror/test_google_provider.py`

**Depends on:** Task 1 merged. Independent of Task 2/3/5.

- [ ] **Step 1: Write the failing tests**

If `apps/engine/tests/mirror/__init__.py` doesn't exist yet, create it (empty file).

Create `apps/engine/tests/mirror/test_google_provider.py`:

```python
from unittest.mock import Mock, patch

from sentinel_engine.mirror.providers.google_provider import GoogleProvider


@patch("httpx.post")
def test_complete_posts_generate_content_and_parses_response(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {
            "candidates": [{"content": {"parts": [{"text": "hello"}]}}],
            "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 3},
        },
        raise_for_status=lambda: None,
    )
    provider = GoogleProvider(api_key="AIza-test", model="gemini-2.0-flash")

    result = provider.complete("say hi")

    assert result.text == "hello"
    assert result.input_tokens == 5
    assert result.output_tokens == 3
    mock_post.assert_called_once_with(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        params={"key": "AIza-test"},
        json={"contents": [{"parts": [{"text": "say hi"}]}]},
        timeout=60.0,
    )


@patch.dict("os.environ", {"GOOGLE_API_KEY": "AIza-env"})
@patch("httpx.post")
def test_falls_back_to_env_var_when_no_api_key_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"candidates": [{"content": {"parts": [{"text": "x"}]}}], "usageMetadata": {}},
        raise_for_status=lambda: None,
    )
    provider = GoogleProvider()

    provider.complete("hi")

    assert mock_post.call_args[1]["params"]["key"] == "AIza-env"


@patch("httpx.post")
def test_defaults_to_gemini_2_0_flash_when_no_model_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"candidates": [{"content": {"parts": [{"text": "x"}]}}], "usageMetadata": {}},
        raise_for_status=lambda: None,
    )
    provider = GoogleProvider(api_key="AIza-test")

    provider.complete("hi")

    called_url = mock_post.call_args[0][0]
    assert "gemini-2.0-flash" in called_url
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/mirror/test_google_provider.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.mirror.providers.google_provider'`

- [ ] **Step 3: Write the implementation**

Create `apps/engine/sentinel_engine/mirror/providers/google_provider.py`:

```python
import os

import httpx

from .base import Provider, ProviderResponse


class GoogleProvider(Provider):
    base_url = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self, api_key: str | None = None, model: str = "gemini-2.0-flash"):
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY", "")
        self.model = model

    def complete(self, prompt: str) -> ProviderResponse:
        response = httpx.post(
            f"{self.base_url}/models/{self.model}:generateContent",
            params={"key": self.api_key},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        usage = data.get("usageMetadata", {})
        return ProviderResponse(
            text=data["candidates"][0]["content"]["parts"][0]["text"],
            input_tokens=usage.get("promptTokenCount"),
            output_tokens=usage.get("candidatesTokenCount"),
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/mirror/test_google_provider.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/mirror/providers/google_provider.py apps/engine/tests/mirror/__init__.py apps/engine/tests/mirror/test_google_provider.py
git commit -m "feat(day16): GoogleProvider"
```

---

### Task 5: `GrokProvider`

**Files:**
- Create: `apps/engine/sentinel_engine/mirror/providers/grok_provider.py`
- Create: `apps/engine/tests/mirror/__init__.py` (if not already created by a parallel task)
- Create: `apps/engine/tests/mirror/test_grok_provider.py`

**Depends on:** Task 1 and Task 2 (`OpenAIProvider`, which this subclasses — xAI's Grok API is deliberately OpenAI-compatible: same request/response shape, different base URL and default model) both merged. **Not independent of Task 2 the way Tasks 3/4 are** — if dispatching in parallel, either dispatch this one after Task 2 merges, or give the implementer Task 2's exact `OpenAIProvider` code inline since it's short enough to not need the real file to exist yet.

- [ ] **Step 1: Write the failing tests**

If `apps/engine/tests/mirror/__init__.py` doesn't exist yet, create it (empty file).

Create `apps/engine/tests/mirror/test_grok_provider.py`:

```python
from unittest.mock import Mock, patch

from sentinel_engine.mirror.providers.grok_provider import GrokProvider


@patch("httpx.post")
def test_complete_posts_to_the_xai_endpoint_and_parses_response(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {
            "choices": [{"message": {"content": "hello"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
        },
        raise_for_status=lambda: None,
    )
    provider = GrokProvider(api_key="xai-test", model="grok-2-latest")

    result = provider.complete("say hi")

    assert result.text == "hello"
    assert result.input_tokens == 5
    assert result.output_tokens == 3
    mock_post.assert_called_once_with(
        "https://api.x.ai/v1/chat/completions",
        headers={"Authorization": "Bearer xai-test"},
        json={"model": "grok-2-latest", "messages": [{"role": "user", "content": "say hi"}]},
        timeout=60.0,
    )


@patch.dict("os.environ", {"GROK_API_KEY": "xai-env"})
@patch("httpx.post")
def test_falls_back_to_env_var_when_no_api_key_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"choices": [{"message": {"content": "x"}}], "usage": {}},
        raise_for_status=lambda: None,
    )
    provider = GrokProvider()

    provider.complete("hi")

    assert mock_post.call_args[1]["headers"]["Authorization"] == "Bearer xai-env"


@patch("httpx.post")
def test_defaults_to_grok_2_latest_when_no_model_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"choices": [{"message": {"content": "x"}}], "usage": {}},
        raise_for_status=lambda: None,
    )
    provider = GrokProvider(api_key="xai-test")

    provider.complete("hi")

    assert mock_post.call_args[1]["json"]["model"] == "grok-2-latest"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/mirror/test_grok_provider.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.mirror.providers.grok_provider'`

- [ ] **Step 3: Write the implementation**

Create `apps/engine/sentinel_engine/mirror/providers/grok_provider.py`:

```python
import os

from .openai_provider import OpenAIProvider


class GrokProvider(OpenAIProvider):
    base_url = "https://api.x.ai/v1"

    def __init__(self, api_key: str | None = None, model: str = "grok-2-latest"):
        super().__init__(api_key=api_key or os.environ.get("GROK_API_KEY", ""), model=model)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/mirror/test_grok_provider.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/mirror/providers/grok_provider.py apps/engine/tests/mirror/__init__.py apps/engine/tests/mirror/test_grok_provider.py
git commit -m "feat(day16): GrokProvider (OpenAI-compatible xAI endpoint)"
```

---

### Task 6: `run_prompt_suite` and `POST /mirror/run`

**Files:**
- Create: `apps/engine/sentinel_engine/mirror/runner.py`
- Create: `apps/engine/tests/mirror/test_runner.py`
- Modify: `apps/engine/sentinel_engine/routers/mirror.py`
- Create: `apps/engine/tests/test_mirror_run.py`

**Depends on:** Tasks 1-5 all merged.

- [ ] **Step 1: Write the failing tests for `runner.py`**

Create `apps/engine/tests/mirror/test_runner.py`:

```python
from sentinel_engine.mirror.providers.base import Provider, ProviderResponse
from sentinel_engine.mirror.runner import run_prompt_suite


class FakeProvider(Provider):
    def __init__(self, responses: list[ProviderResponse]):
        self.responses = responses
        self.calls: list[str] = []

    def complete(self, prompt: str) -> ProviderResponse:
        self.calls.append(prompt)
        return self.responses[len(self.calls) - 1]


def test_runs_every_prompt_through_the_provider_in_order():
    provider = FakeProvider(
        [
            ProviderResponse(text="a", input_tokens=1, output_tokens=1),
            ProviderResponse(text="b", input_tokens=2, output_tokens=2),
        ]
    )

    results = run_prompt_suite(provider, ["p1", "p2"])

    assert provider.calls == ["p1", "p2"]
    assert results[0].prompt == "p1"
    assert results[0].text == "a"
    assert results[1].prompt == "p2"
    assert results[1].text == "b"


def test_empty_prompt_list_returns_empty_results_without_calling_the_provider():
    provider = FakeProvider([])

    results = run_prompt_suite(provider, [])

    assert results == []
    assert provider.calls == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/mirror/test_runner.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.mirror.runner'`

- [ ] **Step 3: Write `runner.py`**

Create `apps/engine/sentinel_engine/mirror/runner.py`:

```python
from dataclasses import dataclass

from .providers.base import Provider


@dataclass
class PromptResult:
    prompt: str
    text: str
    input_tokens: int | None
    output_tokens: int | None


def run_prompt_suite(provider: Provider, prompts: list[str]) -> list[PromptResult]:
    results = []
    for prompt in prompts:
        response = provider.complete(prompt)
        results.append(
            PromptResult(
                prompt=prompt,
                text=response.text,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
            )
        )
    return results
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/mirror/test_runner.py -v`
Expected: 2 passed

- [ ] **Step 5: Write the failing tests for the endpoint**

Create `apps/engine/tests/test_mirror_run.py`:

```python
import pytest
from fastapi.testclient import TestClient

from sentinel_engine.main import app
from sentinel_engine.mirror.providers.base import Provider, ProviderResponse
from sentinel_engine.routers.mirror import get_provider


class FakeProvider(Provider):
    def __init__(self, responses: list[ProviderResponse]):
        self.responses = responses
        self.calls: list[str] = []

    def complete(self, prompt: str) -> ProviderResponse:
        self.calls.append(prompt)
        return self.responses[len(self.calls) - 1]


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    yield
    app.dependency_overrides.clear()


def test_run_suite_returns_results_for_each_prompt():
    app.dependency_overrides[get_provider] = lambda: FakeProvider(
        [
            ProviderResponse(text="a", input_tokens=1, output_tokens=1),
            ProviderResponse(text="b", input_tokens=2, output_tokens=2),
        ]
    )
    client = TestClient(app)

    response = client.post("/mirror/run", json={"provider": "openai", "prompts": ["p1", "p2"]})

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "openai"
    assert body["results"] == [
        {"prompt": "p1", "text": "a", "input_tokens": 1, "output_tokens": 1},
        {"prompt": "p2", "text": "b", "input_tokens": 2, "output_tokens": 2},
    ]


def test_run_suite_rejects_unknown_provider():
    client = TestClient(app)

    response = client.post("/mirror/run", json={"provider": "nonexistent", "prompts": ["p1"]})

    assert response.status_code == 400


def test_run_suite_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/mirror/run", json={"provider": "openai"})

    assert response.status_code == 422
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/test_mirror_run.py -v`
Expected: FAIL — the current stub router has no `/run` route (404s) and no `get_provider` to import.

- [ ] **Step 7: Update the router**

Replace the full contents of `apps/engine/sentinel_engine/routers/mirror.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from sentinel_engine.mirror.providers.anthropic_provider import AnthropicProvider
from sentinel_engine.mirror.providers.base import Provider
from sentinel_engine.mirror.providers.google_provider import GoogleProvider
from sentinel_engine.mirror.providers.grok_provider import GrokProvider
from sentinel_engine.mirror.providers.openai_provider import OpenAIProvider
from sentinel_engine.mirror.runner import run_prompt_suite

router = APIRouter(prefix="/mirror", tags=["mirror"])


@router.get("/")
def mirror_status() -> dict[str, str]:
    return {"module": "mirror", "status": "not_implemented"}


_PROVIDER_CLASSES = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "google": GoogleProvider,
    "grok": GrokProvider,
}


class RunSuiteRequest(BaseModel):
    provider: str
    model: str | None = None
    prompts: list[str]


def get_provider(request: RunSuiteRequest) -> Provider:
    provider_class = _PROVIDER_CLASSES.get(request.provider)
    if provider_class is None:
        raise HTTPException(status_code=400, detail=f'Unknown provider "{request.provider}"')
    return provider_class(model=request.model) if request.model else provider_class()


class PromptResultResponse(BaseModel):
    prompt: str
    text: str
    input_tokens: int | None
    output_tokens: int | None


class RunSuiteResponse(BaseModel):
    provider: str
    results: list[PromptResultResponse]


@router.post("/run", response_model=RunSuiteResponse)
def run_suite(request: RunSuiteRequest, provider: Provider = Depends(get_provider)) -> RunSuiteResponse:
    results = run_prompt_suite(provider, request.prompts)
    return RunSuiteResponse(
        provider=request.provider,
        results=[
            PromptResultResponse(
                prompt=r.prompt, text=r.text, input_tokens=r.input_tokens, output_tokens=r.output_tokens
            )
            for r in results
        ],
    )
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest -v`
Expected: all pass (37 pre-existing + 3 OpenAI + 3 Anthropic + 3 Google + 3 Grok + 2 runner + 3 endpoint = 54 passed).

- [ ] **Step 9: Commit**

```bash
git add apps/engine/sentinel_engine/mirror/runner.py apps/engine/tests/mirror/test_runner.py apps/engine/sentinel_engine/routers/mirror.py apps/engine/tests/test_mirror_run.py
git commit -m "feat(day16): run_prompt_suite and POST /mirror/run endpoint"
```

---

### Task 7: Verification (no live smoke test — documented gap, not an oversight)

**Depends on:** Task 6 merged.

**Files:** none.

- [ ] **Step 1: Full test suite**

Run: `cd apps/engine && poetry run pytest -v`
Expected: 54 passed.

- [ ] **Step 2: Confirm no real network calls happen in the test suite**

Run: `cd apps/engine && poetry run pytest tests/mirror -v --tb=short` and read the output — every test mocks `httpx.post`, so this run should complete in well under a second with zero network activity. If anything in this directory takes noticeably long or requires network access, that's a signal a mock is missing — fix it before proceeding.

- [ ] **Step 3: Explicitly record what was NOT verified**

No live call to OpenAI, Anthropic, Google, or xAI's real API happened today — there are no API keys for any of them in this project, and the user chose to proceed mocks-only rather than supply one now (decision made before this plan was written). This means: the exact request shape each provider expects is based on each API's documented format, not confirmed against a live response. If a provider changes their API or this plan's assumptions about the exact JSON shape are wrong, these tests will NOT catch it — they only verify this code calls `httpx.post` with what THIS plan assumed the shape to be, and parses a response shaped the same way back. Real verification is deferred until the user supplies a key for at least one provider.

- [ ] **Step 4: Record the result**

No commit for this task — fold this into Task 8's `CLAUDE.md` write-up.

---

### Task 8: `CLAUDE.md` Day 16 → Day 17 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 16 built. Explicitly restate (don't bury) that none of the four providers have been verified against a real API — this is mocks-only by the user's own choice, not a quality gap to feel bad about, but it must stay visible to whoever picks this up next so it isn't mistaken for "fully verified" the way every other day's work has been.

- [ ] **Step 2: Update "Next Session — Day 17"**

Plan file: `docs/superpowers/plans/2026-07-13-day17-mirror-llm-judge-scorer.md (to be written)`. Goal: LLM judge scorer — evaluate response quality (correctness, relevance, tone), per design spec line 337. Note this is a DIFFERENT kind of "judge" than Days 11-14's — scoring a Mirror provider's response quality is an internal Sentinel operation (not the external call under test), so it likely SHOULD use the local Ollama judge (design spec §12's local-first rule applies here, unlike Day 16's provider calls) — don't default to calling one of Day 16's four providers to grade another's output, that would silently violate the "no data leaves the deployment" principle for a customer's Mirror test data. Also carry forward Day 14's finding: `llama3.2:3b` has real, non-trivial false-positive/unparseable rates — expect the same here and test with repeated draws, not a single one.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day16): update session context for day 17 handoff"
```
