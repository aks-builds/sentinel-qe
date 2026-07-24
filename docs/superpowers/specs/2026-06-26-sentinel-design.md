# Sentinel — Platform Design Spec
**Date:** 2026-06-26
**Status:** Approved — ready for implementation planning

---

## 1. What Sentinel Is

Sentinel is a self-hosted enterprise AI Quality Engineering platform. It gives AI/QA teams a single system to:

- Test AI agents they **build** (trace capture, hallucination attribution, CI/CD gate)
- Test AI products they **consume** (ChatGPT, Grok, Claude, Gemini — API + UI automation)
- Assess **cognitive capability** vs. human baselines (reasoning, creativity benchmarking)
- Evaluate **user reach and accessibility** (multi-language, bias, cultural sensitivity)
- Enforce **security** (PII leakage, prompt injection, GDPR/CCPA compliance)

**Target customer:** Enterprise AI/QA teams (50+ person orgs with compliance requirements, procurement cycles, data residency constraints).

**Deployment model:** Self-hosted only. Customers deploy Sentinel in their own VPC/cluster via Docker Compose or Helm. No data leaves the customer's environment.

---

## 2. The Five Modules

### Probe — Agent Testing (Agents You Build)
Tests agents that the customer's team builds and owns. Uses SDK instrumentation to capture full execution traces.

**Covers:**
- OpenTelemetry-compatible trace capture per agent run
- Tool-call validation: declared vs. actual parameters, schema contract enforcement
- Hallucination attribution across 5 workflow stages: Reasoning, Execution, Perception, Memorization, Communication
- Multi-agent topology graph: reconstruct agent dependency graph from traces, detect coordination failures
- Controlled variable test runner: fix all variables except one (model, prompt, topology), diff results
- CI/CD gate: block PRs on hallucination rate, cost, regression, adversarial pass rate thresholds

### Mirror — External AI Product Testing
Tests AI products the customer consumes via API or web UI. Pure black-box behavioral testing.

**Covers:**
- **API behavioral regression**: send prompt suites to OpenAI, Anthropic, Google, Grok APIs; evaluate response quality; detect model drift after provider updates
- **UI automation**: Playwright-driven tests against ChatGPT.com, Claude.ai, Gemini, Grok — verify UX flows, response rendering, conversation state
- Comparative benchmarking: run the same test suite across multiple providers, diff results
- Cost tracking per provider per test run

### Guard — Security
Tests the security posture of AI agents and AI products from both the system and user perspective.

**Covers:**
- Adversarial red-teaming: 28+ attack methods (23 single-turn, 5 multi-turn including Tree Jailbreaking, Crescendo Jailbreaking, Sequential Jailbreak)
- Agentic-specific vulnerabilities: Goal Theft, Recursive Hijacking, Excessive Agency, Tool Poisoning, Memory Poisoning
- PII leakage detection: scan outputs for exposed personal data across session boundaries
- User manipulation risk: detect outputs that could deceive or manipulate end users
- GDPR/CCPA compliance checks: data retention, deletion verification, cross-session isolation
- OWASP ASI:2026 checklist automation

### Cognify — Cognitive Capability Assessment
Benchmarks AI agent output quality against human expert baselines.

**Covers:**
- Human baseline collection: define tasks with known human expert outputs (reasoning, creative writing, domain-specific analysis)
- AI output scoring: multi-dimensional LLM-judge scoring (correctness, creativity, depth, novelty)
- Human vs. AI comparison: does the AI match, exceed, or fall below human expert level per task type?
- Longitudinal tracking: does model capability change across provider updates?
- Task library: reasoning puzzles, creative writing, domain tasks (legal, medical, engineering, financial)

### Reach — User Accessibility & Inclusivity
Tests whether AI agents and AI products work equitably across languages, cultures, demographics, and accessibility needs.

**Covers:**
- Multi-language quality: run the same test suite in 20+ languages, score response quality parity
- Cultural sensitivity: detect culturally inappropriate or offensive outputs across target markets
- Bias detection: measure demographic bias in outputs across gender, age, ethnicity, religion
- Reading level appropriateness: verify AI output matches target audience comprehension level
- WCAG accessibility: test AI product UIs for screen-reader compatibility, keyboard navigation, contrast ratios

---

## 3. Architecture

### Design Pattern: Modular Monolith

