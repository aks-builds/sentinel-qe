# Day 4 — Python FastAPI Engine Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/engine/` as a Python 3.12 + FastAPI + Uvicorn service managed by Poetry, with a `/health` endpoint, one stub router per Sentinel module (Probe/Mirror/Guard/Cognify/Reach), a Dockerfile, and wiring into `docker/docker-compose.yml` — so the Next.js app has a real internal service to call starting Day 5.

**Architecture:** `apps/engine/` is a standalone Poetry-managed Python package, `sentinel_engine`, sitting alongside `apps/web/` in the monorepo (separate ecosystem — not part of the pnpm workspace). `sentinel_engine/main.py` creates the FastAPI `app` and includes one `APIRouter` per module from `sentinel_engine/routers/`, each mounted at `/<module>` with a single stub `GET /` returning `{"module": "<id>", "status": "not_implemented"}` — enough to prove routing works before real endpoints land later. The engine runs on internal port 8000, added to `docker/docker-compose.yml` as the `engine` service on the same Docker network as `web`, with no host port mapping (not exposed in production).

**Tech Stack:** Python 3.12, Poetry 2.x, FastAPI, Uvicorn (standard extras), pytest, httpx (for FastAPI's `TestClient`), Docker (python:3.12-slim base image).

---

## Global Constraints

- Python 3.12 minimum (`pyproject.toml` pins `python = "^3.12"`).
- Poetry for dependency management — no `pip install` / `requirements.txt`.
- `apps/engine/` is NOT part of the pnpm workspace (`pnpm-workspace.yaml` untouched) — it's a separate Python ecosystem living under the same monorepo root.
- Package name `sentinel-engine`, importable module `sentinel_engine` (Poetry auto-maps hyphen → underscore; no explicit `packages` entry needed).
- TDD required — pytest tests written before implementation in every task that produces runtime behavior.
- Engine listens on port 8000 inside the container; no host port mapping in docker-compose (internal-only, matches locked architecture decision).
- **Known blocker (carries over from Day 2/3):** Docker is unavailable in this environment (BIOS VT-x). `docker compose build engine` / `docker compose up` cannot be run to verify the Dockerfile or compose wiring end-to-end this session. Verify those two files by careful manual review instead; flag the runtime verification as pending in the Day 4 handoff, same as the `prisma migrate dev` blocker.
- No `Co-Authored-By` in commit messages.
- Do not set `user.name` or `user.email` in local git config.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/engine/pyproject.toml` | Create | Poetry project config — deps: fastapi, uvicorn; dev deps: pytest, httpx |
| `apps/engine/sentinel_engine/__init__.py` | Create | Package marker |
| `apps/engine/sentinel_engine/main.py` | Create | FastAPI `app`, `/health` endpoint, includes all 5 module routers |
| `apps/engine/sentinel_engine/routers/__init__.py` | Create | Package marker |
| `apps/engine/sentinel_engine/routers/probe.py` | Create | Stub `APIRouter` for Probe module |
| `apps/engine/sentinel_engine/routers/mirror.py` | Create | Stub `APIRouter` for Mirror module |
| `apps/engine/sentinel_engine/routers/guard.py` | Create | Stub `APIRouter` for Guard module |
| `apps/engine/sentinel_engine/routers/cognify.py` | Create | Stub `APIRouter` for Cognify module |
| `apps/engine/sentinel_engine/routers/reach.py` | Create | Stub `APIRouter` for Reach module |
| `apps/engine/tests/__init__.py` | Create | Package marker |
| `apps/engine/tests/test_health.py` | Create | Tests: `/health` returns `{"status": "ok"}` |
| `apps/engine/tests/test_routers.py` | Create | Tests: each module stub route responds |
| `apps/engine/Dockerfile` | Create | `python:3.12-slim` image, Poetry install, Uvicorn entrypoint |
| `apps/engine/.dockerignore` | Create | Excludes `.venv`, `__pycache__`, `tests/` from build context |
| `docker/docker-compose.yml` | Modify | Add `engine` service, port 8000 internal-only |
| `CLAUDE.md` | Modify | Day 4 → Day 5 handoff |

---

### Task 1: Poetry Project Init

**Files:**
- Create: `apps/engine/pyproject.toml`
- Create: `apps/engine/sentinel_engine/__init__.py`

**Interfaces:**
- Produces: an installable Poetry package named `sentinel-engine`, importable as `sentinel_engine`

- [ ] **Step 1: Create the directory and `pyproject.toml`**

Create `apps/engine/pyproject.toml`:

```toml
[tool.poetry]
name = "sentinel-engine"
version = "0.1.0"
description = "Sentinel AI Quality Engineering platform — Python engine"
authors = ["Sentinel"]

[tool.poetry.dependencies]
python = "^3.12"
fastapi = "^0.115.0"
uvicorn = { extras = ["standard"], version = "^0.32.0" }

[tool.poetry.group.dev.dependencies]
pytest = "^8.3.0"
httpx = "^0.27.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

- [ ] **Step 2: Create the package marker**

Create `apps/engine/sentinel_engine/__init__.py`:

```python
```

(empty file — marks `sentinel_engine` as a package)

- [ ] **Step 3: Install dependencies**

```bash
cd apps/engine && poetry install
```

Expected: Poetry resolves and installs `fastapi`, `uvicorn`, `pytest`, `httpx` into a new `.venv` under `apps/engine/`. Exit code 0.

- [ ] **Step 4: Verify the environment**

```bash
cd apps/engine && poetry run python -c "import fastapi, uvicorn; print('ok')"
```

Expected output: `ok`

- [ ] **Step 5: Commit**

```bash
git add apps/engine/pyproject.toml apps/engine/poetry.lock apps/engine/sentinel_engine/__init__.py
git commit -m "feat(day4): poetry project init for sentinel-engine"
```

---

### Task 2: FastAPI App + `/health` Endpoint

**Files:**
- Create: `apps/engine/sentinel_engine/main.py`
- Create: `apps/engine/tests/__init__.py`
- Create: `apps/engine/tests/test_health.py`

**Interfaces:**
- Produces: `app` — importable as `from sentinel_engine.main import app`, a `fastapi.FastAPI` instance
- Produces: `GET /health` — returns `{"status": "ok"}` with HTTP 200

- [ ] **Step 1: Create the tests package marker**

Create `apps/engine/tests/__init__.py`:

```python
```

(empty file)

- [ ] **Step 2: Write the failing test**

Create `apps/engine/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from sentinel_engine.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd apps/engine && poetry run pytest tests/test_health.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'sentinel_engine.main'`

- [ ] **Step 4: Create `apps/engine/sentinel_engine/main.py`**

```python
from fastapi import FastAPI

app = FastAPI(title="Sentinel Engine")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
cd apps/engine && poetry run pytest tests/test_health.py -v
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/engine/sentinel_engine/main.py apps/engine/tests/__init__.py apps/engine/tests/test_health.py
git commit -m "feat(day4): fastapi app with /health endpoint"
```

---

### Task 3: Module Stub Routers (Probe/Mirror/Guard/Cognify/Reach)

**Files:**
- Create: `apps/engine/sentinel_engine/routers/__init__.py`
- Create: `apps/engine/sentinel_engine/routers/probe.py`
- Create: `apps/engine/sentinel_engine/routers/mirror.py`
- Create: `apps/engine/sentinel_engine/routers/guard.py`
- Create: `apps/engine/sentinel_engine/routers/cognify.py`
- Create: `apps/engine/sentinel_engine/routers/reach.py`
- Modify: `apps/engine/sentinel_engine/main.py`
- Create: `apps/engine/tests/test_routers.py`

**Interfaces:**
- Produces: `router` in each of the 5 router modules — a `fastapi.APIRouter` mounted at `/<module_id>`, each with one `GET /` returning `{"module": "<module_id>", "status": "not_implemented"}`
- Consumes: `app` from `sentinel_engine.main`, extended to `include_router()` all 5

- [ ] **Step 1: Create the routers package marker**

Create `apps/engine/sentinel_engine/routers/__init__.py`:

```python
```

(empty file)

- [ ] **Step 2: Write the failing tests**

Create `apps/engine/tests/test_routers.py`:

```python
import pytest
from fastapi.testclient import TestClient

from sentinel_engine.main import app

client = TestClient(app)


@pytest.mark.parametrize("module_id", ["probe", "mirror", "guard", "cognify", "reach"])
def test_module_stub_route_responds(module_id: str):
    response = client.get(f"/{module_id}/")
    assert response.status_code == 200
    assert response.json() == {"module": module_id, "status": "not_implemented"}
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd apps/engine && poetry run pytest tests/test_routers.py -v
```

Expected: 5 failed — `404 Not Found` for each module path (routers not yet included).

- [ ] **Step 4: Create the 5 router files**

Create `apps/engine/sentinel_engine/routers/probe.py`:

```python
from fastapi import APIRouter

router = APIRouter(prefix="/probe", tags=["probe"])


@router.get("/")
def probe_status() -> dict[str, str]:
    return {"module": "probe", "status": "not_implemented"}
```

Create `apps/engine/sentinel_engine/routers/mirror.py`:

```python
from fastapi import APIRouter

router = APIRouter(prefix="/mirror", tags=["mirror"])


@router.get("/")
def mirror_status() -> dict[str, str]:
    return {"module": "mirror", "status": "not_implemented"}
```

Create `apps/engine/sentinel_engine/routers/guard.py`:

```python
from fastapi import APIRouter

router = APIRouter(prefix="/guard", tags=["guard"])


@router.get("/")
def guard_status() -> dict[str, str]:
    return {"module": "guard", "status": "not_implemented"}
```

Create `apps/engine/sentinel_engine/routers/cognify.py`:

```python
from fastapi import APIRouter

router = APIRouter(prefix="/cognify", tags=["cognify"])


@router.get("/")
def cognify_status() -> dict[str, str]:
    return {"module": "cognify", "status": "not_implemented"}
```

Create `apps/engine/sentinel_engine/routers/reach.py`:

```python
from fastapi import APIRouter

router = APIRouter(prefix="/reach", tags=["reach"])


@router.get("/")
def reach_status() -> dict[str, str]:
    return {"module": "reach", "status": "not_implemented"}
```

- [ ] **Step 5: Wire the routers into `main.py`**

Replace `apps/engine/sentinel_engine/main.py`:

```python
from fastapi import FastAPI

from sentinel_engine.routers import cognify, guard, mirror, probe, reach

app = FastAPI(title="Sentinel Engine")

app.include_router(probe.router)
app.include_router(mirror.router)
app.include_router(guard.router)
app.include_router(cognify.router)
app.include_router(reach.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd apps/engine && poetry run pytest -v
```

Expected: all prior tests + 5 new router tests = 6 passed.

- [ ] **Step 7: Commit**

```bash
git add apps/engine/sentinel_engine/routers/ apps/engine/sentinel_engine/main.py apps/engine/tests/test_routers.py
git commit -m "feat(day4): stub routers for probe/mirror/guard/cognify/reach"
```

---

### Task 4: Dockerfile

**Files:**
- Create: `apps/engine/Dockerfile`
- Create: `apps/engine/.dockerignore`

**Interfaces:**
- Produces: a Docker image that installs the Poetry-managed dependencies and runs `uvicorn sentinel_engine.main:app` on port 8000

- [ ] **Step 1: Create `apps/engine/.dockerignore`**

```
.venv
__pycache__
*.pyc
tests
.pytest_cache
```

- [ ] **Step 2: Create `apps/engine/Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir poetry==2.4.1 \
    && poetry config virtualenvs.create false

COPY pyproject.toml poetry.lock ./
RUN poetry install --no-root --without dev

COPY sentinel_engine ./sentinel_engine

EXPOSE 8000

CMD ["uvicorn", "sentinel_engine.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Manually verify the Dockerfile (Docker unavailable this session — see Global Constraints)**

Review checklist — confirm each holds true by reading the file back:
- Base image is `python:3.12-slim` ✅
- `poetry.lock` is copied and `poetry install --without dev` skips pytest/httpx in the image ✅
- Only `sentinel_engine/` (not `tests/`) is copied into the image ✅
- `EXPOSE 8000` matches the locked port decision ✅
- `CMD` binds `0.0.0.0:8000` so it's reachable from other containers on the Docker network ✅

- [ ] **Step 4: Commit**

```bash
git add apps/engine/Dockerfile apps/engine/.dockerignore
git commit -m "feat(day4): dockerfile for sentinel-engine"
```

---

### Task 5: Wire `engine` Service into Docker Compose

**Files:**
- Modify: `docker/docker-compose.yml`

**Interfaces:**
- Produces: an `engine` service in the compose file, built from `../apps/engine`, on the default compose network, with no host port mapping

- [ ] **Step 1: Add the `engine` service**

Modify `docker/docker-compose.yml` — add this service block after `clickhouse:` and before the `volumes:` section (insert before line 92, `volumes:`):

```yaml
  engine:
    build:
      context: ../apps/engine
      dockerfile: Dockerfile
    container_name: sentinel_engine
    restart: unless-stopped
    expose:
      - '8000'
    depends_on:
      - postgres
      - redis
```

Resulting file (full content):

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    container_name: sentinel_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: sentinel
      POSTGRES_PASSWORD: sentinel
      POSTGRES_DB: sentinel
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U sentinel -d sentinel']
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: sentinel_redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 10

  minio:
    image: minio/minio:latest
    container_name: sentinel_minio
    restart: unless-stopped
    command: server /data --console-address ':9001'
    environment:
      MINIO_ROOT_USER: sentinel
      MINIO_ROOT_PASSWORD: sentinel123
    ports:
      - '9000:9000'
      - '9001:9001'
    volumes:
      - minio_data:/data
    healthcheck:
      test:
        [
          'CMD',
          'curl',
          '-f',
          'http://localhost:9000/minio/health/live',
        ]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 10s

  clickhouse:
    image: clickhouse/clickhouse-server:24-alpine
    container_name: sentinel_clickhouse
    restart: unless-stopped
    ports:
      - '8123:8123'
      - '9009:9009'
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - ./clickhouse/config.xml:/etc/clickhouse-server/config.d/sentinel.xml:ro
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    healthcheck:
      test:
        [
          'CMD',
          'wget',
          '--no-verbose',
          '--tries=1',
          '--spider',
          'http://localhost:8123/ping',
        ]
      interval: 5s
      timeout: 5s
      retries: 15
      start_period: 15s

  engine:
    build:
      context: ../apps/engine
      dockerfile: Dockerfile
    container_name: sentinel_engine
    restart: unless-stopped
    expose:
      - '8000'
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
  minio_data:
  clickhouse_data:
```

- [ ] **Step 2: Validate YAML syntax**

```bash
cd apps/engine && poetry run python -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('../../docker/docker-compose.yml').read_text()); print('valid yaml')"
```

If `yaml` isn't installed, add it as a one-off check dependency instead of skipping validation:

```bash
cd apps/engine && poetry run pip install pyyaml && poetry run python -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('../../docker/docker-compose.yml').read_text()); print('valid yaml')"
```

Expected output: `valid yaml`. (Full `docker compose config` validation and `docker compose up` remain blocked by the VT-x issue — see Global Constraints.)

- [ ] **Step 3: Commit**

```bash
git add docker/docker-compose.yml
git commit -m "feat(day4): wire engine service into docker compose"
```

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `## Current Status` section**

Replace the `## Current Status` block with:

```markdown
## Current Status

**Phase:** Foundation (Days 1–5)
**Day completed:** Day 4
**What was built:**
- `apps/engine/` — Poetry-managed Python 3.12 FastAPI service (`sentinel-engine` package, importable as `sentinel_engine`)
- `sentinel_engine/main.py` — FastAPI app with `/health` endpoint, includes all 5 module routers
- `sentinel_engine/routers/{probe,mirror,guard,cognify,reach}.py` — stub `APIRouter`s, each with `GET /<module>/` returning `{"module": "<id>", "status": "not_implemented"}`
- `apps/engine/Dockerfile` — `python:3.12-slim` base, Poetry install, Uvicorn entrypoint on port 8000
- `docker/docker-compose.yml` — added `engine` service (internal-only, port 8000, depends on postgres + redis)
- pytest tests: 6 passing (health × 1, module router stubs × 5)

**Notes:**
- `docker compose build engine` / `docker compose up` not run this session — Docker still blocked by the VT-x BIOS issue (same blocker as `prisma migrate dev`). Dockerfile and compose wiring were verified by manual review only; run a full `docker compose up` once Docker is available to confirm the engine container actually builds and starts.
- `prisma migrate dev` still blocked by VT-x Docker blocker (unchanged from Day 3).
- No mobile navigation yet — sidebar is desktop-only for now (unchanged from Day 3).
```

- [ ] **Step 2: Update `## Next Session — Day 4` to `## Next Session — Day 5`**

Replace the `## Next Session — Day 4` block with:

```markdown
## Next Session — Day 5

**Plan file:** `docs/superpowers/plans/2026-07-01-day5-redis-integration.md` *(to be written)*

**Goal:** Wire Redis into the running system for real: rate limiting on `/login` (tracked tech debt since Day 2) and a first live web→engine integration check against the new `/health` endpoint.

**Steps overview:**
1. Add a Redis client to `apps/web` (e.g. `ioredis`) and a rate-limit helper keyed by IP/email
2. Apply rate limiting to the `/login` credentials flow in `apps/web/auth.ts` or the login route handler
3. Add an internal engine base URL env var (`ENGINE_URL=http://engine:8000`) to `apps/web` and `docker/docker-compose.yml`
4. Write a small server-side helper in `apps/web` that calls `GET {ENGINE_URL}/health` and add a test that mocks the fetch
5. Vitest tests for rate-limit helper (blocks after N attempts, resets after window)
6. Commit

**Architecture decisions locked in:**
- Redis 7 already running via `docker/docker-compose.yml` (Day 1)
- Rate limiting is IP+email keyed, sliding window, backed by Redis (not in-memory — must survive across app instances)
- Web-to-engine calls go over the internal Docker network using the `engine` service name, never a host-exposed port
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(day4): update session context for day 5 handoff"
```

---

## Self-Review

**Spec coverage:**
- ✅ `apps/engine/` with Poetry (`pyproject.toml`, Task 1)
- ✅ `sentinel_engine/main.py` — FastAPI app with `/health` endpoint (Task 2)
- ✅ Dockerfile, `python:3.12-slim` base (Task 4)
- ✅ `engine` service added to `docker/docker-compose.yml` (Task 5)
- ✅ `sentinel_engine/routers/` with one router per module (Task 3)
- ✅ pytest tests for the health endpoint (Task 2) and router stubs (Task 3)
- ✅ TDD throughout — tests written before implementation in Tasks 2 and 3
- ✅ Engine port 8000, internal-only, not exposed (Task 5 — `expose`, no `ports:`)

**Placeholder scan:** None found. Every step includes complete, runnable code; the two steps that can't be automated (Dockerfile build, `docker compose up`) are explicitly called out as blocked by the pre-existing VT-x issue rather than glossed over, with a concrete manual-review checklist substituted.

**Type consistency:**
- `app` from `sentinel_engine.main` is imported identically in `test_health.py` and `test_routers.py` ✅
- Router modules all export `router: APIRouter` — consumed by name (`probe.router`, `mirror.router`, etc.) in `main.py`'s `include_router` calls ✅
- Stub response shape `{"module": str, "status": str}` is identical across all 5 routers and matches the assertion in `test_routers.py` ✅
- Compose service name `engine` matches the `ENGINE_URL=http://engine:8000` reference planned for Day 5 ✅
