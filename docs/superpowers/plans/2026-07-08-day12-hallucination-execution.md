# Day 12 — Hallucination Engine: Execution Stage Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execution-stage hallucination detection — tool selection + parameter validation, per the design spec's Phase 2 Day 12 deliverable.

**Architecture:** Parameter validation already exists and is correct — Day 8's SDK `tool_call()`/`toolCall()` methods validate declared-vs-actual parameters deterministically and store the result (`valid`, `errors`) in the trace's `attributes`. Re-implementing that check in the Python engine would triplicate logic that already lives correctly in both SDKs. So this detector's job is narrower and additive: **tool selection correctness** (was the *right* tool chosen for the task, not just was its call well-formed) — genuinely needs judgment, not a fixed rule, so it uses the `Judge`/`OllamaJudge` built Day 11. The endpoint accepts the caller's already-known parameter-validation result (`parameters_valid`, `parameter_errors` — pulled from the trace's existing `tool_call` span attributes by whoever calls this endpoint) and combines it with the new judged tool-selection check into one Execution-stage verdict: `hallucination_detected` is true if *either* the wrong tool was selected *or* its parameters were invalid.

Same judge-prompt reliability lesson from Day 11 applies: ask for a **line-based response** (`CORRECT_TOOL: <name>` / `REASON: <text>`), not JSON, and parse leniently with a conservative "flag it" default when unparseable.

**Tech Stack:** Python 3.12, FastAPI, the existing `Judge`/`OllamaJudge` (Day 11) — no new dependencies.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/engine/sentinel_engine/hallucination/execution.py` | Create | `ToolDefinition`, `ExecutionCritique`, `detect_execution_hallucination(...)` |
| `apps/engine/tests/hallucination/test_execution.py` | Create | Tests using a hand-rolled `FakeJudge` |
| `apps/engine/sentinel_engine/routers/probe.py` | Modify | Add `POST /probe/hallucination/execution` |
| `apps/engine/tests/test_probe_hallucination.py` | Modify | Add endpoint tests (append to the existing file) |
| `CLAUDE.md` | Modify | Day 12 → Day 13 handoff |

**No parallelization this day** — a single detector feeding a single endpoint, both with a hard sequential dependency on each other, and no new infra (the judge backend already exists from Day 11). All tasks done directly, in order.

---

### Task 1: Execution-stage hallucination detector

**Files:**
- Create: `apps/engine/sentinel_engine/hallucination/execution.py`
- Create: `apps/engine/tests/hallucination/test_execution.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/engine/tests/hallucination/test_execution.py`:

```python
from sentinel_engine.hallucination.execution import ToolDefinition, detect_execution_hallucination
from sentinel_engine.judge.base import Judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response
        self.last_prompt: str | None = None

    def complete(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self.response


TOOLS = [
    ToolDefinition(name="search_orders", description="Look up a customer's order history by order ID."),
    ToolDefinition(name="refund_order", description="Issue a refund for a given order ID."),
]


def test_correct_tool_and_valid_params_reports_no_hallucination():
    judge = FakeJudge("CORRECT_TOOL: search_orders\nREASON: The task only asks to look up an order.")

    critique = detect_execution_hallucination(
        judge,
        task="Look up order #12345",
        available_tools=TOOLS,
        selected_tool="search_orders",
        parameters_valid=True,
    )

    assert critique.hallucination_detected is False
    assert critique.tool_selection_correct is True
    assert critique.parameters_valid is True


def test_wrong_tool_selection_flags_hallucination():
    judge = FakeJudge("CORRECT_TOOL: search_orders\nREASON: A refund was not requested.")

    critique = detect_execution_hallucination(
        judge,
        task="Look up order #12345",
        available_tools=TOOLS,
        selected_tool="refund_order",
        parameters_valid=True,
    )

    assert critique.hallucination_detected is True
    assert critique.tool_selection_correct is False
    assert critique.correct_tool == "search_orders"


def test_invalid_parameters_flag_hallucination_even_with_correct_tool_selection():
    judge = FakeJudge("CORRECT_TOOL: search_orders\nREASON: Correct tool for the task.")

    critique = detect_execution_hallucination(
        judge,
        task="Look up order #12345",
        available_tools=TOOLS,
        selected_tool="search_orders",
        parameters_valid=False,
        parameter_errors=["root.order_id: required property missing"],
    )

    assert critique.hallucination_detected is True
    assert critique.tool_selection_correct is True
    assert critique.parameters_valid is False
    assert critique.parameter_errors == ["root.order_id: required property missing"]


def test_unparseable_judge_response_defaults_to_incorrect():
    judge = FakeJudge("I'm not sure.")

    critique = detect_execution_hallucination(
        judge, task="t", available_tools=TOOLS, selected_tool="search_orders", parameters_valid=True
    )

    assert critique.tool_selection_correct is False
    assert "could not parse" in critique.reason.lower()


def test_prompt_includes_task_tools_and_selected_tool():
    judge = FakeJudge("CORRECT_TOOL: search_orders\nREASON: ok")

    detect_execution_hallucination(
        judge,
        task="a unique task description",
        available_tools=TOOLS,
        selected_tool="search_orders",
        parameters_valid=True,
    )

    assert "a unique task description" in judge.last_prompt
    assert "search_orders" in judge.last_prompt
    assert "refund_order" in judge.last_prompt
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/hallucination/test_execution.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.hallucination.execution'`

- [ ] **Step 3: Write the implementation**

Create `apps/engine/sentinel_engine/hallucination/execution.py`:

```python
import re
from dataclasses import dataclass, field

from sentinel_engine.judge.base import Judge

_CORRECT_TOOL_PATTERN = re.compile(r"CORRECT_TOOL:\s*(.+)", re.IGNORECASE)
_REASON_PATTERN = re.compile(r"REASON:\s*(.+)", re.IGNORECASE)


@dataclass
class ToolDefinition:
    name: str
    description: str


@dataclass
class ExecutionCritique:
    correct_tool: str
    tool_selection_correct: bool
    reason: str
    parameters_valid: bool
    parameter_errors: list[str] = field(default_factory=list)

    @property
    def hallucination_detected(self) -> bool:
        return not self.tool_selection_correct or not self.parameters_valid


def _build_prompt(task: str, available_tools: list[ToolDefinition], selected_tool: str) -> str:
    tool_list = "\n".join(f"- {tool.name}: {tool.description}" for tool in available_tools)
    return (
        "You are evaluating whether an AI agent selected the correct tool for its task.\n\n"
        f"Task: {task}\n\n"
        f"Available tools:\n{tool_list}\n\n"
        f"The agent selected: {selected_tool}\n\n"
        "Respond in EXACTLY this format (no extra text):\n"
        "CORRECT_TOOL: <name of the tool that should have been used, or NONE if no tool call was needed>\n"
        "REASON: <one sentence>"
    )


def detect_execution_hallucination(
    judge: Judge,
    task: str,
    available_tools: list[ToolDefinition],
    selected_tool: str,
    parameters_valid: bool,
    parameter_errors: list[str] | None = None,
) -> ExecutionCritique:
    parameter_errors = parameter_errors or []
    prompt = _build_prompt(task, available_tools, selected_tool)
    response = judge.complete(prompt)

    correct_tool_match = _CORRECT_TOOL_PATTERN.search(response)
    if correct_tool_match:
        correct_tool = correct_tool_match.group(1).strip()
        tool_selection_correct = correct_tool.lower() == selected_tool.strip().lower()
        reason_match = _REASON_PATTERN.search(response)
        reason = reason_match.group(1).strip() if reason_match else ""
    else:
        correct_tool = ""
        tool_selection_correct = False
        reason = "Could not parse a judge verdict for tool selection."

    return ExecutionCritique(
        correct_tool=correct_tool,
        tool_selection_correct=tool_selection_correct,
        reason=reason,
        parameters_valid=parameters_valid,
        parameter_errors=parameter_errors,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/hallucination/test_execution.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/hallucination/execution.py apps/engine/tests/hallucination/test_execution.py
git commit -m "feat(day12): execution-stage hallucination detector (tool selection + parameter validation)"
```

---

### Task 2: `POST /probe/hallucination/execution` endpoint

**Files:**
- Modify: `apps/engine/sentinel_engine/routers/probe.py`
- Modify: `apps/engine/tests/test_probe_hallucination.py`

**Depends on:** Task 1.

- [ ] **Step 1: Write the failing tests**

Append to the END of `apps/engine/tests/test_probe_hallucination.py` (keep everything already in that file — the `FakeJudge`, the fixture, and the two existing test functions — unchanged):

```python
def test_critique_execution_returns_structured_result():
    app.dependency_overrides[get_judge] = lambda: FakeJudge(
        "CORRECT_TOOL: search_orders\nREASON: Correct tool for a lookup task."
    )
    client = TestClient(app)

    response = client.post(
        "/probe/hallucination/execution",
        json={
            "task": "Look up order #12345",
            "available_tools": [
                {"name": "search_orders", "description": "Look up an order by ID."},
                {"name": "refund_order", "description": "Issue a refund."},
            ],
            "selected_tool": "search_orders",
            "parameters_valid": True,
            "parameter_errors": [],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["hallucination_detected"] is False
    assert body["tool_selection_correct"] is True
    assert body["correct_tool"] == "search_orders"


def test_critique_execution_flags_invalid_parameters():
    app.dependency_overrides[get_judge] = lambda: FakeJudge(
        "CORRECT_TOOL: search_orders\nREASON: Correct tool."
    )
    client = TestClient(app)

    response = client.post(
        "/probe/hallucination/execution",
        json={
            "task": "Look up order #12345",
            "available_tools": [{"name": "search_orders", "description": "Look up an order by ID."}],
            "selected_tool": "search_orders",
            "parameters_valid": False,
            "parameter_errors": ["root.order_id: required property missing"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["hallucination_detected"] is True
    assert body["parameter_errors"] == ["root.order_id: required property missing"]


def test_critique_execution_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/probe/hallucination/execution", json={"task": "t"})

    assert response.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/test_probe_hallucination.py -v`
Expected: the 2 pre-existing tests still pass; the 3 new ones FAIL with 404 (route doesn't exist yet).

- [ ] **Step 3: Write the implementation**

In `apps/engine/sentinel_engine/routers/probe.py`, add this import alongside the existing `from sentinel_engine.hallucination.reasoning import detect_reasoning_hallucination` line:

```python
from sentinel_engine.hallucination.execution import ToolDefinition, detect_execution_hallucination
```

Then append this to the END of the file (after the existing `critique_reasoning` function, keep everything above unchanged):

```python
class ToolDefinitionRequest(BaseModel):
    name: str
    description: str


class ExecutionCritiqueRequest(BaseModel):
    task: str
    available_tools: list[ToolDefinitionRequest]
    selected_tool: str
    parameters_valid: bool
    parameter_errors: list[str] = []


class ExecutionCritiqueResponse(BaseModel):
    correct_tool: str
    tool_selection_correct: bool
    reason: str
    parameters_valid: bool
    parameter_errors: list[str]
    hallucination_detected: bool


@router.post("/hallucination/execution", response_model=ExecutionCritiqueResponse)
def critique_execution(
    request: ExecutionCritiqueRequest, judge: Judge = Depends(get_judge)
) -> ExecutionCritiqueResponse:
    critique = detect_execution_hallucination(
        judge,
        task=request.task,
        available_tools=[ToolDefinition(name=t.name, description=t.description) for t in request.available_tools],
        selected_tool=request.selected_tool,
        parameters_valid=request.parameters_valid,
        parameter_errors=request.parameter_errors,
    )
    return ExecutionCritiqueResponse(
        correct_tool=critique.correct_tool,
        tool_selection_correct=critique.tool_selection_correct,
        reason=critique.reason,
        parameters_valid=critique.parameters_valid,
        parameter_errors=critique.parameter_errors,
        hallucination_detected=critique.hallucination_detected,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest -v`
Expected: all pass (16 pre-existing + 5 from Task 1 + 3 from this task = 24 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/routers/probe.py apps/engine/tests/test_probe_hallucination.py
git commit -m "feat(day12): POST /probe/hallucination/execution endpoint"
```

---

### Task 3: Smoke test against real Ollama

**Depends on:** Task 2.

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `cd apps/engine && poetry run pytest -v`
Expected: 24 passed.

- [ ] **Step 2: Run the engine locally against real Ollama**

Ollama and `llama3.2:3b` are already running/pulled from Day 11 — confirm with `docker exec sentinel_ollama ollama list`. If the container isn't running, `docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d ollama` first (the model persists in the volume, no re-pull needed).

Run: `cd apps/engine && OLLAMA_URL=http://localhost:11434 poetry run uvicorn sentinel_engine.main:app --port 8000`

In another terminal, deliberately send a mismatched tool selection to see if the model catches it:

```bash
curl -s -X POST http://localhost:8000/probe/hallucination/execution \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Look up the customer'"'"'s order history for order #12345",
    "available_tools": [
      {"name": "search_orders", "description": "Look up a customer order by ID, returns order status and items."},
      {"name": "issue_refund", "description": "Issue a monetary refund for a given order ID."},
      {"name": "send_email", "description": "Send an email to a customer address."}
    ],
    "selected_tool": "issue_refund",
    "parameters_valid": true,
    "parameter_errors": []
  }'
```

Expected: `hallucination_detected: true`, `tool_selection_correct: false`, `correct_tool` naming `search_orders`. **Record what the model actually returns**, including its exact `reason` text — do not assume it matches this description exactly; this is a real, non-deterministic model call.

- [ ] **Step 3: Clean up**

Stop the local `uvicorn` process.

- [ ] **Step 4: Record the result**

No commit for this task — fold the result into Task 4's `CLAUDE.md` write-up.

---

### Task 4: `CLAUDE.md` Day 12 → Day 13 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 12 built and Task 3's actual smoke-test result (write once known, don't guess).

- [ ] **Step 2: Update "Next Session — Day 13"**

Plan file: `docs/superpowers/plans/2026-07-09-day13-hallucination-perception-communication.md (to be written)`. Goal: hallucination engine — Perception + Communication stage detectors, per design spec line 330. Note both new detectors can reuse the same `Judge`/`OllamaJudge` and the line-based-response-format lesson from Days 11-12.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day12): update session context for day 13 handoff"
```
