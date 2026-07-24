# Day 13 — Hallucination Engine: Perception + Communication Stage Detectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two more hallucination-taxonomy detectors — Perception (did the agent correctly read its retrieved context) and Communication (does its final message faithfully reflect what it actually found) — per the design spec's Phase 2 Day 13 deliverable.

**Architecture:** Both reuse the `Judge`/`OllamaJudge` and `llama3.2:3b` from Day 11, and both apply the reliability lesson recorded from Days 11-12: **this model is reliable at yes/no-style verdicts, not reliable at naming a "correct" alternative.** So:
- **Perception** (`sentinel_engine/hallucination/perception.py`) mirrors Day 11's reasoning detector almost exactly in shape — given a context and a list of claims the agent made about it, verdict each claim `SUPPORTED`/`UNSUPPORTED` against *only that context* (general knowledge does NOT count here — perception means correctly reading what was actually given, nothing else). Same per-item line format, same lenient parsing, same "unparseable defaults to flagged" conservatism as Day 11.
- **Communication** (`sentinel_engine/hallucination/communication.py`) is a single holistic verdict, not per-item — given the agent's internal facts/conclusions and its final user-facing message, one verdict: `FAITHFUL`/`UNFAITHFUL`. This is a boolean-ish ask (not "name what it should have said"), matching the pattern that has proven reliable so far.

Both are new API endpoints (`POST /probe/hallucination/perception`, `POST /probe/hallucination/communication`), same `Depends(get_judge)` pattern as Days 11-12.

