# Day 17 — Mirror LLM Judge Scorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An LLM judge scorer that rates a Mirror provider response's quality — correctness, relevance, tone — per the design spec's Phase 3 Day 17 deliverable.

**Architecture:** This is a different "judge" than Day 16's four providers. Day 16's providers ARE the feature under test (Mirror calls external AI products the customer already sends data to). Scoring the QUALITY of what came back is an internal Sentinel operation — grading it by calling out to a second external provider would silently violate the "no data leaves the deployment" principle (design spec §12) for what is, at that point, the customer's own test data. So this reuses the **local** `Judge`/`OllamaJudge` from Day 11, not Mirror's providers.

Scoring uses the same reliable **line-based response format** established Days 11-14 (`DIMENSION: <value>`, not JSON), scaled 1-5 per dimension rather than a boolean, since "quality" is inherently more graded than a hallucination yes/no. Per Day 14's finding (all judge-backed detectors have real false-positive/unparseable rates against `llama3.2:3b`), any dimension the judge fails to produce a parseable line for defaults to `None` (never a made-up number) — and this day's live smoke test explicitly re-runs the same input multiple times before drawing any conclusion, correcting Days 11/13's mistake of concluding "reliable" from a single lucky draw.

**One small, necessary refactor first (not scope creep — Day 17 genuinely needs it):** `get_judge()` currently lives inside `sentinel_engine/routers/probe.py`, which is fine when only Probe needed it, but Mirror needs the identical function now and importing it from another router module would be an awkward, backwards dependency (`mirror.py` reaching into `probe.py`). Moving it to `sentinel_engine/judge/dependency.py` (alongside the `Judge`/`OllamaJudge` it already constructs) is the natural home. Because `probe.py` will still `from sentinel_engine.judge import get_judge` and use the exact same function object, this is transparent to Days 11-13's existing tests — nothing about their behavior changes, only where the one function is defined.

**Unlike Day 16, this day's live smoke test IS possible** — it uses the already-running local Ollama, not an external provider needing a key nobody has.

**Tech Stack:** Python 3.12, FastAPI, the existing `Judge`/`OllamaJudge` — no new dependencies.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/engine/sentinel_engine/judge/dependency.py` | Create | `get_judge()` (moved from `routers/probe.py`) |
| `apps/engine/sentinel_engine/judge/__init__.py` | Modify | Re-export `get_judge` alongside `Judge`/`OllamaJudge` |
| `apps/engine/sentinel_engine/routers/probe.py` | Modify | Import `get_judge` from `sentinel_engine.judge` instead of defining it locally |
| `apps/engine/sentinel_engine/mirror/quality.py` | Create | `QualityScore`, `score_quality(judge, prompt, response, expected_answer=None)` |
| `apps/engine/tests/mirror/test_quality.py` | Create | Tests using a hand-rolled `FakeJudge` |
| `apps/engine/sentinel_engine/routers/mirror.py` | Modify | Add `POST /mirror/score` |
| `apps/engine/tests/test_mirror_run.py` | Modify | Add endpoint tests for `/mirror/score` (append) |
| `CLAUDE.md` | Modify | Day 17 → Day 18 handoff |

## Parallelization note

**Round 1 — two independent tracks (parallel, isolated worktrees):** Task 1 (the `get_judge` refactor — touches only `judge/` and `routers/probe.py`) and Task 2 (`quality.py`'s pure scoring logic — takes a `Judge` parameter, never imports `get_judge` itself, so it has zero dependency on where that function lives). These share no files.

**Sequential, after Round 1 merges (small, done directly):** Task 3 (the `/mirror/score` endpoint — needs both Task 1's relocated `get_judge` and Task 2's `score_quality` merged), Task 4 (live smoke test against real Ollama, multiple draws), Task 5 (handoff).

---

### Task 1: Move `get_judge` into the `judge` package

**Files:**
- Create: `apps/engine/sentinel_engine/judge/dependency.py`
- Modify: `apps/engine/sentinel_engine/judge/__init__.py`
- Modify: `apps/engine/sentinel_engine/routers/probe.py`

**Depends on:** nothing from this plan's other tasks.

- [ ] **Step 1: Create `dependency.py`**

Create `apps/engine/sentinel_engine/judge/dependency.py`:

```python
import os

from .base import Judge
from .ollama_judge import OllamaJudge


