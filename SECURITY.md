# Security Policy

## Reporting a vulnerability
Please report security issues privately to **security@fetcher.cloud** rather
than opening a public issue. Include steps to reproduce and impact. We aim to
acknowledge within 72 hours.

## Scope
- The Worker API, payment handling, and MCP server.
- Please do **not** perform destructive testing against the live service.

## Secrets
- Payment **receiving addresses** are public and live in config.
- Facilitator credentials (`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`) are secrets
  set via `wrangler secret put` and are never committed.
