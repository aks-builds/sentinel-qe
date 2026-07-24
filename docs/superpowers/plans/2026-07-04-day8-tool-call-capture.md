# Day 8 — Tool-Call Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both SDKs (`sentinel-py`, `sentinel-js`) gain a `tool_call()` / `toolCall()` method that validates a tool's actual call parameters against its declared JSON-Schema-subset contract, and emits the result as a child span on the existing `/api/traces` wire format.

**Architecture:** Per the design spec (`docs/superpowers/specs/2026-06-26-sentinel-design.md`, line 325: "Tool-call capture: record declared vs. actual parameters, schema contract validation") and the locked-in decision in `CLAUDE.md`, this extends the existing span payload rather than inventing a parallel ingestion path. A tool call becomes a span with `parentSpanId` set to the enclosing trace's `spanId`, `name` set to `tool_call:<toolName>`, and `attributes` carrying `toolName`, `declaredSchema`, `actualParameters`, `valid`, and `errors`. No changes to `/api/traces` or its Zod schema are needed — `parentSpanId` is already optional-string and `attributes` is already `record(string, unknown())`. Schema validation is a small hand-rolled JSON-Schema subset (`type`, `required`, `properties`, `items`, `enum`) implemented independently in each SDK, matching the existing "zero runtime dependencies" rule for both packages.

**Tech Stack:** Python 3.12 (`sentinel-py`, stdlib only), TypeScript (`sentinel-js`, zero runtime deps) — no new dependencies in either package.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/sentinel-py/sentinel/_schema.py` | Create | `validate_schema(schema, value, path="root") -> list[str]` — minimal JSON-Schema-subset validator |
| `packages/sentinel-py/tests/test_schema.py` | Create | Unit tests for `validate_schema` |
| `packages/sentinel-py/sentinel/_trace.py` | Modify | Add `ToolCallResult` dataclass and `Trace.tool_call()` method |
| `packages/sentinel-py/tests/test_tool_call.py` | Create | Unit tests for `Trace.tool_call()` |
| `packages/sentinel-js/src/schema.ts` | Create | `validateSchema(schema, value, path="root"): string[]` — mirrors the Python validator |
| `packages/sentinel-js/src/schema.test.ts` | Create | Unit tests for `validateSchema` |
| `packages/sentinel-js/src/trace.ts` | Modify | Add `parentSpanId` to `TracePayload`, add `ToolCallResult` interface and `Trace.toolCall()` method |
| `packages/sentinel-js/src/trace.test.ts` | Modify | Add a `Trace.toolCall()` describe block |
| `packages/sentinel-js/src/index.ts` | Modify | Export `ToolCallResult` type |
| `CLAUDE.md` | Modify | Day 8 → Day 9 handoff |

## Parallelization note

**Tasks 1–2 (Python track) and Tasks 3–4 (JS track) touch entirely disjoint files and share no state — dispatch them as two concurrent subagent chains, not sequentially.** Task 5 (smoke test) needs both tracks done first; Task 6 (handoff) needs Task 5's result documented. Within each track, the two tasks are sequential (Task 2 imports what Task 1 creates; same for 4/3).

---

### Task 1: Python schema validator

**Files:**
- Create: `packages/sentinel-py/sentinel/_schema.py`
- Test: `packages/sentinel-py/tests/test_schema.py`

- [ ] **Step 1: Write the failing tests**

Create `packages/sentinel-py/tests/test_schema.py`:

```python
from sentinel._schema import validate_schema


def test_valid_object_has_no_errors():
    schema = {
        "type": "object",
        "required": ["order_id"],
        "properties": {"order_id": {"type": "string"}},
    }
    errors = validate_schema(schema, {"order_id": "12345"})
    assert errors == []


def test_missing_required_property_reported():
    schema = {"type": "object", "required": ["order_id"], "properties": {}}
    errors = validate_schema(schema, {})
    assert errors == ["root.order_id: required property missing"]


def test_wrong_type_reported():
    schema = {"type": "string"}
    errors = validate_schema(schema, 42)
    assert errors == ["root: expected type 'string', got 'integer'"]


