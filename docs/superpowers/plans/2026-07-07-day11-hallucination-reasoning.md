# Day 11 — Hallucination Engine: Reasoning Stage Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chain-of-thought critic in the Python engine (`apps/engine`) that flags hallucinated/unsupported reasoning steps in an agent's chain of thought, per the design spec's Phase 2 Day 11 deliverable — the Reasoning stage of the five-stage hallucination taxonomy (Reasoning/Execution/Perception/Memorization/Communication).

**Architecture:** This is the first day that needs the judge backend resolved in design spec §12 (2026-07-24): a self-hosted, open-weight model via a new **Ollama** Docker Compose service — never a paid cloud API by default. The judge sits behind a small `Judge` interface (`apps/engine/sentinel_engine/judge/base.py`) so a real cloud provider could be swapped in later as an explicit opt-in; `OllamaJudge` is the only implementation for now. The reasoning critic (`sentinel_engine/hallucination/reasoning.py`) takes a `Judge` plus a list of reasoning steps and a conclusion, asks the judge to verdict each step in **one line-based prompt/response format** (not JSON — small open-weight models are unreliable at strict JSON; a `STEP <n>: SUPPORTED|UNSUPPORTED - <reason>` line format is far more robust to parse leniently), and returns a structured critique. A new FastAPI endpoint (`POST /probe/hallucination/reasoning`) exposes it, using FastAPI's `Depends()` so tests can swap in a fake judge without a real Ollama running.

**Tech Stack:** Python 3.12, FastAPI (already a dependency), `httpx` (already a dev dependency — promoted to a runtime dependency this day), Ollama (new Docker service, `ollama/ollama` image). No new Python packages beyond promoting `httpx`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/engine/sentinel_engine/judge/__init__.py` | Create | Package marker, re-exports |
| `apps/engine/sentinel_engine/judge/base.py` | Create | `Judge` ABC — one method, `complete(prompt) -> str` |
| `apps/engine/sentinel_engine/judge/ollama_judge.py` | Create | `OllamaJudge` — calls Ollama's `/api/generate` HTTP endpoint |
| `apps/engine/tests/judge/__init__.py` | Create | Test package marker |
| `apps/engine/tests/judge/test_ollama_judge.py` | Create | Tests for `OllamaJudge` (mocks `httpx.post`, no real Ollama needed) |
| `docker/docker-compose.yml` | Modify | Add the `ollama` service + `ollama_data` volume; add `OLLAMA_URL` env + `depends_on` to the `engine` service |
| `apps/engine/pyproject.toml` | Modify | Move `httpx` from dev-only to a main dependency |
| `apps/engine/sentinel_engine/hallucination/__init__.py` | Create | Package marker |
| `apps/engine/sentinel_engine/hallucination/reasoning.py` | Create | `detect_reasoning_hallucination(judge, steps, conclusion) -> ReasoningCritique` |
| `apps/engine/tests/hallucination/__init__.py` | Create | Test package marker |
| `apps/engine/tests/hallucination/test_reasoning.py` | Create | Tests using a hand-rolled `FakeJudge` (no mocking library, matching this project's established pattern) |
| `apps/engine/sentinel_engine/routers/probe.py` | Modify | Add `get_judge()` dependency + `POST /probe/hallucination/reasoning` |
| `apps/engine/tests/test_probe_hallucination.py` | Create | Endpoint test via `TestClient` + `app.dependency_overrides` |
| `CLAUDE.md` | Modify | Day 11 → Day 12 handoff |

## Parallelization note

**Round 1 — two independent tracks (parallel, isolated worktrees):** Task 1 (`Judge`/`OllamaJudge`) and Task 4 (docker-compose Ollama service + `pyproject.toml` dependency move) touch entirely disjoint files and don't depend on each other.

**Sequential, after Round 1 merges (small enough to do directly, not worth a fresh worktree round-trip each):** Task 2 (reasoning detector — needs Task 1's `Judge` ABC), Task 3 (router endpoint — needs Task 1 and Task 2), Task 5 (smoke test — needs Task 2/3's code AND Task 4's real Ollama service with a model actually pulled), Task 6 (handoff).

---

### Task 1: `Judge` interface and `OllamaJudge`

**Files:**
- Create: `apps/engine/sentinel_engine/judge/__init__.py`
- Create: `apps/engine/sentinel_engine/judge/base.py`
- Create: `apps/engine/sentinel_engine/judge/ollama_judge.py`
- Create: `apps/engine/tests/judge/__init__.py`
- Create: `apps/engine/tests/judge/test_ollama_judge.py`

- [ ] **Step 1: Write the failing test**

Create `apps/engine/tests/judge/__init__.py` (empty file).

Create `apps/engine/tests/judge/test_ollama_judge.py`:

```python
from unittest.mock import Mock, patch

