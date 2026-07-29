# Contributing to Sentinel

Thanks for your interest! Sentinel is in early, day-by-day development,
tracked against an internal design spec and per-day implementation plans
that aren't published in this repo. Open an issue first to confirm scope
and direction before submitting a substantial PR, so changes land in the
right phase of the build.

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