def get_judge() -> Judge:
    return OllamaJudge(
        base_url=os.environ.get("OLLAMA_URL", "http://localhost:11434"),
        model=os.environ.get("OLLAMA_MODEL", "llama3.2:3b"),
    )
```

- [ ] **Step 2: Re-export it from the package**

Replace the full contents of `apps/engine/sentinel_engine/judge/__init__.py`:

```python
from .base import Judge
from .dependency import get_judge
from .ollama_judge import OllamaJudge

__all__ = ["Judge", "OllamaJudge", "get_judge"]
```

- [ ] **Step 3: Update `probe.py` to import it instead of defining it**

In `apps/engine/sentinel_engine/routers/probe.py`, remove these lines near the top:

```python
import os
```

(only remove `import os` if nothing else in the file still uses `os` — check first; as of this plan nothing else does) and:

```python
from sentinel_engine.judge.base import Judge
from sentinel_engine.judge.ollama_judge import OllamaJudge
```

Replace them with:

```python
from sentinel_engine.judge import Judge, get_judge
```

Then remove the local `get_judge` function definition entirely:

```python
def get_judge() -> Judge:
    return OllamaJudge(
        base_url=os.environ.get("OLLAMA_URL", "http://localhost:11434"),
        model=os.environ.get("OLLAMA_MODEL", "llama3.2:3b"),
    )
```

Leave every route handler and Pydantic model in the file exactly as-is — they all reference `get_judge`/`Judge` by name, which now resolve via the new import instead of a local definition, with no other change needed.

- [ ] **Step 4: Run the full test suite to confirm this refactor is transparent**

Run: `cd apps/engine && poetry run pytest -v`
Expected: all 54 tests still pass, including every existing `tests/test_probe_hallucination.py` test that does `from sentinel_engine.routers.probe import get_judge` and `app.dependency_overrides[get_judge] = ...` — this must keep working unchanged, since Python import aliasing means `sentinel_engine.routers.probe.get_judge` is the same function object either way.

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/judge apps/engine/sentinel_engine/routers/probe.py
git commit -m "refactor(day17): move get_judge into the judge package so Mirror can use it without importing from probe.py"
```

---

### Task 2: `score_quality`

**Files:**
- Create: `apps/engine/sentinel_engine/mirror/quality.py`
- Create: `apps/engine/tests/mirror/test_quality.py`

**Depends on:** nothing from this plan's other tasks — takes a `Judge` instance as a parameter, never imports `get_judge`.

- [ ] **Step 1: Write the failing tests**

Create `apps/engine/tests/mirror/test_quality.py`:

```python
from sentinel_engine.mirror.quality import score_quality
from sentinel_engine.judge.base import Judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response
        self.last_prompt: str | None = None

    def complete(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self.response


def test_parses_all_three_scores_and_reason():
    judge = FakeJudge("CORRECTNESS: 4\nRELEVANCE: 5\nTONE: 3\nREASON: Accurate but slightly terse.")

    result = score_quality(judge, prompt="What is 2+2?", response="4")

    assert result.correctness == 4
    assert result.relevance == 5
    assert result.tone == 3
    assert result.reason == "Accurate but slightly terse."


def test_missing_dimension_defaults_to_none():
    judge = FakeJudge("CORRECTNESS: 4\nRELEVANCE: 5\nREASON: ok")  # no TONE line

    result = score_quality(judge, prompt="p", response="r")

    assert result.correctness == 4
    assert result.relevance == 5
    assert result.tone is None


def test_completely_unparseable_response_returns_all_none_with_a_clear_reason():
    judge = FakeJudge("I cannot evaluate this.")

    result = score_quality(judge, prompt="p", response="r")

    assert result.correctness is None
    assert result.relevance is None
    assert result.tone is None
    assert "could not parse" in result.reason.lower()


def test_prompt_includes_the_prompt_and_response():
    judge = FakeJudge("CORRECTNESS: 3\nRELEVANCE: 3\nTONE: 3\nREASON: ok")

    score_quality(judge, prompt="a unique prompt", response="a unique response")

    assert "a unique prompt" in judge.last_prompt
    assert "a unique response" in judge.last_prompt


def test_prompt_includes_expected_answer_when_given():
    judge = FakeJudge("CORRECTNESS: 3\nRELEVANCE: 3\nTONE: 3\nREASON: ok")

    score_quality(judge, prompt="p", response="r", expected_answer="a unique expected answer")

    assert "a unique expected answer" in judge.last_prompt


def test_prompt_omits_expected_answer_section_when_not_given():
    judge = FakeJudge("CORRECTNESS: 3\nRELEVANCE: 3\nTONE: 3\nREASON: ok")

    score_quality(judge, prompt="p", response="r")

    assert "Expected/reference answer" not in judge.last_prompt
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/mirror/test_quality.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.mirror.quality'`