from sentinel_engine.judge.ollama_judge import OllamaJudge


@patch("httpx.post")
def test_complete_posts_prompt_and_returns_response_text(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"response": "hello world"},
        raise_for_status=lambda: None,
    )
    judge = OllamaJudge(base_url="http://localhost:11434", model="llama3.2:3b")

    result = judge.complete("say hi")

    assert result == "hello world"
    mock_post.assert_called_once_with(
        "http://localhost:11434/api/generate",
        json={"model": "llama3.2:3b", "prompt": "say hi", "stream": False},
        timeout=60.0,
    )


@patch("httpx.post")
def test_complete_strips_trailing_slash_from_base_url(mock_post):
    mock_post.return_value = Mock(json=lambda: {"response": "x"}, raise_for_status=lambda: None)
    judge = OllamaJudge(base_url="http://localhost:11434/", model="llama3.2:3b")

    judge.complete("prompt")

    called_url = mock_post.call_args[0][0]
    assert called_url == "http://localhost:11434/api/generate"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/engine && poetry run pytest tests/judge/test_ollama_judge.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.judge'`

- [ ] **Step 3: Write the implementation**

Create `apps/engine/sentinel_engine/judge/__init__.py`:

```python
from .base import Judge
from .ollama_judge import OllamaJudge

__all__ = ["Judge", "OllamaJudge"]
```

Create `apps/engine/sentinel_engine/judge/base.py`:

```python
from abc import ABC, abstractmethod


class Judge(ABC):
    """A pluggable text-completion backend used to critique agent behavior.

    The default (and only) implementation is self-hosted (OllamaJudge) --
    never a paid cloud API by default. See design spec section 12.
    """

    @abstractmethod
    def complete(self, prompt: str) -> str:
        """Send a prompt to the judge model and return its raw text completion."""
```

Create `apps/engine/sentinel_engine/judge/ollama_judge.py`:

```python
import httpx

from .base import Judge


class OllamaJudge(Judge):
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3.2:3b"):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def complete(self, prompt: str) -> str:
        response = httpx.post(
            f"{self.base_url}/api/generate",
            json={"model": self.model, "prompt": prompt, "stream": False},
            timeout=60.0,
        )
        response.raise_for_status()
        return response.json()["response"]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/engine && poetry run pytest tests/judge/ -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/judge apps/engine/tests/judge
git commit -m "feat(day11): Judge interface and self-hosted OllamaJudge"
```

---

### Task 4: Ollama Docker service + `httpx` as a runtime dependency

**Files:**
- Modify: `docker/docker-compose.yml`
- Modify: `apps/engine/pyproject.toml`

**Depends on:** nothing from this plan's other tasks.

- [ ] **Step 1: Add the Ollama service**

In `docker/docker-compose.yml`, add this service in the `services:` block (after the existing `clickhouse` service, before `engine`):

```yaml
  ollama:
    image: ollama/ollama:latest
    container_name: sentinel_ollama
    restart: unless-stopped
    ports:
      - '11434:11434'
    volumes:
      - ollama_data:/root/.ollama
    healthcheck:
      test: ['CMD', 'ollama', 'list']
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 10s
```

Then update the existing `engine` service to depend on it and know how to reach it over the compose network:

```yaml
  engine:
    build:
      context: ../apps/engine
      dockerfile: Dockerfile
    container_name: sentinel_engine
    restart: unless-stopped
    environment:
      OLLAMA_URL: http://ollama:11434
    expose:
      - '8000'
    depends_on:
      - postgres
      - redis
      - ollama
```

Finally, add `ollama_data:` to the `volumes:` block at the bottom, alongside the existing `postgres_data`/`redis_data`/`minio_data`/`clickhouse_data`.

- [ ] **Step 2: Promote `httpx` to a runtime dependency**

In `apps/engine/pyproject.toml`, move `httpx` out of `[tool.poetry.group.dev.dependencies]` and into `[tool.poetry.dependencies]`:

```toml
[tool.poetry.dependencies]
python = "^3.12"
fastapi = "^0.115.0"
uvicorn = { extras = ["standard"], version = "^0.32.0" }
httpx = "^0.27.0"

[tool.poetry.group.dev.dependencies]
pytest = "^8.3.0"
```

