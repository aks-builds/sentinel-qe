# Day 6 — sentinel-py SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Begin Phase 2 (Probe v1) by building `sentinel-py`, the first Sentinel SDK: `sentinel.init()` to configure a client, `sentinel.trace()` as a context manager that generates a trace/span and records timing, and an HTTP POST of that span to the `/api/traces` endpoint built on Day 5.

**Architecture:** `sentinel-py` is a standalone Poetry project under `packages/sentinel-py`, not part of `apps/engine` — it's a library customers install into their own agent code, not a Sentinel-hosted service. Per the design spec's Open Question #1 ("OTel SDK vs. custom lightweight emitter"), Day 6 uses a custom lightweight emitter: no OpenTelemetry SDK dependency, just Python's stdlib `urllib.request` doing a plain `POST` whose JSON body matches the exact schema `app/api/traces/route.ts` already validates (`traceId`, `spanId`, `name`, `startTime`, `endTime`, `attributes`). This keeps the SDK dependency-free (nothing to conflict with a customer's own agent stack) and reuses the ingestion path Day 5 already built and tested — traces flow SDK → `POST {endpoint}/api/traces` (the Next.js web app) → ClickHouse, never through the Python engine. Module-level config (`sentinel.init(...)`) is a simple global, matching the spec's `sentinel.init(endpoint=..., api_key=..., project=...)` call shape. A trace that fails to send (network error, endpoint down) must never raise into the caller's agent code — telemetry failures are swallowed, not surfaced.

**Tech Stack:** Python 3.12, Poetry 2.x, pytest, stdlib only at runtime (`urllib.request`, `uuid`, `datetime`, `dataclasses`) — no new runtime dependencies. Tests use `unittest.mock` (stdlib) to intercept `urlopen`, matching this repo's established pattern of hand-rolled fakes over third-party mocking libraries.

## Global Constraints

- TDD required — tests written before implementation in every task that produces runtime behavior.
- No new mocking-library dependencies — use `unittest.mock` (Python stdlib) for HTTP interception, the same "hand-roll narrow fakes, no mocking libraries" convention used in `apps/web`'s tests.
- No new runtime dependencies for `sentinel-py` — this SDK gets installed into arbitrary customer codebases; every dependency is a potential version conflict. Use stdlib only.
- `packages/sentinel-py` uses the classic `[tool.poetry]` pyproject format (not PEP 621), matching `apps/engine/pyproject.toml`.
- PyPI package name is `sentinel-sdk`; the importable module name is `sentinel` (not `sentinel_py`) — this matches the design spec's `import sentinel` usage and CLAUDE.md's locked decision.
- A trace that fails to emit (network error, unreachable endpoint) must not raise out of the `with sentinel.trace(...)` block — the caller's agent code must never crash because telemetry failed to send.
- No `Co-Authored-By` in commit messages.
- Do not set `user.name` or `user.email` in local git config.
- Verification commands: `cd packages/sentinel-py && poetry run pytest -v`.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `packages/sentinel-py/pyproject.toml` | Create | Poetry project config — `sentinel-sdk`, no runtime deps, pytest dev dep |
| `packages/sentinel-py/sentinel/__init__.py` | Create (Task 1), Modify (Tasks 2, 3) | Public API surface — exports `init`, `trace` |
| `packages/sentinel-py/sentinel/_client.py` | Create | `SentinelConfig`, `init()`, `get_config()` |
| `packages/sentinel-py/sentinel/_trace.py` | Create | `Trace` context manager, span generation, HTTP emit |
| `packages/sentinel-py/tests/__init__.py` | Create | Test package marker |
| `packages/sentinel-py/tests/test_client.py` | Create | Tests for `init()` / `get_config()` |
| `packages/sentinel-py/tests/test_trace.py` | Create | Tests for `trace()`, mocking `urlopen` |
| `CLAUDE.md` | Modify | Day 6 → Day 7 handoff |

---

### Task 1: Poetry Project Scaffold

**Files:**
- Create: `packages/sentinel-py/pyproject.toml`
- Create: `packages/sentinel-py/sentinel/__init__.py`
- Create: `packages/sentinel-py/tests/__init__.py`

**Interfaces:**
- Produces: an installable Poetry project at `packages/sentinel-py`, importable as `sentinel` after `poetry install`.

- [ ] **Step 1: Create the package directories**

