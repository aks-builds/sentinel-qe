# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub's
[private vulnerability reporting](https://github.com/aks-builds/sentinel-qe/security/advisories/new)
rather than opening a public issue, or email
[its.aks@outlook.com](mailto:its.aks@outlook.com). We aim to acknowledge
reports within a few business days.

## Security model

Sentinel is designed to be self-hosted entirely inside the customer's own
infrastructure:

- **No data leaves the deployment.** Traces, test results, and artifacts stay
  in the Postgres/ClickHouse/MinIO instances the customer runs.
- **SDK emit is fail-closed toward the caller.** `sentinel-py` and
  `sentinel-js` swallow network/config errors when emitting a trace — a
  broken or misconfigured Sentinel endpoint never crashes the instrumented
  agent.
- **No secret leakage.** `.env.example` ships placeholder values only; real
  credentials are never committed.

## Status

Sentinel is early-stage (Day 7 of a 50-day build). Auth, API key
validation, and several other security-relevant pieces described in the
[design spec](docs/superpowers/specs/2026-06-26-sentinel-design.md) are not
yet implemented — treat any pre-v1 deployment as a development instance, not
a production one.
