# Security policy

Report vulnerabilities privately through GitHub's "Report a vulnerability" (Security tab), not in a public issue. We aim to reply within 5 working days.

## Model
- The site is static: no server code, accounts, cookies or secrets. Data is public and precomputed by `pipeline/`.
- Earth Engine credentials exist only as the repository secret `EE_SERVICE_ACCOUNT_KEY`, used by the weekly data workflow.
- Browser defences: CSP (meta tag and `site/_headers`), SRI on third-party scripts, an allow-list HTML sanitiser for rendered Markdown, validated data paths and ids, schema checks on loaded data.
- Availability: a client-side request budget with retry/backoff and Retry-After handling; the preview server rate-limits per IP. GitHub Pages applies its own edge limits.
- CI: CodeQL, `npm audit`, `pip-audit`, a credential scan, and a PR checker that blocks secret-like content.
See `docs/architecture.md`.