All modules share a common data model, auth layer, and project management shell. AI-heavy computation runs in a separate Python engine (same deployment, different process). Modules can be extracted to independent services without rewriting when scale requires it.

```
┌─────────────────────────────────────────────────────────┐
│                  Sentinel Web (Next.js 15)               │
│   Dashboard · Projects · Test Suites · Results · Reports│
│        Auth (NextAuth.js — SSO/OIDC/SAML)               │
│             API Routes (internal REST)                   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP (internal)
┌──────────────────────▼──────────────────────────────────┐
│              Sentinel Engine (Python / FastAPI)          │
│  Hallucination Attribution · LLM Judge · Red-team       │
│  Cognitive Benchmark · Accessibility Scorer             │
│  External AI API Runner · Playwright Controller         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                      Data Layer                          │
│  PostgreSQL   — projects, runs, results, users, orgs    │
│  ClickHouse   — traces, metrics, time-series at scale   │
│  Redis        — job queues (BullMQ), sessions, cache    │
│  MinIO        — artifacts, screenshots, reports, exports│
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                      SDKs (separate packages)            │
│  sentinel-py  → PyPI  (Python agent instrumentation)   │
│  sentinel-js  → npm   (TypeScript agent instrumentation)│
└─────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| UI + API shell | Next.js 15 (App Router) + TypeScript | Full-stack, SSR, API routes, file-based routing |
| AI engine | Python 3.12 + FastAPI + Uvicorn | Required for ML libs, LLM judges, Playwright Python |
| ORM | Prisma (web) + SQLAlchemy (engine) | Best-in-class for their respective languages |
| Primary DB | PostgreSQL 16 | Relational, ACID, battle-tested for enterprise |
| Metrics DB | ClickHouse | Columnar, handles millions of trace rows efficiently |
| Queue | Redis + BullMQ (JS) / Celery (Python) | Long-running eval jobs, async processing |
| Artifact store | MinIO (S3-compatible) | Self-hosted, enterprise S3 compatibility |
| Auth | NextAuth.js v5 | SSO via OIDC/SAML, built-in session management |
| UI components | shadcn/ui + Tailwind CSS | Accessible, composable, zero-dependency components |
| Monorepo | pnpm workspaces + Turborepo | Fast installs, task caching across packages |
| Python packaging | Poetry | Dependency management, virtual envs |
| Container | Docker Compose (dev/prod) + Helm (k8s) | Simple self-hosted deployment |
| Testing | Vitest (JS) + pytest (Python) | Fast, modern test runners |

---

## 4. Repo Structure

```
sentinel/
├── apps/
│   ├── web/                        # Next.js 15 app
│   │   ├── app/                    # App Router pages
│   │   │   ├── (auth)/             # Login, SSO callback
│   │   │   ├── dashboard/          # Main dashboard
│   │   │   ├── projects/           # Project management
│   │   │   ├── probe/              # Module: Probe
│   │   │   ├── mirror/             # Module: Mirror
│   │   │   ├── guard/              # Module: Guard
│   │   │   ├── cognify/            # Module: Cognify
│   │   │   ├── reach/              # Module: Reach
│   │   │   └── api/                # API routes
│   │   ├── components/             # Shared UI components
│   │   ├── lib/                    # Utilities, DB client, auth
│   │   └── prisma/                 # Schema + migrations
│   └── engine/                     # Python FastAPI service
│       ├── sentinel_engine/
│       │   ├── main.py             # FastAPI app entry
│       │   ├── routers/            # One router per module
│       │   ├── services/           # Business logic
│       │   ├── models/             # Pydantic schemas
│       │   └── workers/            # Celery tasks
│       ├── pyproject.toml
│       └── Dockerfile
├── packages/
│   ├── sentinel-py/                # Python SDK (PyPI: sentinel-sdk)
│   │   ├── sentinel/
│   │   │   ├── tracer.py           # OTel-compatible trace emitter
│   │   │   ├── integrations/       # LangChain, AutoGen, smolagents, CrewAI
│   │   │   └── types.py
│   │   └── pyproject.toml
│   ├── sentinel-js/                # TypeScript SDK (npm: @sentinel-ai/sdk)
│   │   ├── src/
│   │   │   ├── tracer.ts           # OTel-compatible trace emitter
│   │   │   ├── integrations/       # LangChainJS, Vercel AI SDK, OpenAI SDK
│   │   │   └── types.ts
│   │   └── package.json
│   └── sentinel-core/              # Shared OpenAPI schema + types
│       ├── schema/
│       │   └── openapi.yaml
│       └── package.json
├── docker/
│   ├── docker-compose.yml          # Full stack for local dev + self-hosted prod
│   └── docker-compose.dev.yml      # Dev overrides (hot reload, exposed ports)
├── infra/
│   └── helm/                       # Helm chart for k8s deployment (Phase 2)
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-06-26-sentinel-design.md
├── .github/
│   └── workflows/                  # CI for Sentinel's own test suite
├── pnpm-workspace.yaml
├── turbo.json
└── CLAUDE.md                       # Daily session context for Claude Code
```

---

## 5. Data Model (Unified)

All five modules write to the same core schema. A **TestRun** is the universal unit of work across all paradigms.

```
Organization
  └── Projects (e.g., "Customer Service Bot", "GPT-4o Regression Suite")
        └── TestSuites (e.g., "Hallucination checks", "Security red-team")
              └── TestRuns (one execution of a suite)
                    ├── RunResult (overall: pass/fail/warn, score, cost, duration)
                    └── StepResults[] (per-step: tool calls, hallucinations, attacks)
                          └── Traces[] (raw OTel spans — stored in ClickHouse)