```bash
mkdir -p packages/sentinel-py/sentinel packages/sentinel-py/tests
```

- [ ] **Step 2: Create `packages/sentinel-py/pyproject.toml`**

```toml
[tool.poetry]
name = "sentinel-sdk"
version = "0.1.0"
description = "Sentinel AI Quality Engineering platform — Python SDK"
authors = ["Sentinel"]
packages = [{ include = "sentinel" }]

[tool.poetry.dependencies]
python = "^3.12"

[tool.poetry.group.dev.dependencies]
pytest = "^8.3.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

- [ ] **Step 3: Create empty `packages/sentinel-py/sentinel/__init__.py`**

Empty file (Tasks 2 and 3 will add exports to it).

- [ ] **Step 4: Create empty `packages/sentinel-py/tests/__init__.py`**

Empty file — makes `tests` a package so pytest's rootdir-relative imports resolve consistently, matching `apps/engine/tests/__init__.py`.

- [ ] **Step 5: Install and verify the import**

```bash
cd packages/sentinel-py && poetry install
```

Expected: Poetry resolves and installs `pytest` into a new `.venv` under `packages/sentinel-py/`, plus an editable install of `sentinel` itself. Exit code 0.

```bash
cd packages/sentinel-py && poetry run python -c "import sentinel; print('ok')"
```

Expected: prints `ok`.

- [ ] **Step 6: Commit**

```bash
git add packages/sentinel-py/pyproject.toml packages/sentinel-py/poetry.lock packages/sentinel-py/sentinel/__init__.py packages/sentinel-py/tests/__init__.py
git commit -m "feat(day6): poetry project scaffold for sentinel-py SDK"
```

---

### Task 2: `sentinel.init()` — Client Configuration

**Files:**
- Create: `packages/sentinel-py/sentinel/_client.py`
- Create: `packages/sentinel-py/tests/test_client.py`
- Modify: `packages/sentinel-py/sentinel/__init__.py`

**Interfaces:**
- Produces: `SentinelConfig` — a dataclass with fields `endpoint: str`, `api_key: str`, `project: str`.
- Produces: `init(endpoint: str, api_key: str, project: str) -> None` — stores a module-level `SentinelConfig`, importable as `sentinel.init`.
- Produces: `get_config() -> SentinelConfig` — returns the stored config, or raises `RuntimeError("sentinel.init() must be called before sentinel.trace()")` if `init()` hasn't been called yet. Task 3's `trace()` consumes this.

- [ ] **Step 1: Write the failing tests**

Create `packages/sentinel-py/tests/test_client.py`:

```python
import pytest

import sentinel
import sentinel._client as client_module


@pytest.fixture(autouse=True)
def reset_config():
    client_module._config = None
    yield
    client_module._config = None


def test_init_stores_config():
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    config = client_module.get_config()

    assert config.endpoint == "http://localhost:3000"
    assert config.api_key == "sk_test"
    assert config.project == "demo-project"


def test_get_config_raises_before_init():
    with pytest.raises(RuntimeError, match="sentinel.init"):
        client_module.get_config()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/sentinel-py && poetry run pytest tests/test_client.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel._client'` and/or `AttributeError: module 'sentinel' has no attribute 'init'`.

- [ ] **Step 3: Create `packages/sentinel-py/sentinel/_client.py`**

```python
from dataclasses import dataclass
from typing import Optional


@dataclass
class SentinelConfig:
    endpoint: str
    api_key: str
    project: str


_config: Optional[SentinelConfig] = None


def init(endpoint: str, api_key: str, project: str) -> None:
    global _config
    _config = SentinelConfig(endpoint=endpoint, api_key=api_key, project=project)


def get_config() -> SentinelConfig:
    if _config is None:
        raise RuntimeError("sentinel.init() must be called before sentinel.trace()")
    return _config
```

- [ ] **Step 4: Update `packages/sentinel-py/sentinel/__init__.py`**

```python
from ._client import init

__all__ = ["init"]
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd packages/sentinel-py && poetry run pytest tests/test_client.py -v
```

Expected: 2/2 passing.

- [ ] **Step 6: Commit**

```bash
git add packages/sentinel-py/sentinel/_client.py packages/sentinel-py/sentinel/__init__.py packages/sentinel-py/tests/test_client.py
git commit -m "feat(day6): sentinel.init() client configuration"
```

---