**Tech Stack:** Python 3.12, FastAPI, the existing `Judge`/`OllamaJudge` — no new dependencies.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/engine/sentinel_engine/hallucination/perception.py` | Create | `detect_perception_hallucination(judge, context, claims) -> PerceptionCritique` |
| `apps/engine/tests/hallucination/test_perception.py` | Create | Tests using a hand-rolled `FakeJudge` |
| `apps/engine/sentinel_engine/hallucination/communication.py` | Create | `detect_communication_hallucination(judge, internal_facts, final_message) -> CommunicationCritique` |
| `apps/engine/tests/hallucination/test_communication.py` | Create | Tests |
| `apps/engine/sentinel_engine/routers/probe.py` | Modify | Add both endpoints |
| `apps/engine/tests/test_probe_hallucination.py` | Modify | Add endpoint tests (append) |
| `CLAUDE.md` | Modify | Day 13 → Day 14 handoff |

## Parallelization note

**Round 1 — two independent tracks (parallel, isolated worktrees):** Task 1 (perception detector) and Task 2 (communication detector) touch entirely disjoint files and share no code between them.

**Sequential, after Round 1 merges (small, done directly, not worth a worktree round-trip):** Task 3 (both endpoints — needs both detectors merged first), Task 4 (smoke test), Task 5 (handoff).

---

### Task 1: Perception-stage hallucination detector

**Files:**
- Create: `apps/engine/sentinel_engine/hallucination/perception.py`
- Create: `apps/engine/tests/hallucination/test_perception.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/engine/tests/hallucination/test_perception.py`:

```python
from sentinel_engine.hallucination.perception import detect_perception_hallucination
from sentinel_engine.judge.base import Judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response
        self.last_prompt: str | None = None

    def complete(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self.response


CONTEXT = "The order was placed on 2026-07-01 and shipped on 2026-07-03. Status: delivered."


def test_all_claims_supported_reports_no_hallucination():
    judge = FakeJudge(
        "CLAIM 1: SUPPORTED - The context states the order shipped on 2026-07-03.\n"
        "CLAIM 2: SUPPORTED - The context states the status is delivered."
    )
    claims = ["The order shipped on 2026-07-03.", "The order has been delivered."]

    critique = detect_perception_hallucination(judge, CONTEXT, claims)

    assert critique.hallucination_detected is False
    assert len(critique.claim_critiques) == 2


def test_unsupported_claim_flags_hallucination():
    judge = FakeJudge(
        "CLAIM 1: SUPPORTED - Matches the context.\n"
        "CLAIM 2: UNSUPPORTED - The context never mentions a refund."
    )
    claims = ["The order shipped on 2026-07-03.", "The order was refunded."]

    critique = detect_perception_hallucination(judge, CONTEXT, claims)

    assert critique.hallucination_detected is True
    assert critique.claim_critiques[1].supported is False
    assert critique.claim_critiques[1].explanation == "The context never mentions a refund."


def test_missing_verdict_line_defaults_to_unsupported():
    judge = FakeJudge("CLAIM 1: SUPPORTED - ok")  # no line for claim 2
    claims = ["claim one", "claim two"]

    critique = detect_perception_hallucination(judge, CONTEXT, claims)

    assert critique.claim_critiques[1].supported is False
    assert "could not parse" in critique.claim_critiques[1].explanation.lower()


def test_empty_claims_returns_empty_critique_without_calling_the_judge():
    judge = FakeJudge("irrelevant")

    critique = detect_perception_hallucination(judge, CONTEXT, [])

    assert critique.claim_critiques == []
    assert critique.hallucination_detected is False
    assert judge.last_prompt is None


def test_prompt_includes_context_and_claims_and_excludes_general_knowledge():
    judge = FakeJudge("CLAIM 1: SUPPORTED - ok")

    detect_perception_hallucination(judge, CONTEXT, ["a specific claim"])

    assert CONTEXT in judge.last_prompt
    assert "a specific claim" in judge.last_prompt
    assert "general knowledge" in judge.last_prompt.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/hallucination/test_perception.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.hallucination.perception'`

- [ ] **Step 3: Write the implementation**

Create `apps/engine/sentinel_engine/hallucination/perception.py`:

```python
import re
from dataclasses import dataclass

from sentinel_engine.judge.base import Judge

_CLAIM_LINE_PATTERN = re.compile(r"CLAIM\s+(\d+):\s*(SUPPORTED|UNSUPPORTED)\s*-\s*(.+)", re.IGNORECASE)


@dataclass
class ClaimCritique:
    claim: str
    supported: bool
    explanation: str


@dataclass
class PerceptionCritique:
    claim_critiques: list[ClaimCritique]

    @property
    def hallucination_detected(self) -> bool:
        return any(not critique.supported for critique in self.claim_critiques)


def _build_prompt(context: str, claims: list[str]) -> str:
    numbered_claims = "\n".join(f"{i + 1}. {claim}" for i, claim in enumerate(claims))
    return (
        "You are evaluating whether an AI agent correctly perceived a piece of retrieved "
        "context. Below is the context it was given, followed by claims the agent made "
        "about that context.\n\n"
        f"Context:\n{context}\n\n"
        f"Claims:\n{numbered_claims}\n\n"
        "A claim is UNSUPPORTED if the context does not state it, or if it contradicts "
        "the context. General knowledge outside the context does NOT count as support "
        "here -- perception means correctly reading THIS context, nothing else.\n\n"
        "For EACH claim, respond on its own line in EXACTLY this format (no extra text):\n"
        "CLAIM <n>: SUPPORTED|UNSUPPORTED - <one sentence reason>"
    )


def detect_perception_hallucination(judge: Judge, context: str, claims: list[str]) -> PerceptionCritique:
    if not claims:
        return PerceptionCritique(claim_critiques=[])

    prompt = _build_prompt(context, claims)
    response = judge.complete(prompt)

    verdicts_by_claim_number: dict[int, tuple[bool, str]] = {}
    for line in response.splitlines():
        match = _CLAIM_LINE_PATTERN.search(line)
        if not match:
            continue
        claim_number = int(match.group(1))
        supported = match.group(2).upper() == "SUPPORTED"
        explanation = match.group(3).strip()
        verdicts_by_claim_number[claim_number] = (supported, explanation)

    critiques = []
    for index, claim in enumerate(claims):
        claim_number = index + 1
        if claim_number in verdicts_by_claim_number:
            supported, explanation = verdicts_by_claim_number[claim_number]
        else:
            supported, explanation = False, "Could not parse a judge verdict for this claim."
        critiques.append(ClaimCritique(claim=claim, supported=supported, explanation=explanation))

    return PerceptionCritique(claim_critiques=critiques)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/hallucination/test_perception.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/hallucination/perception.py apps/engine/tests/hallucination/test_perception.py
git commit -m "feat(day13): perception-stage hallucination detector"
```

---

### Task 2: Communication-stage hallucination detector

**Files:**
- Create: `apps/engine/sentinel_engine/hallucination/communication.py`
- Create: `apps/engine/tests/hallucination/test_communication.py`

**Depends on:** nothing from this plan's other tasks — fully independent of Task 1.

- [ ] **Step 1: Write the failing tests**

Create `apps/engine/tests/hallucination/test_communication.py`:

```python
from sentinel_engine.hallucination.communication import detect_communication_hallucination
from sentinel_engine.judge.base import Judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response
        self.last_prompt: str | None = None

    def complete(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self.response


def test_faithful_message_reports_no_hallucination():
    judge = FakeJudge("VERDICT: FAITHFUL\nREASON: The message matches the internal facts exactly.")
    facts = ["The order total is $42.50.", "The order shipped on 2026-07-03."]

    critique = detect_communication_hallucination(
        judge, facts, final_message="Your order totals $42.50 and shipped on 2026-07-03."
    )

    assert critique.hallucination_detected is False
    assert critique.faithful is True


def test_unfaithful_message_flags_hallucination():
    judge = FakeJudge("VERDICT: UNFAITHFUL\nREASON: The message claims a refund that was never processed.")
    facts = ["The order total is $42.50.", "No refund has been issued."]

    critique = detect_communication_hallucination(
        judge, facts, final_message="Your order totals $42.50 and has been fully refunded."
    )

    assert critique.hallucination_detected is True
    assert critique.faithful is False
    assert critique.reason == "The message claims a refund that was never processed."


def test_unparseable_judge_response_defaults_to_unfaithful():
    judge = FakeJudge("Not sure how to evaluate this.")

    critique = detect_communication_hallucination(judge, ["a fact"], final_message="a message")

    assert critique.faithful is False
    assert "could not parse" in critique.reason.lower()


def test_prompt_includes_facts_and_final_message():
    judge = FakeJudge("VERDICT: FAITHFUL\nREASON: ok")

    detect_communication_hallucination(judge, ["a unique fact"], final_message="a unique final message")

    assert "a unique fact" in judge.last_prompt
    assert "a unique final message" in judge.last_prompt
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/hallucination/test_communication.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.hallucination.communication'`

- [ ] **Step 3: Write the implementation**

Create `apps/engine/sentinel_engine/hallucination/communication.py`:

```python
import re
from dataclasses import dataclass

from sentinel_engine.judge.base import Judge

_VERDICT_PATTERN = re.compile(r"VERDICT:\s*(FAITHFUL|UNFAITHFUL)", re.IGNORECASE)
_REASON_PATTERN = re.compile(r"REASON:\s*(.+)", re.IGNORECASE)


@dataclass
class CommunicationCritique:
    faithful: bool
    reason: str

    @property
    def hallucination_detected(self) -> bool:
        return not self.faithful


def _build_prompt(internal_facts: list[str], final_message: str) -> str:
    bulleted_facts = "\n".join(f"- {fact}" for fact in internal_facts)
    return (
        "You are evaluating whether an AI agent's final message to the user faithfully "
        "communicates what it actually found/concluded internally.\n\n"
        f"Internal facts/conclusions:\n{bulleted_facts}\n\n"
        f"Final message shown to the user:\n{final_message}\n\n"
        "The message is UNFAITHFUL if it contradicts an internal fact, invents a claim "
        "not present in the internal facts, or omits a critical caveat that changes the "
        "meaning for the user.\n\n"
        "Respond in EXACTLY this format (no extra text):\n"
        "VERDICT: FAITHFUL|UNFAITHFUL\n"
        "REASON: <one sentence>"
    )


def detect_communication_hallucination(
    judge: Judge, internal_facts: list[str], final_message: str
) -> CommunicationCritique:
    prompt = _build_prompt(internal_facts, final_message)
    response = judge.complete(prompt)

    verdict_match = _VERDICT_PATTERN.search(response)
    if verdict_match:
        faithful = verdict_match.group(1).upper() == "FAITHFUL"
        reason_match = _REASON_PATTERN.search(response)
        reason = reason_match.group(1).strip() if reason_match else ""
    else:
        faithful = False
        reason = "Could not parse a judge verdict for communication faithfulness."

    return CommunicationCritique(faithful=faithful, reason=reason)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest tests/hallucination/test_communication.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/hallucination/communication.py apps/engine/tests/hallucination/test_communication.py
git commit -m "feat(day13): communication-stage hallucination detector"
```

---

### Task 3: `POST /probe/hallucination/perception` and `.../communication` endpoints

**Files:**
- Modify: `apps/engine/sentinel_engine/routers/probe.py`
- Modify: `apps/engine/tests/test_probe_hallucination.py`

**Depends on:** Task 1 and Task 2 both merged.

- [ ] **Step 1: Write the failing tests**

Append to the END of `apps/engine/tests/test_probe_hallucination.py` (keep everything already there unchanged):

```python
def test_critique_perception_returns_structured_result():
    app.dependency_overrides[get_judge] = lambda: FakeJudge(
        "CLAIM 1: SUPPORTED - ok\nCLAIM 2: UNSUPPORTED - not in context"
    )
    client = TestClient(app)

    response = client.post(
        "/probe/hallucination/perception",
        json={"context": "some retrieved text", "claims": ["claim one", "claim two"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["hallucination_detected"] is True
    assert len(body["claim_critiques"]) == 2


def test_critique_perception_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/probe/hallucination/perception", json={"context": "c"})

    assert response.status_code == 422


def test_critique_communication_returns_structured_result():
    app.dependency_overrides[get_judge] = lambda: FakeJudge("VERDICT: UNFAITHFUL\nREASON: contradiction")
    client = TestClient(app)

    response = client.post(
        "/probe/hallucination/communication",
        json={"internal_facts": ["fact one"], "final_message": "a message"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["hallucination_detected"] is True
    assert body["faithful"] is False
    assert body["reason"] == "contradiction"


def test_critique_communication_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/probe/hallucination/communication", json={"internal_facts": ["f"]})

    assert response.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/engine && poetry run pytest tests/test_probe_hallucination.py -v`
Expected: the pre-existing tests still pass; the 4 new ones FAIL with 404.

- [ ] **Step 3: Write the implementation**

In `apps/engine/sentinel_engine/routers/probe.py`, add these two imports alongside the existing hallucination imports:

```python
from sentinel_engine.hallucination.communication import detect_communication_hallucination
from sentinel_engine.hallucination.perception import detect_perception_hallucination
```

Then append this to the END of the file:

```python
class ClaimCritiqueResponse(BaseModel):
    claim: str
    supported: bool
    explanation: str


class PerceptionCritiqueRequest(BaseModel):
    context: str
    claims: list[str]


class PerceptionCritiqueResponse(BaseModel):
    hallucination_detected: bool
    claim_critiques: list[ClaimCritiqueResponse]


@router.post("/hallucination/perception", response_model=PerceptionCritiqueResponse)
def critique_perception(
    request: PerceptionCritiqueRequest, judge: Judge = Depends(get_judge)
) -> PerceptionCritiqueResponse:
    critique = detect_perception_hallucination(judge, request.context, request.claims)
    return PerceptionCritiqueResponse(
        hallucination_detected=critique.hallucination_detected,
        claim_critiques=[
            ClaimCritiqueResponse(claim=c.claim, supported=c.supported, explanation=c.explanation)
            for c in critique.claim_critiques
        ],
    )


class CommunicationCritiqueRequest(BaseModel):
    internal_facts: list[str]
    final_message: str


class CommunicationCritiqueResponse(BaseModel):
    faithful: bool
    reason: str
    hallucination_detected: bool


@router.post("/hallucination/communication", response_model=CommunicationCritiqueResponse)
def critique_communication(
    request: CommunicationCritiqueRequest, judge: Judge = Depends(get_judge)
) -> CommunicationCritiqueResponse:
    critique = detect_communication_hallucination(judge, request.internal_facts, request.final_message)
    return CommunicationCritiqueResponse(
        faithful=critique.faithful,
        reason=critique.reason,
        hallucination_detected=critique.hallucination_detected,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/engine && poetry run pytest -v`
Expected: all pass (24 pre-existing + 5 perception + 4 communication + 4 endpoint = 37 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/engine/sentinel_engine/routers/probe.py apps/engine/tests/test_probe_hallucination.py
git commit -m "feat(day13): POST /probe/hallucination/perception and .../communication endpoints"
```

---

### Task 4: Smoke test against real Ollama

**Depends on:** Task 3.

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `cd apps/engine && poetry run pytest -v`
Expected: 37 passed.

- [ ] **Step 2: Run the engine locally against real Ollama**

Ollama + `llama3.2:3b` are already running/pulled from Day 11.

Run: `cd apps/engine && OLLAMA_URL=http://localhost:11434 poetry run uvicorn sentinel_engine.main:app --port 8000`

Test perception with a context that doesn't support one of the claims:

```bash
curl -s -X POST http://localhost:8000/probe/hallucination/perception \
  -H "Content-Type: application/json" \
  -d '{
    "context": "Order #789: placed 2026-07-01, shipped 2026-07-03, status: delivered.",
    "claims": ["The order shipped on 2026-07-03.", "The order was cancelled and refunded."]
  }'
```

Expected: `hallucination_detected: true`, with the second claim flagged unsupported (the context says "delivered", not "cancelled and refunded"). Record the actual response.

Test communication with a final message that omits a critical caveat:

```bash
curl -s -X POST http://localhost:8000/probe/hallucination/communication \
  -H "Content-Type: application/json" \
  -d '{
    "internal_facts": ["The refund was approved.", "The refund will take 5-7 business days to appear."],
    "final_message": "Your refund has been processed and the money is already in your account."
  }'
```

Expected: `hallucination_detected: true` (the message claims the money already arrived, contradicting the 5-7 business day internal fact). Record the actual response — **as with Days 11-12, treat this as a real, non-deterministic model call and write down what actually happened, not the ideal case.**

- [ ] **Step 3: Clean up**

Stop the local `uvicorn` process.

- [ ] **Step 4: Record the result**

No commit for this task — fold the result into Task 5's `CLAUDE.md` write-up.

---

### Task 5: `CLAUDE.md` Day 13 → Day 14 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update "Current Status"**

Describe what Day 13 built and Task 4's actual smoke-test results (write once known, don't guess). Note the four hallucination detectors that now exist (Reasoning, Execution, Perception, Communication) and that the design spec's 5-stage taxonomy's "Memorization" stage has no dedicated day anywhere in the Phase 2 build sequence (Days 11-13 cover the other four) — flag this as an observed gap in the original plan, not something to unilaterally fix without the user's input.

- [ ] **Step 2: Update "Next Session — Day 14"**

Plan file: `docs/superpowers/plans/2026-07-10-day14-hallucination-heatmap.md (to be written)`. Goal: hallucination heatmap overlay on the trace timeline UI, per design spec line 331 — this is the day all four detectors (Days 11-13) get tied into the Day 10 `TraceWaterfall` component, likely needing a way to associate a hallucination critique with a specific span. Note that none of the four detectors built so far read from real trace data automatically — they're all standalone endpoints taking explicit request bodies — so Day 14 will need to decide how/where that association happens (a new engine endpoint that takes a traceId and calls the relevant detectors? A web-side integration that fetches critiques per span?).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day13): update session context for day 14 handoff"
```