```

**Key fields on TestRun:**

```typescript
type TestRun = {
  id: string
  suiteId: string
  module: 'probe' | 'mirror' | 'guard' | 'cognify' | 'reach'
  status: 'queued' | 'running' | 'passed' | 'failed' | 'errored'
  triggeredBy: 'manual' | 'ci' | 'schedule'
  config: RunConfig          // module-specific config (model, target URL, attack list, etc.)
  result: RunResult | null
  createdAt: DateTime
  completedAt: DateTime | null
}

type RunResult = {
  score: number              // 0–100 normalized across all modules
  passed: boolean
  stepCount: number
  hallucinationRate: number | null   // Probe only
  attackPassRate: number | null      // Guard only
  costUsd: number | null
  tokenCount: number | null
  durationMs: number
  findings: Finding[]        // actionable items with severity + evidence
}
```

---

## 6. Auth + Access Control

- **Auth:** NextAuth.js v5 with OIDC/SAML providers (Okta, Azure AD, Google Workspace, generic OIDC)
- **Local fallback:** Email/password with bcrypt for orgs without SSO
- **Structure:** Organization → Teams → Members with roles
- **Roles:** `owner`, `admin`, `tester`, `viewer`
- **Audit log:** Every test run, config change, user action logged to PostgreSQL with actor + timestamp — required for enterprise compliance

---

## 7. SDKs

### sentinel-py (PyPI: `sentinel-sdk`)
```python
import sentinel

sentinel.init(
  endpoint="https://sentinel.acme.internal",
  api_key="sk_...",
  project="customer-service-bot"
)

# Auto-instrumentation — wraps LangChain/AutoGen/CrewAI/smolagents
with sentinel.trace("run-001") as trace:
    result = agent.run("Refund my order #12345")
```

**Auto-instrumentation targets:** LangChain, LangGraph, AutoGen, CrewAI, smolagents, LlamaIndex, raw OpenAI/Anthropic SDK calls

### sentinel-js (npm: `@sentinel-ai/sdk`)
```typescript
import { Sentinel } from '@sentinel-ai/sdk'

const sentinel = new Sentinel({
  endpoint: 'https://sentinel.acme.internal',
  apiKey: 'sk_...',
  project: 'customer-service-bot'
})

const trace = sentinel.trace('run-001')
const result = await agent.run('Refund my order #12345')
await trace.end({ result })
```

**Auto-instrumentation targets:** LangChainJS, Vercel AI SDK, OpenAI Node SDK, Anthropic Node SDK

---

## 8. CI/CD Gate

```yaml
# .github/workflows/sentinel.yml
- uses: sentinel-ai/action@v1
  with:
    endpoint: ${{ secrets.SENTINEL_ENDPOINT }}
    api_key: ${{ secrets.SENTINEL_API_KEY }}
    suite: my-agent-suite
    thresholds:
      hallucination_rate: 0.05      # fail if >5%
      attack_pass_rate: 0.95        # fail if <95% attacks blocked
      cost_usd: 2.00                # fail if run costs >$2
      score: 80                     # fail if overall score <80
