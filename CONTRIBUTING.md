# Contributing

Contributions are welcome.

## Adding a capability
Each capability is: a pure-logic lib in `worker/src/lib/`, a thin route in
`worker/src/routes/`, and one entry in `worker/src/config.js` (`TOOLS`,
`CATEGORY`, `EXAMPLE`) plus a handler-map line. The manifest, paywall,
`/capabilities`, `/openapi.json`, and MCP all generate from that config, so a
new capability shows up everywhere automatically.

## Before opening a PR
- `npm install` in `worker/`, then `node --check` passes on all `src/**.js`.
- `npx wrangler deploy --dry-run` bundles cleanly.
- Keep the config as the single source of truth — don't hardcode prices or
  free tiers anywhere else.
