# Sentinel

> Self-hosted AI Quality Engineering platform — trace the agents you build, black-box test the AI products you consume, red-team them, benchmark them against human baselines, and audit them for accessibility. All in one deployment. No data leaves your infrastructure.

> [!NOTE]
> **Status: early, in-progress build (Day 7 of a 50-day plan).** The web
> shell, auth, and both agent SDKs (`sentinel-py`, `sentinel-js`) exist and
> emit real trace data end-to-end. Everything else in the module list below
> is design-complete but not yet implemented. See the
> [design spec](docs/superpowers/specs/2026-06-26-sentinel-design.md) for the
> full plan. Expect breaking changes before v1.

<img src=".github/media/how-it-works.png" width="900" alt="How sentinel-qe works: agent SDKs and external AI targets feed the Next.js web shell into a Python FastAPI engine's five QE modules (Probe, Mirror, Guard, Cognify, Reach), which persist to Postgres/ClickHouse/Redis/MinIO and surface results back in the dashboard" />

## The five modules

| Module | What it tests | Covers |
|---|---|---|
| **Probe** | Agents *you build* | OpenTelemetry-style trace capture, tool-call schema validation, hallucination attribution (reasoning/execution/perception/memorization/communication), multi-agent topology graphs, CI/CD quality gates |
| **Mirror** | AI products *you consume* | API behavioral regression across OpenAI/Anthropic/Google/Grok, Playwright-driven UI testing against ChatGPT/Claude.ai/Gemini/Grok, cross-provider benchmarking, cost tracking |
| **Guard** | Security posture | 28+ adversarial red-team attacks, agentic-specific vulnerabilities (goal theft, tool poisoning, memory poisoning), PII leakage detection, GDPR/CCPA checks, OWASP ASI checklist automation |
| **Cognify** | Cognitive capability | Human-baseline task library, multi-dimensional LLM-judge scoring, human-vs-AI comparison, longitudinal capability tracking across model updates |
| **Reach** | Accessibility & inclusivity | Multi-language quality parity (20+ languages), cultural sensitivity and bias detection, reading-level checks, WCAG UI audits |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Sentinel Web (Next.js 15)               │
│   Dashboard · Projects · Test Suites · Results · Reports│
│        Auth (NextAuth.js — SSO/OIDC/SAML)               │
│             API Routes (internal REST)                   │
└──────────────────────┬──────────────────────────────────┘
                        │ HTTP (internal)
┌───────────────────────▼──────────────────────────────────┐
│              Sentinel Engine (Python / FastAPI)          │
│  Hallucination Attribution · LLM Judge · Red-team        │
│  Cognitive Benchmark · Accessibility Scorer               │
│  External AI API Runner · Playwright Controller           │
└───────────────────────┬──────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────┐
│                      Data Layer                            │
│  PostgreSQL — projects, runs, results, users, orgs         │
│  ClickHouse — traces, metrics, time-series at scale        │
│  Redis      — job queues, sessions, cache                  │
│  MinIO      — artifacts, screenshots, reports, exports      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                      SDKs (separate packages)             │
│  sentinel-py  → PyPI  (Python agent instrumentation)      │
│  sentinel-js  → npm   (TypeScript agent instrumentation)   │
└─────────────────────────────────────────────────────────┘
```

Modular monolith: all five modules share one data model, auth layer, and
project shell. AI-heavy computation (LLM judges, red-teaming, Playwright
control) runs in the Python engine as a separate process in the same
deployment, so modules can be split into independent services later without
a rewrite.

## Tech stack

| Layer | Technology |
|---|---|
| UI + API shell | Next.js 15 (App Router) + TypeScript |
| AI engine | Python 3.12 + FastAPI + Uvicorn |
| ORM | Prisma (web) + SQLAlchemy (engine) |
| Primary DB | PostgreSQL 16 |
| Metrics DB | ClickHouse |
| Queue | Redis + BullMQ (JS) / Celery (Python) |
| Artifact store | MinIO (S3-compatible) |
| Auth | NextAuth.js v5 (SSO via OIDC/SAML) |
| UI components | shadcn/ui + Tailwind CSS |
| Monorepo | pnpm workspaces + Turborepo |
| Python packaging | Poetry |
| Container | Docker Compose (dev/prod) |
| Testing | Vitest (JS) + pytest (Python) |

## Quick start

Prerequisites: Node.js ≥ 20, pnpm ≥ 9, Docker.

```bash
cp .env.example .env

# start Postgres, Redis, MinIO, ClickHouse, and the Python engine
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d

pnpm install
pnpm dev          # runs all apps in the monorepo, Next.js on :3000
```

## Development

```bash
pnpm build          # turbo run build
pnpm test           # turbo run test (Vitest across packages)
pnpm lint           # turbo run lint
pnpm check-types    # turbo run check-types

cd apps/engine && poetry install && poetry run pytest   # Python engine tests
```

## Repo layout

```
sentinel/
├── apps/
│   ├── web/            # Next.js 15 app — dashboard, auth, module UIs, API routes
│   └── engine/          # Python FastAPI service — one router per module
├── packages/
│   ├── sentinel-py/     # Agent instrumentation SDK (PyPI)
│   └── sentinel-js/     # Agent instrumentation SDK (npm)
├── docker/              # Compose files for the data layer + engine
└── docs/                # Design spec, per-day implementation plans
```

## Design principles

- **Self-hosted only.** Deploy in your own VPC/cluster; no data leaves your environment.
- **SDK-first trace capture.** Agent instrumentation emits a stable trace shape shared by both SDKs, so instrumentation doesn't change as the backend evolves.
- **Fail closed on emit, not on the app.** SDK failures (network, malformed config) are swallowed at the emit boundary — a broken trace pipe should never crash the instrumented agent.

## License

Not yet licensed — a license will be added before the v1 release. Until then, all rights reserved.

## Contact

Questions or feedback: [its.aks@outlook.com](mailto:its.aks@outlook.com)