def test_enum_violation_reported():
    schema = {"type": "string", "enum": ["open", "closed"]}
    errors = validate_schema(schema, "pending")
    assert errors == ["root: value 'pending' not in enum ['open', 'closed']"]


def test_nested_object_properties_validated():
    schema = {
        "type": "object",
        "properties": {
            "address": {
                "type": "object",
                "required": ["zip"],
                "properties": {"zip": {"type": "string"}},
            }
        },
    }
    errors = validate_schema(schema, {"address": {}})
    assert errors == ["root.address.zip: required property missing"]


def test_array_items_validated():
    schema = {"type": "array", "items": {"type": "string"}}
    errors = validate_schema(schema, ["a", 2, "c"])
    assert errors == ["root[1]: expected type 'string', got 'integer'"]


def test_no_type_constraint_always_passes():
    errors = validate_schema({}, "anything")
    assert errors == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sentinel-py && poetry run pytest tests/test_schema.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sentinel._schema'`

- [ ] **Step 3: Write the implementation**

Create `packages/sentinel-py/sentinel/_schema.py`:

```python
from typing import Any, List


def validate_schema(schema: dict, value: Any, path: str = "root") -> List[str]:
    """Validate `value` against a minimal JSON Schema subset.

    Supports: type, required, properties, items, enum. Returns a list of
    human-readable error strings; an empty list means the value is valid.
    """
    errors: List[str] = []

    expected_type = schema.get("type")
    if expected_type is not None and not _matches_type(value, expected_type):
        errors.append(f"{path}: expected type '{expected_type}', got '{_type_name(value)}'")
        return errors

    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: value {value!r} not in enum {schema['enum']!r}")

    if expected_type == "object" and isinstance(value, dict):
        for required_key in schema.get("required", []):
            if required_key not in value:
                errors.append(f"{path}.{required_key}: required property missing")

        for key, sub_schema in schema.get("properties", {}).items():
            if key in value:
                errors.extend(validate_schema(sub_schema, value[key], f"{path}.{key}"))

    if expected_type == "array" and isinstance(value, list) and "items" in schema:
        for index, item in enumerate(value):
            errors.extend(validate_schema(schema["items"], item, f"{path}[{index}]"))

    return errors


_TYPE_CHECKS = {
    "string": lambda v: isinstance(v, str),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "null": lambda v: v is None,
}


def _matches_type(value: Any, expected_type: str) -> bool:
    check = _TYPE_CHECKS.get(expected_type)
    return check(value) if check else True


def _type_name(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sentinel-py && poetry run pytest tests/test_schema.py -v`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add packages/sentinel-py/sentinel/_schema.py packages/sentinel-py/tests/test_schema.py
git commit -m "feat(day8): minimal JSON Schema subset validator for sentinel-py"
```

---

### Task 2: Python `Trace.tool_call()`

**Files:**
- Modify: `packages/sentinel-py/sentinel/_trace.py`
- Test: `packages/sentinel-py/tests/test_tool_call.py`

- [ ] **Step 1: Write the failing tests**

Create `packages/sentinel-py/tests/test_tool_call.py`:

```python
import json
from urllib.error import URLError
from unittest.mock import patch

import pytest

import sentinel
import sentinel._client as client_module


@pytest.fixture(autouse=True)
def reset_config():
    client_module._config = None
    yield
    client_module._config = None


DECLARED_SCHEMA = {
    "type": "object",
    "required": ["order_id"],
    "properties": {"order_id": {"type": "string"}},
}


@patch("sentinel._trace.urlopen")
def test_tool_call_emits_child_span_with_validation_result(mock_urlopen):
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-001") as t:
        result = t.tool_call("search_orders", DECLARED_SCHEMA, {"order_id": "12345"})

    assert result.valid is True
    assert result.errors == []

    # two spans emitted: the tool_call span (first), then the trace's own span on __exit__
    assert mock_urlopen.call_count == 2
    tool_call_request = mock_urlopen.call_args_list[0][0][0]
    body = json.loads(tool_call_request.data)

    assert body["traceId"] == t.trace_id
    assert body["parentSpanId"] == t.span_id
    assert body["spanId"] != t.span_id
    assert body["name"] == "tool_call:search_orders"
    assert body["attributes"]["toolName"] == "search_orders"
    assert body["attributes"]["valid"] is True
    assert body["attributes"]["errors"] == []
    assert body["attributes"]["declaredSchema"] == DECLARED_SCHEMA
    assert body["attributes"]["actualParameters"] == {"order_id": "12345"}