- [ ] **Step 3: Write the implementation**

Create `apps/engine/sentinel_engine/mirror/quality.py`:

```python
import re
from dataclasses import dataclass

from sentinel_engine.judge.base import Judge

_SCORE_PATTERNS = {
    "correctness": re.compile(r"CORRECTNESS:\s*(\d)", re.IGNORECASE),
    "relevance": re.compile(r"RELEVANCE:\s*(\d)", re.IGNORECASE),
    "tone": re.compile(r"TONE:\s*(\d)", re.IGNORECASE),
}
_REASON_PATTERN = re.compile(r"REASON:\s*(.+)", re.IGNORECASE)


@dataclass
class QualityScore:
    correctness: int | None
    relevance: int | None
    tone: int | None
    reason: str


def _build_prompt(prompt: str, response: str, expected_answer: str | None) -> str:
    expected_section = f"\n\nExpected/reference answer: {expected_answer}" if expected_answer else ""
    correctness_question = "is the response factually accurate"
    if expected_answer:
        correctness_question += " and consistent with the expected answer"
    correctness_question += "?"

    return (
        "You are scoring an AI system's response to a prompt on three dimensions, "
        "each on a scale of 1 (poor) to 5 (excellent).\n\n"
        f"Prompt: {prompt}\n\n"
        f"Response: {response}"
        f"{expected_section}\n\n"
        f"CORRECTNESS: {correctness_question}\n"
        "RELEVANCE: does the response actually address the prompt?\n"
        "TONE: is the tone appropriate and professional?\n\n"
        "Respond in EXACTLY this format (no extra text):\n"
        "CORRECTNESS: <1-5>\n"
        "RELEVANCE: <1-5>\n"
        "TONE: <1-5>\n"
        "REASON: <one sentence>"
    )


def score_quality(
    judge: Judge, prompt: str, response: str, expected_answer: str | None = None
) -> QualityScore:
    judge_prompt = _build_prompt(prompt, response, expected_answer)
    raw = judge.complete(judge_prompt)

    scores: dict[str, int | None] = {}
    for dimension, pattern in _SCORE_PATTERNS.items():
        match = pattern.search(raw)
        scores[dimension] = int(match.group(1)) if match else None

    reason_match = _REASON_PATTERN.search(raw)
    if reason_match:
        reason = reason_match.group(1).strip()
    elif all(value is None for value in scores.values()):
        reason = "Could not parse a judge response."
    else:
        reason = ""

    return QualityScore(
        correctness=scores["correctness"],
        relevance=scores["relevance"],
        tone=scores["tone"],
        reason=reason,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/mirror/test_quality.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/mirror/quality.py apps/engine/tests/mirror/test_quality.py
git commit -m "feat(day17): score_quality — LLM judge scorer for Mirror response quality"
```

---

### Task 3: `POST /mirror/score` endpoint

**Files:**
- Modify: `apps/engine/sentinel_engine/routers/mirror.py`
- Modify: `apps/engine/tests/test_mirror_run.py`

**Depends on:** Task 1 and Task 2 both merged.

- [ ] **Step 1: Write the failing tests**

Append to the END of `apps/engine/tests/test_mirror_run.py` (keep everything already in that file unchanged — the existing `FakeProvider`, fixture, and 3 tests):

```python
from sentinel_engine.judge.base import Judge
from sentinel_engine.routers.mirror import get_judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response

    def complete(self, prompt: str) -> str:
        return self.response


def test_score_returns_structured_result():
    app.dependency_overrides[get_judge] = lambda: FakeJudge(
        "CORRECTNESS: 5\nRELEVANCE: 4\nTONE: 5\nREASON: Accurate and well-toned."
    )
    client = TestClient(app)

    response = client.post(
        "/mirror/score",
        json={"prompt": "What is 2+2?", "response": "4"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "correctness": 5,
        "relevance": 4,
        "tone": 5,
        "reason": "Accurate and well-toned.",
    }


def test_score_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/mirror/score", json={"prompt": "p"})

    assert response.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/test_mirror_run.py -v`