### Task 3: `sentinel.trace()` — Trace/Span Generation and HTTP Emission

**Files:**
- Create: `packages/sentinel-py/sentinel/_trace.py`
- Create: `packages/sentinel-py/tests/test_trace.py`
- Modify: `packages/sentinel-py/sentinel/__init__.py`

**Interfaces:**
- Consumes: `get_config()` from `sentinel._client` (raises `RuntimeError` if `init()` wasn't called — `trace()` must surface that immediately, not only at exit).
- Produces: `trace(name: str) -> Trace`, importable as `sentinel.trace`. `Trace` is a context manager exposing `.trace_id: str` and `.span_id: str` (both `uuid4().hex` strings, generated once per `Trace` instance, unique per call).
- On `__exit__`, POSTs a JSON body to `{endpoint}/api/traces` shaped exactly like the schema `app/api/traces/route.ts` validates: `{"traceId": str, "spanId": str, "name": str, "startTime": str, "endTime": str, "attributes": {"project": str}}`. `startTime`/`endTime` are ISO-8601 UTC strings with millisecond precision (e.g. `2026-07-02T10:15:30.123Z`), matching the format the Day 5 test payloads use.
- Network/HTTP errors during emit are caught and discarded — `__exit__` never raises.

- [ ] **Step 1: Write the failing tests**

Create `packages/sentinel-py/tests/test_trace.py`:

```python
import json
from unittest.mock import patch
from urllib.error import URLError

import pytest

import sentinel
import sentinel._client as client_module


@pytest.fixture(autouse=True)
def reset_config():
    client_module._config = None
    yield
    client_module._config = None


def test_trace_requires_init():
    with pytest.raises(RuntimeError, match="sentinel.init"):
        sentinel.trace("run-x")


def test_trace_generates_unique_trace_and_span_ids():
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-1") as t1:
        pass
    with sentinel.trace("run-2") as t2:
        pass

    assert t1.trace_id != t2.trace_id
    assert t1.span_id != t2.span_id


@patch("sentinel._trace.urlopen")
def test_trace_emits_well_formed_post_body(mock_urlopen):
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-001") as t:
        pass

    mock_urlopen.assert_called_once()
    request = mock_urlopen.call_args[0][0]

    assert request.full_url == "http://localhost:3000/api/traces"
    assert request.get_header("Content-type") == "application/json"
    assert request.get_header("Authorization") == "Bearer sk_test"

    body = json.loads(request.data)
    assert body["traceId"] == t.trace_id
    assert body["spanId"] == t.span_id
    assert body["name"] == "run-001"
    assert body["attributes"] == {"project": "demo-project"}
    assert "startTime" in body
    assert "endTime" in body


@patch("sentinel._trace.urlopen", side_effect=URLError("boom"))
def test_trace_swallows_network_errors(mock_urlopen):
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-002"):
        pass  # must not raise even though urlopen raised URLError
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/sentinel-py && poetry run pytest tests/test_trace.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel._trace'` and/or `AttributeError: module 'sentinel' has no attribute 'trace'`.

- [ ] **Step 3: Create `packages/sentinel-py/sentinel/_trace.py`**

```python
import json
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from ._client import SentinelConfig, get_config


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _emit_span(payload: dict, config: SentinelConfig) -> None:
    url = f"{config.endpoint.rstrip('/')}/api/traces"
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config.api_key}",
        },
        method="POST",
    )
    try:
        urlopen(request, timeout=5)
    except URLError:
        pass


class Trace:
    def __init__(self, name: str):
        self._config = get_config()
        self.name = name
        self.trace_id = uuid.uuid4().hex
        self.span_id = uuid.uuid4().hex
        self._start_time: Optional[str] = None

    def __enter__(self) -> "Trace":
        self._start_time = _now_iso()
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        end_time = _now_iso()
        _emit_span(
            {
                "traceId": self.trace_id,
                "spanId": self.span_id,
                "name": self.name,
                "startTime": self._start_time,
                "endTime": end_time,
                "attributes": {"project": self._config.project},
            },
            self._config,
        )
        return False


def trace(name: str) -> Trace:
    return Trace(name)
```

- [ ] **Step 4: Update `packages/sentinel-py/sentinel/__init__.py`**

```python
from ._client import init
from ._trace import trace

__all__ = ["init", "trace"]
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd packages/sentinel-py && poetry run pytest tests/test_trace.py -v
```

Expected: 4/4 passing.

- [ ] **Step 6: Run the full suite**

```bash
cd packages/sentinel-py && poetry run pytest -v
```

Expected: 6/6 passing (2 from `test_client.py` + 4 from `test_trace.py`).

- [ ] **Step 7: Commit**

```bash
git add packages/sentinel-py/sentinel/_trace.py packages/sentinel-py/sentinel/__init__.py packages/sentinel-py/tests/test_trace.py
git commit -m "feat(day6): sentinel.trace() context manager with HTTP span emission"
```

---

### Task 4: End-to-End Smoke Test (Manual Verification)

This task has no code changes — it proves the SDK built in Tasks 1-3 actually lands a row in ClickHouse through the real Day 5 `/api/traces` endpoint, not just through mocks. No commit at the end since nothing changes in the repo.

- [ ] **Step 1: Start the supporting services**

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis minio clickhouse
```

Expected: all 4 containers report healthy (`docker compose -f docker/docker-compose.yml ps`).

- [ ] **Step 2: Start the web app on the host**

In a separate terminal:

```bash
pnpm --filter @sentinel/web dev
```

Expected: Next.js dev server listening on `http://localhost:3000`. Because this runs on the host (not inside the Docker network), the SDK can reach it directly at `localhost:3000` — unlike `ENGINE_URL`, `/api/traces` is served by the web app itself, so there's no Docker-network reachability gap here.

- [ ] **Step 3: Send a trace with the SDK**

In a third terminal:

```bash
cd packages/sentinel-py
poetry run python <<'PYEOF'
import sentinel

sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="smoke-test")
with sentinel.trace("smoke-test-run"):
    pass
print("trace sent")
PYEOF
```

Expected: prints `trace sent` with no traceback.

- [ ] **Step 4: Confirm the row landed in ClickHouse**

```bash
docker exec sentinel_clickhouse clickhouse-client --query "SELECT trace_id, span_id, name FROM traces WHERE name = 'smoke-test-run'"
```

Expected: one row printed, tab-separated: a 32-character hex `trace_id`, a 32-character hex `span_id`, and `smoke-test-run`.

If Step 4 returns nothing: check the web dev server's terminal output from Step 3's request for a stack trace — the most likely cause is `ensureTracesTable()`/ClickHouse connectivity, not the SDK itself, since Tasks 1-3's tests already prove the SDK sends a well-formed request.

---

### Task 5: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `## Current Status` section**

Replace the `## Current Status` block with:

```markdown
## Current Status

**Phase:** Probe v1 (Days 6–15)
**Day completed:** Day 6
**What was built:**
- `packages/sentinel-py/` — Poetry-managed Python 3.12 SDK (`sentinel-sdk` on PyPI, importable as `sentinel`)
- `sentinel.init(endpoint, api_key, project)` — module-level client configuration
- `sentinel.trace(name)` — context manager: generates a `trace_id`/`span_id` (uuid4 hex), records ISO-8601 UTC start/end timestamps, and on exit POSTs the span to `{endpoint}/api/traces` (the Day 5 endpoint) as JSON matching its exact schema
- No runtime dependencies — stdlib `urllib.request` only; network/HTTP failures during emit are swallowed so a dead Sentinel endpoint never crashes the caller's agent
- pytest tests: 6 passing (2 client config, 4 trace/emit, including a mocked-network-failure case)
- Manually verified end-to-end: a real trace sent via the SDK against a live `pnpm dev` + Docker Compose stack lands a row in ClickHouse's `traces` table

**Notes:**
- No auto-instrumentation yet (LangChain/AutoGen/CrewAI/etc. wrapping) — that's a later Probe day, not Day 6's scope.
- `api_key` is sent as a `Bearer` header but `/api/traces` doesn't validate it yet — the endpoint has no auth check as of Day 5; this SDK is forward-compatible with auth being added later.
- Host port 5432 conflict (native Windows Postgres vs. Docker's forward) is still unresolved — `prisma migrate dev` still can't run from the host.
- No mobile navigation yet — sidebar is desktop-only for now (unchanged since Day 3).
```

- [ ] **Step 2: Update `## Next Session — Day 6` to `## Next Session — Day 7`**

Replace the `## Next Session — Day 6` block with:

```markdown
## Next Session — Day 7

**Plan file:** `docs/superpowers/plans/2026-07-03-day7-sentinel-js-sdk.md` *(to be written)*

**Goal:** Build `sentinel-js`, the TypeScript/JavaScript counterpart to Day 6's `sentinel-py` — a `Sentinel` class, `trace()` method, and emission to the same `/api/traces` endpoint.

**Steps overview (from the design spec, Phase 2 Day 7):**
1. Scaffold `packages/sentinel-js/` as its own pnpm workspace package (`@sentinel-ai/sdk` on npm)
2. `new Sentinel({ endpoint, apiKey, project })` — client instance (not module-level global, unlike the Python SDK — matches the spec's `sentinel-js` usage sample)
3. `sentinel.trace(name)` returning a trace handle; `await trace.end({ result })` emits the span
4. TypeScript types for the public API
5. Emit HTTP POST to `{endpoint}/api/traces` matching the same schema `sentinel-py` uses
6. Vitest tests: client construction, `trace()`/`end()` emits a well-formed POST body matching the Day 5 `/api/traces` schema
7. Commit

**Architecture decisions locked in:**
- `sentinel-js` is a separate package under `packages/`, using a class-based API (not module-level globals like `sentinel-py`) — this is the shape the design spec's §7 SDKs section already specifies for `sentinel-js` vs. `sentinel-py`
- Same ingestion path as `sentinel-py`: SDK → `POST /api/traces` (Next.js web app) → ClickHouse
- No auto-instrumentation yet (LangChainJS/Vercel AI SDK/etc.) — later Probe day, not Day 7's scope
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day6): update session context for day 7 handoff"
```

---

## Self-Review

**Spec coverage:**
- ✅ `sentinel-py` scaffolded as its own Poetry project, PyPI name `sentinel-sdk`, importable as `sentinel` (Task 1) — matches the design spec §7 and CLAUDE.md's locked decision
- ✅ `sentinel.init(endpoint, api_key, project)` (Task 2) — matches the spec's exact call shape
- ✅ `sentinel.trace(name)` context manager generating trace/span IDs and recording start/end time (Task 3) — matches the spec's `with sentinel.trace("run-001") as trace:` usage
- ✅ HTTP emission to the Day 5 `/api/traces` endpoint (Task 3) — payload shape verified against `apps/web/app/api/traces/route.ts`'s actual zod schema, not guessed
- ✅ Resolves design spec's Open Question #1 for Day 6's scope: custom lightweight emitter (stdlib `urllib.request`), not the OpenTelemetry SDK — documented in the plan's Architecture section as a scoped decision, not a silent assumption
- ✅ TDD throughout — every task with runtime behavior writes a failing test first
- ✅ No new mocking-library dependency — `unittest.mock` (stdlib) intercepts `urlopen`, matching the existing repo convention from `apps/web`
- ✅ Manual end-to-end verification against the real endpoint (Task 4), not just mocked tests — catches integration gaps mocks can't (e.g. `ensureTracesTable()`/ClickHouse connectivity)
- ⚠️ Auto-instrumentation (LangChain/AutoGen/CrewAI/smolagents/LlamaIndex/raw OpenAI/Anthropic wrapping) from the spec's §7 "Auto-instrumentation targets" is explicitly **out of scope** for Day 6 — the spec's Daily Build Sequence table only lists `init()`/`trace()`/HTTP emit for Day 6; auto-instrumentation isn't scheduled until later Probe days (Days 11-14 build the hallucination engine that would consume richer traces). Flagging this so the deviation from §7's full feature list is a confirmed scope decision, not a missed requirement.

**Placeholder scan:** None found — every step has complete, runnable code or exact verification commands with expected output.

**Type consistency:**
- `SentinelConfig(endpoint, api_key, project)` — same field names and order used in `_client.py`, `_trace.py`'s `_emit_span`, and both test files ✅
- `get_config() -> SentinelConfig` — same signature referenced in Task 2's implementation, Task 3's `Trace.__init__`, and both tasks' Interfaces blocks ✅
- `trace(name: str) -> Trace` and `Trace.trace_id`/`Trace.span_id` — consistent between Task 3's implementation and its tests (`t1.trace_id`, `t.span_id`, etc.) ✅
- JSON payload field names (`traceId`, `spanId`, `name`, `startTime`, `endTime`, `attributes`) — identical to `apps/web/app/api/traces/route.ts`'s zod schema field names (confirmed by reading that file, not assumed) ✅
