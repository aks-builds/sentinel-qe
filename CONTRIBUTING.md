# Contributing to Sentinel

Thanks for your interest! Sentinel is in early, day-by-day development —
please read the [design spec](docs/superpowers/specs/2026-06-26-sentinel-design.md)
and the relevant [implementation plan](docs/superpowers/plans/) under `docs/`
first, so changes land in the right phase of the build.

## Development setup

Prerequisites: Node.js ≥ 20, pnpm ≥ 9, Docker, Python 3.12 + Poetry.

```bash
cp .env.example .env
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d

pnpm install
pnpm dev
pnpm test

cd apps/engine && poetry install && poetry run pytest
```

## Ground rules

- **Both SDKs stay in lockstep.** `sentinel-py` and `sentinel-js` must emit
  the identical `/api/traces` wire format. If you change one, change the
  other in the same PR.
- **Emit failures never surface to the caller.** Network errors or malformed
  config in a trace emit must be swallowed, not thrown — an instrumented
  agent should never crash because Sentinel is unreachable.
- **No secret leakage.** Never commit real credentials; `.env.example` only
  holds placeholder values.
- **Tests required.** Vitest for TypeScript, pytest for Python. New endpoints
  and SDK methods need coverage before merge.

## Pull requests

1. Branch off `main`.
2. Keep PRs scoped to one day/phase of the plan where possible.
3. Conventional commit messages (e.g. `feat(sentinel-js): trace.end() HTTP span emission`).
4. Update the relevant `CLAUDE.md` "Current Status" section if you change what's built.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