@patch("sentinel._trace.urlopen")
def test_tool_call_reports_schema_violations(mock_urlopen):
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-002") as t:
        result = t.tool_call("search_orders", DECLARED_SCHEMA, {})

    assert result.valid is False
    assert result.errors == ["root.order_id: required property missing"]

    tool_call_request = mock_urlopen.call_args_list[0][0][0]
    body = json.loads(tool_call_request.data)
    assert body["attributes"]["valid"] is False
    assert body["attributes"]["errors"] == ["root.order_id: required property missing"]


@patch("sentinel._trace.urlopen", side_effect=URLError("boom"))
def test_tool_call_never_raises_on_emit_failure(mock_urlopen):
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-003") as t:
        result = t.tool_call("search_orders", {"type": "object"}, {})  # must not raise

    assert result.valid is True  # bare {"type": "object"} has no required/properties to violate
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sentinel-py && poetry run pytest tests/test_tool_call.py -v`
Expected: FAIL with `AttributeError: 'Trace' object has no attribute 'tool_call'`

- [ ] **Step 3: Write the implementation**

Modify `packages/sentinel-py/sentinel/_trace.py` — add the import, the `ToolCallResult` dataclass, and the `tool_call` method on `Trace`:

```python
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from ._client import SentinelConfig, get_config
from ._schema import validate_schema


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _emit_span(payload: dict, config: SentinelConfig) -> None:
    try:
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
        urlopen(request, timeout=5)
    except (URLError, ValueError):
        pass


@dataclass
class ToolCallResult:
    valid: bool
    errors: List[str] = field(default_factory=list)


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

    def tool_call(
        self, name: str, declared_schema: dict, actual_parameters: dict
    ) -> ToolCallResult:
        errors = validate_schema(declared_schema, actual_parameters)
        result = ToolCallResult(valid=len(errors) == 0, errors=errors)
        now = _now_iso()
        _emit_span(
            {
                "traceId": self.trace_id,
                "spanId": uuid.uuid4().hex,
                "parentSpanId": self.span_id,
                "name": f"tool_call:{name}",
                "startTime": now,
                "endTime": now,
                "attributes": {
                    "project": self._config.project,
                    "toolName": name,
                    "declaredSchema": declared_schema,
                    "actualParameters": actual_parameters,
                    "valid": result.valid,
                    "errors": result.errors,
                },
            },
            self._config,
        )
        return result

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sentinel-py && poetry run pytest -v`
Expected: all tests pass (7 pre-existing + 7 from Task 1's `test_schema.py` + 3 new in `test_tool_call.py` = 17 passed)

- [ ] **Step 5: Commit**

```bash
git add packages/sentinel-py/sentinel/_trace.py packages/sentinel-py/tests/test_tool_call.py
git commit -m "feat(day8): Trace.tool_call() schema validation and child-span emission"
```

---

### Task 3: JS schema validator

**Files:**
- Create: `packages/sentinel-js/src/schema.ts`
- Test: `packages/sentinel-js/src/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/sentinel-js/src/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateSchema } from './schema'

