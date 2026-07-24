# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Day 7 — `sentinel-js` SDK**: pnpm package scaffold (`@sentinel-ai/sdk`,
  zero runtime dependencies), `Sentinel` client class, `trace()` construction,
  and `Trace.end()` HTTP span emission matching `sentinel-py`'s wire format.
  Emit failures (network errors, malformed endpoint) are swallowed.
- **Day 6 — `sentinel-py` SDK**: Poetry package scaffold, `sentinel.init()`
  client configuration, `sentinel.trace()` context manager with HTTP span
  emission, ClickHouse-compatible `DateTime64` timestamps, swallowed
  malformed-endpoint errors.
- **Day 5 — trace ingestion**: `/api/traces` ClickHouse ingestion endpoint,
  Redis-backed sliding-window rate limiter applied to the login flow, a
  web-to-engine health check helper, and hardening against rate-limiter
  TOCTOU/spoofing gaps.
- **Day 4 — Python engine**: Poetry project for `sentinel-engine`, FastAPI
  app with a `/health` endpoint, stub routers for all five modules
  (Probe/Mirror/Guard/Cognify/Reach), Dockerfile, and wiring into Docker
  Compose.
- **Day 3 — dashboard shell**: module metadata, sidebar/header/sign-out
  components, module cards, and the wired dashboard layout.
- **Day 2 — auth**: Prisma schema (org/user/audit-log), NextAuth v5
  credentials provider with JWT sessions, login page, and middleware route
  protection.
- **Day 1 — foundation**: pnpm + Turborepo monorepo scaffold, Next.js 15 app
  with Tailwind CSS, shadcn/ui, Vitest, and a Docker Compose data layer
  (Postgres, Redis, MinIO, ClickHouse).

### Docs
- Platform design spec covering all five modules (Probe, Mirror, Guard,
  Cognify, Reach), architecture, tech stack, and repo structure.