```

Sentinel posts a collapsible summary as a PR comment and blocks merge on threshold failure.

---

## 9. Daily Build Sequence

### Phase 1 — Foundation (Days 1–5)
| Day | Deliverable |
|---|---|
| 1 | Monorepo scaffold (pnpm + Turborepo), Next.js 15 app, Docker Compose with PostgreSQL + Redis + MinIO |
| 2 | Prisma schema (Org, Project, TestSuite, TestRun), NextAuth.js with local email/password auth, login/logout UI |
| 3 | Dashboard shell: sidebar nav (all 5 modules), project switcher, empty states, shadcn/ui design system |
| 4 | Python FastAPI engine scaffold, Docker service, health-check endpoint, web↔engine HTTP client |
| 5 | ClickHouse service added to Docker Compose, trace ingestion endpoint (web), storage client |

### Phase 2 — Probe v1 (Days 6–15)
| Day | Deliverable |
|---|---|
| 6 | sentinel-py SDK: `init()`, `trace()` context manager, HTTP emit to Sentinel endpoint |
| 7 | sentinel-js SDK: `Sentinel` class, `trace()`, TypeScript types, emit to endpoint |
| 8 | Tool-call capture: record declared vs. actual parameters, schema contract validation |
| 9 | Probe UI: test suite builder, run trigger, live status |
| 10 | Trace timeline viewer: step-by-step waterfall with latency per hop |
| 11 | Hallucination engine (Python): Reasoning stage detector (chain-of-thought critic) |
| 12 | Hallucination engine: Execution stage (tool selection + parameter validation) |
| 13 | Hallucination engine: Perception + Communication stage detectors |
| 14 | Hallucination heatmap overlay on trace timeline UI |
| 15 | Probe CI/CD gate: GitHub Action, threshold config, PR comment posting |

### Phase 3 — Mirror v1 (Days 16–22)
| Day | Deliverable |
|---|---|
| 16 | Mirror API runner: send prompt suites to OpenAI, Anthropic, Google, Grok APIs |
| 17 | LLM judge scorer: evaluate response quality (correctness, relevance, tone) |
| 18 | Model drift detection: compare current run vs. baseline, flag regressions |
| 19 | Comparative benchmarking UI: side-by-side provider results |
| 20 | Playwright integration: Python Playwright service in engine |
| 21 | UI automation for ChatGPT + Claude.ai: conversation flow tests |
| 22 | Mirror UI: test suite builder with API vs. UI mode toggle |

### Phase 4 — Guard v1 (Days 23–30)
| Day | Deliverable |
|---|---|
| 23 | Adversarial attack library: 23 single-turn attack prompts, categorized |
| 24 | Multi-turn attack engine: Tree Jailbreaking, Crescendo, Sequential Jailbreak |
| 25 | Agentic vulnerability tests: Goal Theft, Recursive Hijacking, Excessive Agency |
| 26 | PII leakage scanner: regex + LLM judge for PII in outputs |
| 27 | User manipulation risk detector: LLM judge for deceptive/manipulative outputs |
| 28 | GDPR/CCPA compliance checks: data retention, cross-session isolation tests |
| 29 | OWASP ASI:2026 checklist runner |
| 30 | Guard UI: attack results, severity heatmap, compliance report export |

### Phase 5 — Cognify v1 (Days 31–38)
| Day | Deliverable |
|---|---|
| 31 | Task library schema: reasoning, creative writing, domain tasks with human baselines |
| 32 | Benchmark runner: submit tasks to agent/AI product, collect outputs |
| 33 | Multi-dimensional scorer: correctness, creativity, depth, novelty via LLM judge panel |
| 34 | Human vs. AI comparison engine: score gap analysis |
| 35 | Longitudinal tracking: store scores over time, detect capability drift |
| 36 | Cognify UI: benchmark dashboard, human/AI score comparison charts |
| 37 | Task library management UI: add/edit tasks, set human baselines |
| 38 | Export: PDF benchmark report for enterprise reporting |

### Phase 6 — Reach v1 (Days 39–45)
| Day | Deliverable |
|---|---|
| 39 | Multi-language test runner: run prompt suites in 20+ languages |
| 40 | Language quality scorer: semantic equivalence checking via multilingual embeddings |
| 41 | Bias detection engine: demographic bias measurement across gender, age, ethnicity |
| 42 | Cultural sensitivity scanner: LLM judge for culturally inappropriate content |
| 43 | Reading level scorer: Flesch-Kincaid + LLM-based complexity assessment |
| 44 | WCAG accessibility checker: Playwright-based UI accessibility audit |
| 45 | Reach UI: language parity dashboard, bias heatmap, accessibility report |

### Phase 7 — CI/CD Gate + Polish (Days 46–50)
| Day | Deliverable |
|---|---|
| 46 | Unified CI/CD gate: single GitHub Action covers all 5 modules |
| 47 | PR comment formatter: collapsible summary with per-module scores |
| 48 | Merge blocking: configurable thresholds per module per project |
| 49 | SSO integration: OIDC/SAML (Okta, Azure AD) |
| 50 | Audit log UI, role management, org settings — enterprise readiness |

---

## 10. CLAUDE.md (Daily Session Protocol)

Each session starts by reading `CLAUDE.md` at the project root for the current day's task, context from the previous session, and any blockers. Each session ends by updating `CLAUDE.md` with:
- What was completed today
- Exact next step for tomorrow
- Any decisions made or blockers encountered

---

## 11. Open Questions

1. Should `sentinel-py` use OpenTelemetry SDK as the underlying transport, or a custom lightweight emitter? (OTel gives ecosystem compatibility; custom gives zero-dependency install)
2. Helm chart priority: is Day 50 too late, or do enterprise customers need k8s from Day 1?
3. Licensing model: Apache 2.0 (maximum adoption) vs. SSPL (MongoDB-style, prevents cloud providers from re-selling)

---

## 12. Judge Backend (resolved 2026-07-24, before Day 9)

Several deliverables from Day 11 onward (hallucination reasoning-stage critique, Day 17's "LLM judge scorer", Guard's manipulation/PII detectors, Cognify's multi-dimensional scorer, Reach's cultural-sensitivity scanner) were originally described as needing an "LLM judge." Sending customer AI-agent outputs to a third-party cloud LLM API to be scored would (a) contradict §1's "no data leaves the customer's environment" promise, and (b) cost real per-call money, contradicting the project's zero-investment constraint. This was caught before any of that code was written.

**Resolution:**
- **Default judge backend is a self-hosted, open-weight model** served via a new **Ollama** service in `docker/docker-compose.yml` (added when first needed, Day 11) — zero API cost, zero data leaves the deployment, consistent with "self-hosted only."
- The judge is implemented behind a **pluggable interface** in the Python engine (`sentinel_engine/services/judge.py` or similar, to be named in the Day 11 plan) so a real cloud provider can be swapped in later as an opt-in, non-default backend — never required to get a feature working.
- **Anything that doesn't need generative judgment skips the model entirely**: PII detection (regex), reading-level scoring (Flesch-Kincaid, a pure formula), tool-call/schema validation (deterministic, already built Day 8), semantic-equivalence checks (a small local embedding model, not a generative call) all stay rule-based/statistical — cheaper, deterministic, and easier to test than a model call regardless of cost.
- This does **not** apply to Mirror (Days 16–22): Mirror's entire purpose is testing external AI products the customer already sends data to as part of normal usage (OpenAI/Anthropic/Google/Grok APIs, ChatGPT.com/Claude.ai web UIs) — calling those providers is the feature being tested, not an internal implementation detail, so it's exempt from the local-first judge constraint.

## 13. Mirror Live-Site Automation (resolved 2026-07-24, before Day 9)

Days 20–21 (Playwright automation against ChatGPT.com/Claude.ai) originally implied driving real production web UIs. Without the user's own logged-in test accounts, this risks violating those products' Terms of Service and would be flaky to build/test against regardless.

**Resolution:** Days 20–21 build the Playwright automation framework and page-object selectors against **local test fixtures** — static HTML pages checked into the repo that mimic ChatGPT/Claude.ai's DOM structure closely enough to exercise the automation logic (conversation flow, message send/receive, response extraction) deterministically and offline. Pointing the same framework at the real live sites is a **config/base-URL swap**, deferred until the user supplies real test accounts and explicitly asks for it — never done automatically against production sites.

---

*Spec approved by user on 2026-06-26. Judge backend and Mirror automation scope amended 2026-07-24 (see §12–13), before Day 9 implementation began.*