describe('validateSchema', () => {
  it('returns no errors for a valid object', () => {
    const schema = {
      type: 'object',
      required: ['orderId'],
      properties: { orderId: { type: 'string' } },
    }
    expect(validateSchema(schema, { orderId: '12345' })).toEqual([])
  })

  it('reports a missing required property', () => {
    const schema = { type: 'object', required: ['orderId'], properties: {} }
    expect(validateSchema(schema, {})).toEqual(['root.orderId: required property missing'])
  })

  it('reports a type mismatch', () => {
    const schema = { type: 'string' }
    expect(validateSchema(schema, 42)).toEqual(["root: expected type 'string', got 'integer'"])
  })

  it('reports an enum violation', () => {
    const schema = { type: 'string', enum: ['open', 'closed'] }
    expect(validateSchema(schema, 'pending')).toEqual([
      'root: value "pending" not in enum ["open","closed"]',
    ])
  })

  it('validates nested object properties', () => {
    const schema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          required: ['zip'],
          properties: { zip: { type: 'string' } },
        },
      },
    }
    expect(validateSchema(schema, { address: {} })).toEqual([
      'root.address.zip: required property missing',
    ])
  })

  it('validates array items', () => {
    const schema = { type: 'array', items: { type: 'string' } }
    expect(validateSchema(schema, ['a', 2, 'c'])).toEqual([
      "root[1]: expected type 'string', got 'integer'",
    ])
  })

  it('always passes when the schema has no type constraint', () => {
    expect(validateSchema({}, 'anything')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel-ai/sdk test schema.test.ts`
Expected: FAIL with `Cannot find module './schema'`

- [ ] **Step 3: Write the implementation**

Create `packages/sentinel-js/src/schema.ts`:

```typescript
export function validateSchema(
  schema: Record<string, unknown>,
  value: unknown,
  path = 'root'
): string[] {
  const errors: string[] = []
  const expectedType = schema.type as string | undefined

  if (expectedType !== undefined && !matchesType(value, expectedType)) {
    errors.push(`${path}: expected type '${expectedType}', got '${typeName(value)}'`)
    return errors
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(
      `${path}: value ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`
    )
  }

  if (expectedType === 'object' && isPlainObject(value)) {
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : []
    for (const key of required) {
      if (!(key in value)) errors.push(`${path}.${key}: required property missing`)
    }

    const properties = isPlainObject(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {}
    for (const [key, subSchema] of Object.entries(properties)) {
      if (key in value) {
        errors.push(
          ...validateSchema(subSchema as Record<string, unknown>, value[key], `${path}.${key}`)
        )
      }
    }
  }

  if (expectedType === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      errors.push(
        ...validateSchema(schema.items as Record<string, unknown>, item, `${path}[${index}]`)
      )
    })
  }

  return errors
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function matchesType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'object':
      return isPlainObject(value)
    case 'array':
      return Array.isArray(value)
    case 'null':
      return value === null
    default:
      return true
  }
}

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sentinel-ai/sdk test schema.test.ts`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add packages/sentinel-js/src/schema.ts packages/sentinel-js/src/schema.test.ts
git commit -m "feat(day8): minimal JSON Schema subset validator for sentinel-js"
```

---

### Task 4: JS `Trace.toolCall()`

**Files:**
- Modify: `packages/sentinel-js/src/trace.ts`
- Modify: `packages/sentinel-js/src/trace.test.ts`
- Modify: `packages/sentinel-js/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/sentinel-js/src/trace.test.ts` (add this `describe` block after the existing `Trace.end()` block, keeping the existing `import` line unchanged):

```typescript
describe('Trace.toolCall()', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  const declaredSchema = {
    type: 'object',
    required: ['orderId'],
    properties: { orderId: { type: 'string' } },
  }

  it('emits a child span with the validation result', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch as unknown as typeof fetch

    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-001')

    const result = await trace.toolCall('searchOrders', declaredSchema, { orderId: '12345' })

    expect(result).toEqual({ valid: true, errors: [] })
    expect(mockFetch).toHaveBeenCalledOnce()

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body as string)

    expect(body.traceId).toBe(trace.traceId)
    expect(body.parentSpanId).toBe(trace.spanId)
    expect(body.spanId).not.toBe(trace.spanId)
    expect(body.name).toBe('tool_call:searchOrders')
    expect(body.attributes.toolName).toBe('searchOrders')
    expect(body.attributes.valid).toBe(true)
    expect(body.attributes.errors).toEqual([])
    expect(body.attributes.declaredSchema).toEqual(declaredSchema)
    expect(body.attributes.actualParameters).toEqual({ orderId: '12345' })
  })

  it('reports schema violations without throwing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch as unknown as typeof fetch

    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-002')

    const result = await trace.toolCall('searchOrders', declaredSchema, {})

    expect(result).toEqual({
      valid: false,
      errors: ['root.orderId: required property missing'],
    })

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.attributes.valid).toBe(false)
    expect(body.attributes.errors).toEqual(['root.orderId: required property missing'])
  })

  it('swallows network errors (fetch rejects) and still returns a validation result', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch

    const sentinel = new Sentinel({
      endpoint: 'http://localhost:3000',
      apiKey: 'sk_test',
      project: 'demo-project',
    })
    const trace = sentinel.trace('run-003')

    const result = await trace.toolCall('searchOrders', { type: 'object' }, {})
    expect(result).toEqual({ valid: true, errors: [] })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sentinel-ai/sdk test trace.test.ts`
Expected: FAIL with `TypeError: trace.toolCall is not a function`

- [ ] **Step 3: Write the implementation**

Replace the full contents of `packages/sentinel-js/src/trace.ts`:

```typescript
import { validateSchema } from './schema'

export interface TracePayload {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  startTime: string
  endTime: string
  attributes?: Record<string, unknown>
}

export interface ToolCallResult {
  valid: boolean
  errors: string[]
}

async function emitSpan(payload: TracePayload, endpoint: string, apiKey: string): Promise<void> {
  try {
    const url = `${endpoint.replace(/\/+$/, '')}/api/traces`
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    // never let a dead or malformed Sentinel endpoint crash the caller's agent
  }
}

export class Trace {
  readonly traceId: string
  readonly spanId: string
  private readonly name: string
  private readonly startTime: string
  private readonly endpoint: string
  private readonly apiKey: string
  private readonly project: string

  constructor(name: string, endpoint: string, apiKey: string, project: string) {
    this.name = name
    this.endpoint = endpoint
    this.apiKey = apiKey
    this.project = project
    this.traceId = crypto.randomUUID().replace(/-/g, '')
    this.spanId = crypto.randomUUID().replace(/-/g, '')
    this.startTime = new Date().toISOString()
  }

  async end(attributes: Record<string, unknown> = {}): Promise<void> {
    const endTime = new Date().toISOString()
    await emitSpan(
      {
        traceId: this.traceId,
        spanId: this.spanId,
        name: this.name,
        startTime: this.startTime,
        endTime,
        attributes: { project: this.project, ...attributes },
      },
      this.endpoint,
      this.apiKey
    )
  }

  async toolCall(
    name: string,
    declaredSchema: Record<string, unknown>,
    actualParameters: Record<string, unknown>
  ): Promise<ToolCallResult> {
    const errors = validateSchema(declaredSchema, actualParameters)
    const result: ToolCallResult = { valid: errors.length === 0, errors }
    const now = new Date().toISOString()
    await emitSpan(
      {
        traceId: this.traceId,
        spanId: crypto.randomUUID().replace(/-/g, ''),
        parentSpanId: this.spanId,
        name: `tool_call:${name}`,
        startTime: now,
        endTime: now,
        attributes: {
          project: this.project,
          toolName: name,
          declaredSchema,
          actualParameters,
          valid: result.valid,
          errors: result.errors,
        },
      },
      this.endpoint,
      this.apiKey
    )
    return result
  }
}
```

- [ ] **Step 4: Update the package's public exports**

Replace the full contents of `packages/sentinel-js/src/index.ts`:

```typescript
export { Sentinel } from './sentinel'
export type { SentinelOptions } from './sentinel'
export type { ToolCallResult } from './trace'
```

- [ ] **Step 5: Run tests and type-check to verify everything passes**

Run: `pnpm --filter @sentinel-ai/sdk test`
Expected: 3 test files, 16 passed (2 in `sentinel.test.ts` + 7 in `trace.test.ts` [4 pre-existing + 3 new toolCall tests] + 7 in `schema.test.ts` from Task 3)

Run: `pnpm --filter @sentinel-ai/sdk check-types`
Expected: exit code 0

- [ ] **Step 6: Commit**

```bash
git add packages/sentinel-js/src/trace.ts packages/sentinel-js/src/trace.test.ts packages/sentinel-js/src/index.ts
git commit -m "feat(day8): Trace.toolCall() schema validation and child-span emission"
```

---

### Task 5: End-to-end smoke test (both SDKs against the live stack)

**Depends on:** Tasks 1–4 both complete (this is the barrier — do not start until both tracks are merged).

**Files:** none (verification only, no code changes)

- [ ] **Step 1: Start the data layer**

Run: `docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d`
Expected: `postgres`, `redis`, `minio`, `clickhouse`, `engine` all report healthy (re-check with a real query per the known ClickHouse healthcheck flakiness noted in project memory, not just the health label).

- [ ] **Step 2: Start the web app**

Run: `pnpm --filter @sentinel/web dev`
Expected: Next.js listening on `http://localhost:3000`.

- [ ] **Step 3: Exercise `sentinel-py`'s `tool_call()` against the live server**

Run:

```bash
cd packages/sentinel-py && poetry run python <<'PYEOF'
import sentinel

sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="smoke-test")

declared = {"type": "object", "required": ["order_id"], "properties": {"order_id": {"type": "string"}}}

with sentinel.trace("smoke-py") as t:
    ok = t.tool_call("search_orders", declared, {"order_id": "12345"})
    bad = t.tool_call("search_orders", declared, {})
    print("valid call:", ok)
    print("invalid call:", bad)
PYEOF
```

Expected: prints `valid call: ToolCallResult(valid=True, errors=[])` and `invalid call: ToolCallResult(valid=False, errors=['root.order_id: required property missing'])`, no exceptions.

- [ ] **Step 4: Exercise `sentinel-js`'s `toolCall()` against the live server**

Run:

```bash
cd packages/sentinel-js && node --experimental-strip-types <<'JSEOF'
import { Sentinel } from './src/index.ts'

const sentinel = new Sentinel({ endpoint: 'http://localhost:3000', apiKey: 'sk_test', project: 'smoke-test' })
const declared = { type: 'object', required: ['orderId'], properties: { orderId: { type: 'string' } } }

const trace = sentinel.trace('smoke-js')
const ok = await trace.toolCall('searchOrders', declared, { orderId: '12345' })
const bad = await trace.toolCall('searchOrders', declared, {})
console.log('valid call:', ok)
console.log('invalid call:', bad)
JSEOF
```

Expected: prints `valid call: { valid: true, errors: [] }` and `invalid call: { valid: false, errors: [ 'root.orderId: required property missing' ] }`, no exceptions. (If the Node version in use doesn't support `--experimental-strip-types`, run `pnpm --filter @sentinel-ai/sdk build` first and import from `dist/index.js` instead.)

- [ ] **Step 5: Confirm both tool-call spans landed in ClickHouse with the parent link intact**

Run:

```bash
docker exec sentinel_clickhouse clickhouse-client --query "SELECT trace_id, span_id, parent_span_id, name, attributes FROM traces WHERE name LIKE 'tool_call:%' ORDER BY start_time DESC LIMIT 4 FORMAT Vertical"
```

Expected: 4 rows (2 from each SDK — one valid, one invalid), each with a non-empty `parent_span_id` matching the enclosing trace's `smoke-py`/`smoke-js` span, and `attributes` containing `"valid":true` or `"valid":false` with the matching `errors` array.

- [ ] **Step 6: Record the result**

No commit for this task — its outcome (pass, or any bugs found and fixed) gets written into Task 6's `CLAUDE.md` update, following the same pattern as Day 6/7's smoke-test write-ups.

---

### Task 6: `CLAUDE.md` Day 8 → Day 9 handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the "Current Status" section**

Replace the `**Day completed:**` line and the "What was built" bullets to describe Day 8's tool-call capture work (both SDKs' `_schema.py`/`schema.ts` validators and `tool_call()`/`toolCall()` methods, the smoke test result from Task 5, and any bugs found/fixed during it — write these once Task 5's actual output is known, don't guess).

- [ ] **Step 2: Update the "Next Session — Day 9" section**

Set the plan file reference to `docs/superpowers/plans/2026-07-05-day9-probe-ui.md (to be written)` and the goal to Day 9's spec deliverable: "Probe UI: test suite builder, run trigger, live status" (design spec line 326).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day8): update session context for day 9 handoff"
```