- [ ] **Step 3: Re-lock and verify**

Run: `cd apps/engine && poetry lock && poetry install`
Expected: exits 0, `poetry.lock` is updated (dependency moved, not added — no new packages).

Run: `cd apps/engine && poetry run pytest -v`
Expected: existing tests still pass (this step alone doesn't add new tests).

- [ ] **Step 4: Commit**

```bash
git add docker/docker-compose.yml apps/engine/pyproject.toml apps/engine/poetry.lock
git commit -m "feat(day11): Ollama Docker service, promote httpx to a runtime dependency"
```

---

### Task 2: Reasoning-stage hallucination detector

**Files:**
- Create: `apps/engine/sentinel_engine/hallucination/__init__.py`
- Create: `apps/engine/sentinel_engine/hallucination/reasoning.py`
- Create: `apps/engine/tests/hallucination/__init__.py`
- Create: `apps/engine/tests/hallucination/test_reasoning.py`

**Depends on (must be merged/present first):** Task 1's `sentinel_engine.judge.base.Judge`.

- [ ] **Step 1: Write the failing tests**

Create `apps/engine/tests/hallucination/__init__.py` (empty file).

Create `apps/engine/tests/hallucination/test_reasoning.py`:

```python
from sentinel_engine.hallucination.reasoning import detect_reasoning_hallucination
from sentinel_engine.judge.base import Judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response
        self.last_prompt: str | None = None

    def complete(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self.response


def test_all_steps_supported_reports_no_hallucination():
    judge = FakeJudge(
        "STEP 1: SUPPORTED - Directly stated in the input.\n"
        "STEP 2: SUPPORTED - Follows logically from step 1."
    )
    steps = ["The user asked for the account balance.", "The balance was retrieved via the get_balance tool."]

    critique = detect_reasoning_hallucination(judge, steps, conclusion="The balance is $500.")

    assert critique.hallucination_detected is False
    assert len(critique.step_critiques) == 2
    assert all(c.supported for c in critique.step_critiques)


def test_one_unsupported_step_flags_hallucination():
    judge = FakeJudge(
        "STEP 1: SUPPORTED - Directly stated in the input.\n"
        "STEP 2: UNSUPPORTED - No tool call justifies this claim."
    )
    steps = ["The user asked for the account balance.", "The balance is $1,000,000."]

    critique = detect_reasoning_hallucination(judge, steps, conclusion="The balance is $1,000,000.")

    assert critique.hallucination_detected is True
    assert critique.step_critiques[1].supported is False
    assert critique.step_critiques[1].explanation == "No tool call justifies this claim."


def test_missing_verdict_line_defaults_to_unsupported():
    judge = FakeJudge("STEP 1: SUPPORTED - ok")  # judge never produced a line for step 2
    steps = ["step one", "step two"]

    critique = detect_reasoning_hallucination(judge, steps, conclusion="c")

    assert critique.step_critiques[1].supported is False
    assert "could not parse" in critique.step_critiques[1].explanation.lower()


def test_empty_steps_returns_empty_critique_without_calling_the_judge():
    judge = FakeJudge("irrelevant")

    critique = detect_reasoning_hallucination(judge, [], conclusion="c")

    assert critique.step_critiques == []
    assert critique.hallucination_detected is False
    assert judge.last_prompt is None


def test_prompt_includes_all_steps_and_the_conclusion():
    judge = FakeJudge("STEP 1: SUPPORTED - ok")

    detect_reasoning_hallucination(judge, ["only step"], conclusion="final answer")

    assert "only step" in judge.last_prompt
    assert "final answer" in judge.last_prompt
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/hallucination/test_reasoning.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.hallucination'`

- [ ] **Step 3: Write the implementation**

Create `apps/engine/sentinel_engine/hallucination/__init__.py` (empty file).

Create `apps/engine/sentinel_engine/hallucination/reasoning.py`:

```python
import re
from dataclasses import dataclass

from sentinel_engine.judge.base import Judge

_STEP_LINE_PATTERN = re.compile(r"STEP\s+(\d+):\s*(SUPPORTED|UNSUPPORTED)\s*-\s*(.+)", re.IGNORECASE)


@dataclass
class StepCritique:
    step: str
    supported: bool
    explanation: str


@dataclass
class ReasoningCritique:
    step_critiques: list[StepCritique]

    @property
    def hallucination_detected(self) -> bool:
        return any(not critique.supported for critique in self.step_critiques)


def _build_prompt(steps: list[str], conclusion: str) -> str:
    numbered_steps = "\n".join(f"{i + 1}. {step}" for i, step in enumerate(steps))
    return (
        "You are evaluating the reasoning steps an AI agent used before its conclusion, "
        "checking for hallucinations: claims not justified by prior steps or general "
        "knowledge, or that contradict an earlier step.\n\n"
        f"Conclusion: {conclusion}\n\n"
        f"Steps:\n{numbered_steps}\n\n"
        "For EACH step, respond on its own line in EXACTLY this format (no extra text):\n"
        "STEP <n>: SUPPORTED|UNSUPPORTED - <one sentence reason>"
    )


def detect_reasoning_hallucination(judge: Judge, steps: list[str], conclusion: str) -> ReasoningCritique:
    if not steps:
        return ReasoningCritique(step_critiques=[])

    prompt = _build_prompt(steps, conclusion)
    response = judge.complete(prompt)

    verdicts_by_step_number: dict[int, tuple[bool, str]] = {}
    for line in response.splitlines():
        match = _STEP_LINE_PATTERN.search(line)
        if not match:
            continue
        step_number = int(match.group(1))
        supported = match.group(2).upper() == "SUPPORTED"
        explanation = match.group(3).strip()
        verdicts_by_step_number[step_number] = (supported, explanation)

    critiques = []
    for index, step in enumerate(steps):
        step_number = index + 1
        if step_number in verdicts_by_step_number:
            supported, explanation = verdicts_by_step_number[step_number]
        else:
            supported, explanation = False, "Could not parse a judge verdict for this step."
        critiques.append(StepCritique(step=step, supported=supported, explanation=explanation))

    return ReasoningCritique(step_critiques=critiques)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/hallucination/test_reasoning.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/hallucination apps/engine/tests/hallucination
git commit -m "feat(day11): reasoning-stage hallucination detector (chain-of-thought critic)"
```

---

### Task 3: `POST /probe/hallucination/reasoning` endpoint

**Files:**
- Modify: `apps/engine/sentinel_engine/routers/probe.py`
- Create: `apps/engine/tests/test_probe_hallucination.py`

**Depends on:** Task 1 and Task 2.

- [ ] **Step 1: Write the failing test**

Create `apps/engine/tests/test_probe_hallucination.py`:

```python
import pytest
from fastapi.testclient import TestClient

from sentinel_engine.judge.base import Judge
from sentinel_engine.main import app
from sentinel_engine.routers.probe import get_judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response

    def complete(self, prompt: str) -> str:
        return self.response


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    yield
    app.dependency_overrides.clear()


def test_critique_reasoning_returns_structured_result():
    app.dependency_overrides[get_judge] = lambda: FakeJudge(
        "STEP 1: SUPPORTED - fine\nSTEP 2: UNSUPPORTED - bad"
    )
    client = TestClient(app)

    response = client.post(
        "/probe/hallucination/reasoning",
        json={"steps": ["step one", "step two"], "conclusion": "c"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["hallucination_detected"] is True
    assert len(body["step_critiques"]) == 2
    assert body["step_critiques"][0] == {"step": "step one", "supported": True, "explanation": "fine"}
    assert body["step_critiques"][1] == {"step": "step two", "supported": False, "explanation": "bad"}


def test_critique_reasoning_with_no_hallucinations():
    app.dependency_overrides[get_judge] = lambda: FakeJudge("STEP 1: SUPPORTED - ok")
    client = TestClient(app)

    response = client.post(
        "/probe/hallucination/reasoning",
        json={"steps": ["only step"], "conclusion": "c"},
    )

    assert response.status_code == 200
    assert response.json()["hallucination_detected"] is False


def test_critique_reasoning_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/probe/hallucination/reasoning", json={"steps": ["a step"]})

    assert response.status_code == 422
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/engine && poetry run pytest tests/test_probe_hallucination.py -v`
Expected: FAIL — 404 (route doesn't exist yet) on the first two tests.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `apps/engine/sentinel_engine/routers/probe.py`:

```python
import os

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from sentinel_engine.hallucination.reasoning import detect_reasoning_hallucination
from sentinel_engine.judge.base import Judge
from sentinel_engine.judge.ollama_judge import OllamaJudge

router = APIRouter(prefix="/probe", tags=["probe"])


@router.get("/")
def probe_status() -> dict[str, str]:
    return {"module": "probe", "status": "not_implemented"}


def get_judge() -> Judge:
    return OllamaJudge(
        base_url=os.environ.get("OLLAMA_URL", "http://localhost:11434"),
        model=os.environ.get("OLLAMA_MODEL", "llama3.2:3b"),
    )


class StepCritiqueResponse(BaseModel):
    step: str
    supported: bool
    explanation: str


class ReasoningCritiqueRequest(BaseModel):
    steps: list[str]
    conclusion: str


class ReasoningCritiqueResponse(BaseModel):
    hallucination_detected: bool
    step_critiques: list[StepCritiqueResponse]


@router.post("/hallucination/reasoning", response_model=ReasoningCritiqueResponse)
def critique_reasoning(
    request: ReasoningCritiqueRequest, judge: Judge = Depends(get_judge)
) -> ReasoningCritiqueResponse:
    critique = detect_reasoning_hallucination(judge, request.steps, request.conclusion)
    return ReasoningCritiqueResponse(
        hallucination_detected=critique.hallucination_detected,
        step_critiques=[
            StepCritiqueResponse(step=c.step, supported=c.supported, explanation=c.explanation)
            for c in critique.step_critiques
        ],
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest -v`
Expected: all tests pass (6 pre-existing `test_routers.py`/`test_health.py` + 2 from Task 1 + 5 from Task 2 + 3 from this task = 16 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/routers/probe.py apps/engine/tests/test_probe_hallucination.py
git commit -m "feat(day11): POST /probe/hallucination/reasoning endpoint"
```

---

### Task 5: End-to-end smoke test (real Ollama, real model)

**Depends on:** Tasks 1-4 all merged.

**Files:** none (verification only).

- [ ] **Step 1: Start the stack**

Run: `docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d`
Expected: `ollama` container running (it will report unhealthy/starting until a model is pulled — that's expected, the healthcheck just runs `ollama list`).

- [ ] **Step 2: Pull the model** (one-time; persisted in the `ollama_data` volume for future sessions)

Run: `docker exec sentinel_ollama ollama pull llama3.2:3b`
Expected: downloads the model (a few GB, may take a few minutes depending on connection), ends with `success`.

- [ ] **Step 3: Sanity-check Ollama directly**

Run:

```bash
curl -s http://localhost:11434/api/generate -d '{"model": "llama3.2:3b", "prompt": "Say OK.", "stream": false}'
```

Expected: a JSON response with a non-empty `"response"` field.

- [ ] **Step 4: Run the engine locally against real Ollama**

Run: `cd apps/engine && OLLAMA_URL=http://localhost:11434 poetry run uvicorn sentinel_engine.main:app --port 8000`

In another terminal:

```bash
curl -s -X POST http://localhost:8000/probe/hallucination/reasoning \
  -H "Content-Type: application/json" \
  -d '{
    "steps": [
      "The user asked what the capital of France is.",
      "The capital of France is Paris.",
      "Paris has a population of exactly 50 million people."
    ],
    "conclusion": "The capital of France is Paris, a city of 50 million people."
  }'
```

Expected: `hallucination_detected: true`, with the third step (the wildly incorrect population claim — Paris's actual population is roughly 2 million, the metro area roughly 11 million, nowhere near 50 million) flagged `"supported": false`. **This is a real, non-deterministic model call** — if the model's exact wording differs or it misses this specific claim, that's useful signal about `llama3.2:3b`'s reliability for this task, not necessarily a bug in the code. Record what actually happened rather than assuming the ideal case.

- [ ] **Step 5: Clean up**

Stop the local `uvicorn` process. Leave the Docker stack running or stop it per your usual habit — the pulled model persists in the `ollama_data` volume either way.

- [ ] **Step 6: Record the result**

No commit for this task — fold the result (including the model's actual real-world accuracy on the test case) into Task 6's `CLAUDE.md` write-up.

---

### Task 6: `CLAUDE.md` Day 11 → Day 12 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 11 built and Task 5's actual smoke-test result — including how `llama3.2:3b` actually performed on the real test case (write once known, don't guess).

- [ ] **Step 2: Update "Next Session — Day 12"**

Plan file: `docs/superpowers/plans/2026-07-08-day12-hallucination-execution.md (to be written)`. Goal: hallucination engine — Execution stage (tool selection + parameter validation), per design spec line 329. Note that Day 8's tool-call schema validation (declared vs. actual parameters) already covers the "parameter validation" half of this — Day 12 likely only needs to add "tool selection" correctness (was the *right* tool chosen for the task), which may or may not need the judge at all depending on how it's scoped.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day11): update session context for day 12 handoff"
```
