# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.1.0] - 2026-07
### Added
- `GET /capabilities` — machine-readable capability catalog (categories,
  pricing, examples, schemas), generated from the config source of truth.
- `GET /pricing.json` — machine-readable pricing.
- MCP tool metadata now includes category and per-call pricing.
- Repositioned as "the web capability layer for AI agents."
- Conway Automaton skill (`conway-skill/`).

## [1.0.0] - 2026-07
### Added
- 18 capabilities across browser, content, web-intelligence, domain/DNS, and
  utility categories.
- x402 payments in USDC on Base (mainnet), with per-capability free daily tiers.
- MCP server (Streamable HTTP), OpenAPI spec, ai-plugin manifest, llms.txt.
- Durable-Object-backed free-tier counter.
