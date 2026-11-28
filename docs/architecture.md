# Architecture

## Layout
```
pipeline/   Python. Fetch -> compute -> write data/ (the only writer of data/)
data/       Public contract (docs/data-contract.md), committed by the weekly Action
site/       Static frontend, no build step, no runtime dependencies
  js/services/   http, schema, data-service, state, i18n, csv, errors, sanitize  (no DOM layout)
  js/components/ legend, states, layer-control, temporal                          (DOM, no fetch)
  js/layers/     catalog of layers (single source of truth)
  js/app.js      page controller
scripts/    build-site.sh, static-server.mjs (preview + rate limit), lint.mjs, pr-check*.mjs
tests/      unit (node:test), data (contract + i18n), e2e (Playwright)
.github/    CI, security, PR checker, deploy, weekly data update
```

## Data flow
```
NASA POWER / WorldCover / WorldCereal --pipeline--> data/*.json,geojson --build-site.sh--> _site/
browser:  app.js -> data-service -> http client (budget, retry, timeout, dedupe)
                                      -> schema check -> domain objects -> components
                         failure -> offline snapshot (js/data-snapshot.js) -> "offline copy" badge
```
Rules: only `data-service` knows URLs; only `http.js` calls `fetch`; components never see payload shapes; missing values stay `null` and render as no-data.

## Security
- CSP on every page (meta) and in `site/_headers` (adds frame-ancestors, nosniff, Referrer/Permissions-Policy). GitHub Pages ignores headers, so the meta tag is the baseline.
- SRI on all third-party scripts (Leaflet, marked, Plotly).
- Rendered Markdown passes `Atlas.sanitize` (allow-list). Error text and CSV cells are inserted with `textContent` or escaped.
- Ids from the URL hash and paths are validated (`isSafeId`, `isSafePath`) before any fetch.
- No secrets in the frontend; Earth Engine key is a repository secret.

## Rate limiting and failure handling
- Client: token bucket (20 req/s, burst 10), max 6 concurrent, 15 s timeout, 3 retries with jittered exponential backoff, `Retry-After` honoured and capped, identical in-flight GETs shared. Exhausted 429 raises `RateLimitError`.
- Preview/e2e server: per-IP token bucket returning 429 + `Retry-After` (`RATE_LIMIT=<req/s>`).
- Uncaught errors: `Atlas.errors` keeps a bounded local log and shows one banner. Nothing is sent anywhere.

## Testing
`npm test` = lint (syntax, JSON, en/ur/ps key parity, CSP and SRI present) + unit (http, schema, server, PR checker) + data (contract, i18n) + e2e (Chromium desktop and phone: boot, selection, hash handling, RTL, retry on 429/503, missing series, offline snapshot, sanitiser, headers).

## CI/CD
- `ci.yml`: lint+unit, data contract, e2e matrix, build with size budget, one required gate `CI required`.
- `security.yml`: CodeQL (JS, Python), npm audit, pip-audit, history credential scan.
- `pr-checker.yml`: conventional title, secret scan of added lines, `data/` edits blocked without label, size and area labels, sticky comment. Runs on `pull_request_target` but never executes PR code.
- `deploy-pages.yml`: deploys `main`. `update-data.yml`: weekly data refresh. Dependabot weekly.
- Recommended repo settings: branch protection on `main` requiring `CI required` and the PR checker.