Expected: the 3 pre-existing tests still pass; the 2 new ones FAIL with 404 (no `/mirror/score` route yet) and `ImportError` (`get_judge` doesn't exist in `sentinel_engine.routers.mirror` yet).

- [ ] **Step 3: Write the implementation**

In `apps/engine/sentinel_engine/routers/mirror.py`, add this import alongside the existing ones:

```python
from sentinel_engine.judge import Judge, get_judge
from sentinel_engine.mirror.quality import score_quality
```

Then append this to the END of the file:

```python
class ScoreResponseRequest(BaseModel):
    prompt: str
    response: str
    expected_answer: str | None = None


class ScoreResponseResponse(BaseModel):
    correctness: int | None
    relevance: int | None
    tone: int | None
    reason: str


@router.post("/score", response_model=ScoreResponseResponse)
def score(request: ScoreResponseRequest, judge: Judge = Depends(get_judge)) -> ScoreResponseResponse:
    result = score_quality(judge, request.prompt, request.response, request.expected_answer)
    return ScoreResponseResponse(
        correctness=result.correctness,
        relevance=result.relevance,
        tone=result.tone,
        reason=result.reason,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest -v`
Expected: all pass (54 pre-existing + 6 quality + 2 endpoint = 62 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/routers/mirror.py apps/engine/tests/test_mirror_run.py
git commit -m "feat(day17): POST /mirror/score endpoint"
```

---

### Task 4: Live smoke test against real Ollama — multiple draws, not one

**Depends on:** Task 3 merged.

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `cd apps/engine && poetry run pytest -v`
Expected: 62 passed.

- [ ] **Step 2: Confirm Ollama is up**

Run: `docker exec sentinel_ollama ollama list` — expect `llama3.2:3b` already present from Day 11 (no re-pull needed).

- [ ] **Step 3: Run the engine locally against real Ollama**

Run: `cd apps/engine && OLLAMA_URL=http://localhost:11434 poetry run uvicorn sentinel_engine.main:app --port 8000`

- [ ] **Step 4: Score a genuinely good response, 3 times**

```bash
for i in 1 2 3; do
curl -s -X POST http://localhost:8000/mirror/score \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?",
    "response": "The capital of France is Paris.",
    "expected_answer": "Paris"
  }'
echo ""
done
```

Expected: all three calls return high `correctness`/`relevance` scores (4-5) and a plausible `reason`. **Per Day 14's lesson, do not stop after one call and call it "reliable" — record what all three actually returned**, including if any of them come back with unexpectedly low scores, `null` fields, or an obviously wrong `reason` (e.g., claiming Paris is factually wrong). Write down the real distribution, not the best result.

- [ ] **Step 5: Score a genuinely bad response, 3 times**

```bash
for i in 1 2 3; do
curl -s -X POST http://localhost:8000/mirror/score \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?",
    "response": "The capital of France is Berlin, and it has a population of 50 million.",
    "expected_answer": "Paris"
  }'
echo ""
done
```

Expected: all three calls return a LOW `correctness` score (1-2) and a `reason` that actually identifies the error. Record the real results, including any run where the judge scores this incorrectly high or fails to parse — that's the real finding, not an inconvenience to omit.

- [ ] **Step 6: Clean up**

Stop the local `uvicorn` process.

- [ ] **Step 7: Record the result**

No commit for this task — fold the full, honest result (including any failures across the 6 live calls) into Task 5's `CLAUDE.md` write-up.

---

### Task 5: `CLAUDE.md` Day 17 → Day 18 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 17 built and Task 4's actual multi-draw smoke-test results in full (write once known, don't guess, don't cherry-pick the best run).

- [ ] **Step 2: Update "Next Session — Day 18"**

Plan file: `docs/superpowers/plans/2026-07-14-day18-mirror-drift-detection.md (to be written)`. Goal: model drift detection — compare a current run against a stored baseline, flag regressions, per design spec line 338. Note this needs a place to persist baseline runs/scores somewhere (Postgres, matching Probe's `TestRun` pattern, or a new Mirror-specific model) — nothing in Mirror has been persisted anywhere yet (Days 16-17 are both stateless request/response endpoints); Day 18 is likely the first day Mirror needs its own Prisma models.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day17): update session context for day 18 handoff"
```
