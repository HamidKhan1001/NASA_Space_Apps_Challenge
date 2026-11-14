# AGENTS.md — KP Open Farm Atlas: Permanent Project Guide & Progress Tracker

| Field | Value |
|---|---|
| Official project name | KP Open Farm Atlas |
| Project type | Agricultural and environmental geospatial intelligence platform |
| Geographic focus | Khyber Pakhtunkhwa (KP), Pakistan |
| Repository | `24pwswe0003uet/NASA_Space_Apps_Challenge` (fork), upstream `HamidKhan1001/NASA_Space_Apps_Challenge` |
| Document role | Permanent source of truth for identity, architecture, rules, roadmap, data contract, and progress |
| Frontend owner | The user of this repository (frontend/UI lead) |
| Roadmap | Five phases (Foundation, Core Atlas, Data Visualization, Methods/i18n, Final Integration) |
| Last repository inspection | 2026-11-14 |
| Last updated | 2026-11-14 |
| Current overall progress | **14%** — Phase 1 foundation largely built on the team's `site/` frontend |
| Current status | Phase 1 in progress (~70%). Design tokens, base/layout/components/responsive CSS, service boundary, i18n service and shared state primitives implemented on the team's `site/` app. Browser-level responsive/RTL verification pending |

> **Read this file before starting any project task.**
> This document overrides assumptions from previous sessions, prompts, branches, pull requests, chat history, and the legacy prototype. If a request conflicts with this file, stop and explain the conflict before changing architecture, scope, technology, or data claims.

---

## 0. How a new session must use this file

At the start of every task:

1. Read this entire file.
2. Inspect the actual repository state (`git status`, current branch, files, recent history).
3. Identify which phase the task belongs to and check the live tracker.
4. Inspect the relevant existing implementation before editing anything.
5. Confirm whether the work depends on real data, the backend contract, or scientific approval.
6. Implement the smallest coherent change that follows the established architecture and design system.
7. Verify the result (see “Definition of verified”).
8. Update the tracker, blockers, and change log when meaningful progress occurs.

### Definition of verified

A task is verified only when:

- The code exists in the repository and is reachable through the interface, or the interface state is reachable and observable, and
- The behavior has been exercised (manual browser verification is acceptable when no automated test exists), and
- There are no console errors, broken links, or misrepresented missing-data states, and
- Any required data is real and its source, coverage, period, and units are identified.

“The prompt was given,” “the file exists,” “the placeholder is present,” or “it should work” do not count as verified.

### Source-of-truth precedence

1. Actual implementation in the repository.
2. Actual organizer/team-provided data, metadata, and the agreed backend contract.
3. This `AGENTS.md`.
4. Previous prompts, branches, PRs, or chat history.

If the repository or confirmed data contradicts this file, update this file rather than silently overriding reality.

---

## 1. Project identity and scope

The **KP Open Farm Atlas** is an agricultural and environmental geospatial intelligence platform for Khyber Pakhtunkhwa, Pakistan.

Its purpose is to provide an interactive geographic platform through which users can explore available agricultural, satellite, climate, soil, terrain, and environmental information.

The Atlas is intended to help users understand geographic patterns and explore available datasets through:

- Interactive geographic maps.
- Administrative-area exploration.
- Agricultural information.
- Satellite imagery and derived indicators.
- Vegetation information.
- Soil moisture information.
- Rainfall and precipitation information.
- Weather and climate information.
- Terrain and elevation information.
- Land-surface temperature and evapotranspiration information.
- Environmental observations.
- Charts and time-series visualizations.
- Geographic legends.
- Dataset metadata and source information.
- Methods, limitations, and validation information.

**These are intended capabilities, not proof that every dataset or feature is available.** Actual features must reflect confirmed datasets, confirmed geographic coverage, selected products, and the real backend/data contract.

The Atlas must not be described or implemented as exclusively a crop-rotation recommendation platform, a sustainable-intensification system, or a water-balance dashboard. Those may be supported analyses, but the central identity is an agricultural and environmental Atlas.

### Exploration levels

1. **Province level** — explore KP and its available administrative areas.
2. **District level** — explore areas and available indicators within a selected district.
3. **Sub-district level** — inspect available Union Council or equivalent administrative information.

Exact administrative levels, names, and counts must come from verified data and metadata supplied by the team/organizers.

**Confirmed implementation note (2026-11-14):** in the team's `data/` contract the third level is the **tehsil** (geoBoundaries ADM3), not the Union Council, and `data/districts.geojson` carries **31 districts** (2019 KP district set). The UI labels the third level "union council (tehsil)" but must not claim Union Council boundaries. Treat district/tehsil names and counts as data-driven, never hardcoded.

### Intended users

- Primary: an Agriculture Extension Field Assistant who needs to identify areas that may require field visits.
- Secondary: researchers, policymakers, journalists, agricultural organizations, and interested members of the public.

### Product honesty (non-negotiable)

The Atlas presents **administrative-area-level information**, not individual farm measurements. An area status is a signal about an administrative area; it is not proof that every farm in that area is dry, short of water, unhealthy, or otherwise in a specific condition.

Never claim, imply, or visualize as if the product provides:

- Farm-level monitoring or farm-level accuracy.
- Individual farm water or crop conditions.
- Forecasting or prediction.
- Confirmed drought warnings or confirmed environmental hazards.
- Yield prediction, food-security scoring, groundwater analysis, salinity analysis, or user accounts unless explicitly approved and implemented.

Every data view must clearly communicate, where applicable:

- Geographic resolution and administrative level.
- Data dates, reporting period, and units.
- Dataset source and product/version.
- Limitations of the method.
- Missing-data and partial-data conditions.

### Required disclosures

At minimum, the interface must identify the geographic resolution, the reporting period, the dataset source, and the units. When measurements are unavailable, show an explicit no-data state. Missing data must never be displayed as zero.

---

## 2. Candidate dataset inventory

The team has an organizer-provided dataset inventory containing candidate resources. The list below is a **reference inventory**, not a confirmed integration plan.

### NASA and related resources

- SMAP.
- GPM/IMERG.
- Landsat.
- MODIS/VIIRS.
- NASA POWER.
- SRTM.
- ECOSTRESS.
- NLDAS/GLDAS.
- GEDI.

### Other listed agricultural and environmental resources

- USDA Ag Data Commons.
- Web Soil Survey.
- Cropland Data Layer (CDL).
- PRISM.
- SSURGO/STATSGO2.
- NAIP.
- NLCD.
- GAEZ.
- CoCoRaHS.
- USGS NWIS.
- USDA AMS Market News.
- USDA NASS QuickStats.
- OpenET.
- USFS LANDFIRE.

### Partner resources

- ESA Copernicus Sentinel-2.
- ECMWF ERA5.

### Critical warning

**This inventory represents candidate resources, not a confirmed list of datasets that will all be integrated.**

For every proposed dataset, the team must verify:

- Availability for Khyber Pakhtunkhwa.
- Actual product and version.
- Geographic coverage.
- Spatial resolution.
- Temporal resolution.
- Observation dates and reporting periods.
- Data access method.
- Licensing and usage restrictions.
- Suitability for the intended Atlas feature.

Some resources may be geographically restricted or unsuitable for KP. Several listed resources are designed for the United States; never assume that a dataset designed for the United States provides valid coverage for Pakistan.

Do not claim that any resource has been integrated unless the repository and actual data integration confirm it.

### Candidate screening table

Every row below is **unverified for KP**. “Candidate use” is a possible Atlas role only; it is not a confirmed feature.

| Resource | Provider/category | Candidate use | KP availability |
|---|---|---|---|
| SMAP | NASA | Soil moisture | Candidate — unverified |
| GPM/IMERG | NASA/JAXA | Precipitation | Candidate — unverified |
| Landsat | NASA/USGS | Imagery and land-surface observations | Candidate — unverified |
| MODIS/VIIRS | NASA/NOAA | Vegetation and land-surface indicators | Candidate — unverified |
| NASA POWER | NASA | Weather and climate parameters | Candidate — unverified |
| SRTM | NASA | Terrain and elevation | Candidate — unverified |
| ECOSTRESS | NASA | Land-surface temperature and ET | Candidate — unverified |
| NLDAS/GLDAS | NASA | Modeled land-surface and moisture variables | Candidate — unverified |
| GEDI | NASA | Vegetation structure | Candidate — unverified |
| USDA Ag Data Commons | USDA | Agricultural datasets | Candidate — unverified |
| Web Soil Survey | USDA | Soil information | Candidate — unverified |
| CDL | USDA | Cropland classes (US-focused) | Candidate — unverified |
| PRISM | PRISM Climate Group | Climate data (US-focused) | Candidate — unverified |
| SSURGO/STATSGO2 | USDA | Soil survey data (US-focused) | Candidate — unverified |
| NAIP | USDA | Aerial imagery (US-focused) | Candidate — unverified |
| NLCD | USGS | Land cover (US-focused) | Candidate — unverified |
| GAEZ | FAO/IIASA | Agro-ecological zoning | Candidate — unverified |
| CoCoRaHS | Community network | Precipitation observations | Candidate — unverified |
| USGS NWIS | USGS | Water data (US-focused) | Candidate — unverified |
| USDA AMS Market News | USDA | Market information (US-focused) | Candidate — unverified |
| USDA NASS QuickStats | USDA | Agricultural statistics (US-focused) | Candidate — unverified |
| OpenET | OpenET consortium | Evapotranspiration (US-focused) | Candidate — unverified |
| USFS LANDFIRE | USFS/DOI | Vegetation and fire data (US-focused) | Candidate — unverified |
| Sentinel-2 | ESA Copernicus | Multispectral imagery | Candidate — unverified |
| ERA5 | ECMWF | Climate reanalysis | Candidate — unverified |

Integration status for every resource: **not integrated**. Only confirmed, verified datasets may appear in the application.

---

## 3. Team responsibilities

This is a team project. Responsibilities are split; do not silently absorb another member's scope.

### Frontend/UI developer responsibilities

- Application interface and visual design.
- Responsive layouts.
- Interactive map presentation.
- Geographic selection and layer controls.
- Dataset and indicator presentation.
- Charts and visualizations.
- Navigation and application state.
- Multilingual interface and RTL support.
- Loading, empty, partial-data, and error states.
- CSV export interface.
- Frontend services and data adapters.
- Accessibility and performance improvements.
- Frontend documentation.

### Backend/data developer responsibilities

- Real data acquisition.
- External API integration.
- NASA and partner data access.
- Data processing and transformation.
- Geographic aggregation.
- Scientific calculations.
- Backend services.
- Data preparation and delivery.
- Defining and providing the actual frontend data contract.

### Scientific/data validation responsibilities

- Dataset suitability.
- Scientific methodology.
- Measurement interpretation.
- Classification rules.
- Thresholds.
- Validation methodology.
- Interpretation of scientific limitations.

### Coordination rules

- Do not assign backend integration or scientific calculations to the frontend developer unless the team explicitly changes these responsibilities.
- The frontend consumes the agreed data contract. It must not guess or invent that contract.
- If data, schema, thresholds, or validation values are missing, mark the task blocked and record the dependency.
- Architectural changes (framework, build system, hosting model) require explicit team approval and a change-log entry.
- If a task requires a backend change, request it; do not fake it in the frontend.

---

## 4. Technical architecture

### Verified current repository state (2026-11-14)

| Item | Verified state |
|---|---|
| Root files | `AGENTS.md`, `README.md`, `LICENSE`, `.gitignore`, `docs/`, `data/`, `pipeline/`, `scripts/`, `.github/workflows/` |
| `README.md` | Rewritten by the team for the Atlas (local preview, pipeline, deploy) |
| `data/` | Exists — demo data contract v0.1 (`meta.json` `mode:"demo"`, `districts.geojson`, `ucs/`, `series/`, `validation.csv`) |
| `docs/` | `docs/data-contract.md` (v0.1) and `docs/methods.md` exist |
| `pipeline/` | `make_snapshot.py` and related build scripts exist |
| Frontend app | Team-built static app under `site/` (`index.html`, `methods.html`, `css/`, `js/`, `strings.json`) |
| JavaScript modules/services | Extracted into `site/js/config.js`, `site/js/utils.js`, `site/js/services/*`, `site/js/components/*` (Phase 1) |
| Leaflet / Plotly | Leaflet 1.9.4 and Plotly 2.35.2 loaded from CDN |
| i18n / RTL implementation | `site/strings.json` (en/ur/ps) plus `site/js/services/i18n.js`; `dir`/`lang` switching implemented |
| Deployment configuration | `.github/workflows/deploy-pages.yml` publishes `site/` (with `data/` and `docs/` copied in) to GitHub Pages |
| Design system | `site/css/tokens.css`, `base.css`, `layout.css`, `components.css`, `responsive.css` (Phase 1) |
| Atlas phase implementation | Phase 1 foundation implemented; no new map/analytics features added |

The legacy prototype was removed on 2026-11-14. It is recorded in section 13 and earns no phase credit.

### Actual stack (verified)

The frontend is a lightweight static app, matching the planned direction:

- HTML5.
- CSS3.
- Vanilla JavaScript (ES5-style, no bundler).
- Leaflet 1.9.4 for the interactive map.
- Plotly basic 2.35.2 for charts (loaded on demand).
- marked 12.0.2 to render the Methods markdown.
- Anime.js 3.2.2 vendored at `site/vendor/anime.min.js` (approved; subtle transitions only, reduced-motion aware).
- Static hosting with GitHub Pages compatibility.

Do not introduce React, Vue, Angular, Next.js, Svelte, a Node build system, Docker, a frontend database, or unnecessary dependencies without explicit team approval.

### Actual folder structure (verified 2026-11-14)

```text
/
├── AGENTS.md
├── README.md
├── LICENSE
├── .github/workflows/deploy-pages.yml   # publishes site/ + data/ + docs/
├── data/                                # team-provided demo data (contract v0.1)
│   ├── districts.geojson                # 31 districts (2019 set)
│   ├── meta.json                        # mode:"demo", thresholds, sources, dekads
│   ├── ucs/<district_id>.geojson        # ADM3 tehsils (not Union Council boundaries)
│   ├── series/<unit_id>.json            # per-dekad et/rain/deficit/status
│   └── validation.csv
├── docs/
│   ├── data-contract.md                 # authoritative frontend data contract
│   └── methods.md
├── pipeline/
│   └── make_snapshot.py                 # bundles data/ + strings.json for offline demo
├── scripts/
│   └── serve.sh                         # local static preview
└── site/                                # deployable frontend (Pages root)
    ├── index.html                       # Atlas page (map + panel)
    ├── methods.html                     # Methods & validation page
    ├── strings.json                     # single i18n dictionary (en/ur/ps)
    ├── css/
    │   ├── tokens.css                   # design tokens
    │   ├── base.css                     # reset, typography, focus
    │   ├── layout.css                   # shell: header, stage, footer, doc
    │   ├── components.css               # badges, legend, cards, chips, buttons...
    │   └── responsive.css               # mobile breakpoint
    ├── js/
    │   ├── config.js                    # endpoints, palette mirror, layer list
    │   ├── utils.js                     # DOM/number/date/colour helpers
    │   ├── app.js                       # Atlas page controller
    │   ├── methods.js                   # Methods page controller
    │   ├── components/
    │   │   ├── legend.js                # metadata-driven legend
    │   │   └── states.js                # loading / error primitives
    │   └── services/
    │       ├── state.js                 # shared app state + language persistence
    │       ├── i18n.js                  # dictionary load, t(), lang/dir
    │       ├── data-service.js          # only module that knows data/ URLs + snapshot
    │       ├── csv.js                   # CSV export
    │       └── motion.js                # reduced-motion-aware Anime.js wrapper
    └── vendor/
        └── anime.min.js                 # vendored Anime.js 3.2.2 (MIT)
```

The deploy workflow stages `site/` as the site root and copies `data/` and `docs/` alongside it, so runtime URLs stay relative (`data/...`, `docs/...`, `strings.json`).

Note: `site/strings.json` is the single i18n dictionary (the earlier three-file `en/ur/ps.json` plan was superseded — see change log). `site/data/` and `site/js/data-snapshot.js` are gitignored (populated by the deploy workflow / snapshot script).

### Application entry points and pages (implemented)

- `index.html` — main Atlas experience: map, geographic selection, indicators, legends.
- `methods.html` — Methods and Data Sources page: datasets, methodology, limitations, validation.
- Shared application shell across both pages: header, navigation, language switcher, footer, state components.

Both pages share the same stylesheet set and shell classes (`.top`, `.brand`, `.stage`, `.foot`). The Atlas page is fully i18n-wired; the Methods page remains English-only until Phase 4, when the shared i18n service is applied to it.

### Map architecture (implemented in the team's `site/` app; extended in Phase 2)

- Leaflet map container initialized once per page.
- KP framing established from verified boundary data, not hardcoded assumptions.
- Administrative boundaries loaded through the data service, not inline in map code.
- Selection state managed at the page/controller level and reflected in the map, details panel, and URL/state as agreed.
- Layer controls only for confirmed datasets.
- Geographic loading, error, empty, and no-data states handled explicitly.
- Tehsil (ADM3) boundaries loaded on demand for the selected district only.
- Mobile-first map workspace with accessible controls.

### Chart architecture (planned)

- Plotly used only where a chart adds real value.
- Charts receive prepared data from the data service; no scientific calculation in the chart layer.
- Units, labels, period, and source come from metadata/i18n, not hardcoded strings.
- Charts handle loading, empty, partial, and error states.
- Heavy chart code loaded on demand where practical.

### Translation architecture (implemented)

- Single dictionary `site/strings.json` with `en`/`ur`/`ps` sections (supersedes the earlier three-file plan — see change log).
- `site/js/services/i18n.js` loads it, resolves `t(key, vars)` with an English fallback, and updates `<html lang>`/`dir`.
- All Atlas user-facing strings resolve through the service; no duplicated per-page translations.
- Language choice persisted (`atlas.lang`) and reapplied on load; the Atlas re-renders on change.
- Missing keys fall back to English, then to the key itself.
- RTL direction switching implemented; visual RTL layout verification still pending (Phase 4).

### Data services and adapter boundaries (implemented)

- `site/js/services/data-service.js` is the only module that knows `data/` URLs, fetch behavior, caching, and the offline snapshot fallback. Other modules request domain objects (`meta`, `districts`, `ucs`, `series`).
- The service normalises the confirmed demo contract (v0.1, `docs/data-contract.md`) into UI-ready shapes.
- UI components must not know external API response formats.
- No secrets or API keys in the static frontend; data is precomputed by the team's pipeline.
- Missing values remain `null`/absent and are rendered as no-data, never coerced to `0`.

### Static assets and deployment

- `.github/workflows/deploy-pages.yml` publishes `site/` to GitHub Pages; only changes under `site/**`, `data/**`, or `docs/**` trigger a deploy, so new frontend files must live under `site/`.
- Relative URLs compatible with GitHub Pages subpath hosting.
- No server-side routing assumptions, runtime environment variables, or server code.
- Prefer SVG/CSS or optimized raster assets; avoid heavy media.
- Verify direct page loads and refreshes over a static HTTP server before Phase 5 sign-off.

### Architecture rules

- Shared header, footer, navigation, legend, and state components must be reused, not duplicated.
- Map and chart code must not contain business labels, thresholds, or source text; use metadata/i18n services.
- Keep pages usable without a bundler.
- No global namespace pollution; encapsulate modules.
- Comment only where intent is not obvious; avoid decorative comments.

---

## 5. Permanent Development Rules

### Architecture

- Preserve the existing architecture.
- Reuse shared components.
- Avoid duplicate implementations.
- Avoid unnecessary dependencies.
- Do not rebuild working modules without a clear reason.
- Keep the application modular and maintainable.

### Design

- Maintain one consistent design system.
- Use existing design tokens.
- Preserve typography, spacing, color, and component consistency.
- Build mobile-first responsive interfaces.
- Maintain English, Urdu, and Pashto support.
- Support RTL correctly.
- Avoid generic dashboard styling and unnecessary visual effects.

### Data integrity

- Never fabricate real agricultural or environmental data.
- Never replace missing values with zero.
- Never invent dataset coverage, units, timestamps, or resolution.
- Never invent scientific thresholds or classifications.
- Clearly distinguish unavailable data from actual zero values.
- Display source information when available.
- Respect the confirmed backend data contract.

### API integration

- Never invent NASA or partner API endpoints.
- Never invent API keys or response formats.
- Do not assume all inventory datasets will be used.
- Do not couple UI components directly to external API response formats.
- Use the established service and adapter architecture.
- Mark unconfirmed integration requirements as pending.

### Scientific responsibility

- Do not independently perform scientific calculations in the frontend.
- Follow confirmed scientific methodology.
- Clearly communicate data limitations.
- Never imply that administrative-area measurements represent every individual farm.

### Scope control

- Do not add forecasting, yield prediction, food-security scoring, farm-level monitoring, groundwater analysis, salinity analysis, user accounts, or other unapproved features.
- Do not add features simply to make the application appear more complicated.
- Confirm that a proposed feature belongs to the agreed Atlas scope before implementing it.

### Quality

- Handle loading, empty, error, and partial-data states.
- Test mobile, tablet, and desktop layouts.
- Maintain accessibility.
- Verify deployment paths.
- Never claim a test passed unless it was actually performed.

### Conflict protocol

If a request conflicts with these rules, the roadmap, or the agreed architecture:

1. Stop before implementing the conflicting part.
2. Explain the conflict in plain language.
3. Propose the smallest compliant alternative.
4. Ask for a decision and record the outcome in the change log.

---

## 6. Five-Phase Development Roadmap

The roadmap describes the five planned phases. It does not mean any phase is complete. Keep each phase status in sync with section 7.

---

### PHASE 1 — Project Foundation, Architecture & Professional Design System

**Status:** In Progress — 70%  
**Owner:** Frontend/UI

**Purpose:** Establish the project foundation and visual identity.

**Expected work:**

- [x] Confirm clean-slate repository after legacy prototype files are removed.
- [x] Confirm project folder structure and architecture with the team. (Settled on the team's `site/` app + `data/` contract; recorded in section 4.)
- [x] Create design tokens (color, typography, spacing, radii, shadow, z-index). (`site/css/tokens.css`.)
- [x] Build base styles (reset, typography, utilities, focus states). (`site/css/base.css`.)
- [x] Build shared application shell (header, navigation, footer, page container). (`site/css/layout.css` + shared markup/classes.)
- [x] Build responsive layout foundation and breakpoints. (`site/css/responsive.css`.)
- [x] Build shared components (buttons, cards, panels, tables, badges, legends, states). (`site/css/components.css`, `site/js/components/legend.js`, `site/js/components/states.js`.)
- [x] Create centralized i18n dictionaries for English, Urdu, and Pashto. (Single `site/strings.json`.)
- [x] Implement language switcher, persistence, and direction switching. (`site/js/services/i18n.js`, `state.js`.)
- [~] Verify RTL readiness for Urdu and Pashto. (Direction switching implemented; browser RTL verification pending — Phase 4.)
- [x] Define the data-service architecture and adapter boundary. (`site/js/services/data-service.js`.)
- [x] Add loading, empty, partial-data, error, and no-data state primitives. (`site/js/components/states.js` + no-data rendering in `app.js`.)
- [~] Write the frontend architecture note and update README. (README updated by the team; architecture captured in section 4.)
- [~] Verify shell behavior on desktop, tablet, and mobile. (Static/served checks pass; browser-level responsive verification pending.)

**Completion criteria:**

- [x] Design tokens are used consistently across the shell and components.
- [x] The shared shell works on the Atlas and Methods pages.
- [ ] Responsive foundation verified at target widths. (Requires browser verification.)
- [x] Components are reused at least twice and documented in code.
- [ ] Language switching and RTL are verified. (Implementation done; browser verification pending.)
- [x] Data-service boundary exists and contains no UI logic.
- [x] No duplicated shell implementations.

**Dependencies:** Legacy prototype removal (done); team agreement on architecture and folder layout (settled on `site/`); initial data-contract shape (v0.1 present).

---

### PHASE 2 — Core Atlas Interface & Interactive Geographic Exploration

**Status:** Not Started — 0%  
**Owner:** Frontend/UI (data from backend/data lead)

**Purpose:** Build the main Atlas experience.

**Expected work:**

- [ ] Build the main Atlas page using the shared shell.
- [ ] Initialize the Leaflet map with correct KP framing from verified geography.
- [ ] Load verified administrative boundaries through the data service.
- [ ] Implement geographic exploration and selection state.
- [ ] Present administrative boundaries with accessible interaction.
- [ ] Add map controls (zoom, reset extent, province extent) with accessible names.
- [ ] Add layer controls only for confirmed, available datasets.
- [ ] Add dataset selection interface only where appropriate and confirmed.
- [ ] Add geographic legends driven by metadata.
- [ ] Add reporting-period controls populated only from actual metadata.
- [ ] Display source, period, resolution, and limitations near the map.
- [ ] Handle map loading, empty, error, and no-data states.
- [ ] Verify the responsive map workspace and keyboard interaction.

**Completion criteria:**

- [ ] Interactive province Atlas works with verified boundaries.
- [ ] Geographic selection works and is keyboard accessible.
- [ ] Legends and reporting-period controls reflect real metadata.
- [ ] Only confirmed datasets appear in layer controls.
- [ ] Missing geography or measurements render as no-data, not zero.
- [ ] Source, period, and resolution are disclosed.
- [ ] Mobile and desktop map behavior verified.

**Dependencies:** Verified administrative GeoJSON; dataset selection decisions; boundary and period metadata; agreed data contract.

---

### PHASE 3 — Agricultural & Environmental Data Visualization

**Status:** Not Started — 0%  
**Owner:** Frontend/UI (data and science from backend/data and validation leads)

**Purpose:** Build the data exploration and analytical presentation experience.

**Expected work:**

- [ ] Build agricultural and environmental indicator interfaces from confirmed datasets.
- [ ] Build dataset-specific information panels.
- [ ] Display statistics and measurement cards with explicit units.
- [ ] Implement time-series visualizations with Plotly where appropriate.
- [ ] Add reporting-period controls only from confirmed metadata.
- [ ] Display geographic and dataset metadata with each visualization.
- [ ] Implement CSV export where supported, matching displayed data and columns.
- [ ] Handle missing, partial, and unavailable measurements explicitly.
- [ ] Add chart loading, empty, and error states.
- [ ] Verify chart and table readability on mobile.
- [ ] Ensure no scientific calculation is performed in the frontend.

**Completion criteria:**

- [ ] Indicator views display only confirmed, real data.
- [ ] Units, periods, sources, and geographic identifiers are accurate.
- [ ] Time-series charts use real data and metadata dates.
- [ ] CSV exports match displayed data and are clearly labelled.
- [ ] Missing values render as no-data, never as zero.
- [ ] Charts and tables are usable on phone, tablet, and desktop.
- [ ] No fabricated thresholds, classifications, or values.

**Dependencies:** Confirmed datasets and metadata; backend/data contract; time-series data; CSV format agreement; scientific interpretation guidance.

---

### PHASE 4 — Methods, Data Sources, Validation & Multilingual Support

**Status:** Not Started — 0%  
**Owner:** Frontend/UI (methodology and validation from science/backend leads)

**Purpose:** Make the Atlas transparent, understandable, and accessible.

**Expected work:**

- [ ] Build the Methods and Data Sources page using the shared shell.
- [ ] Document each dataset: source, product, version, coverage, resolution, period, access method, license.
- [ ] Explain the methodology using approved scientific documentation.
- [ ] Explain spatial and temporal resolution, units, and interpretation limits.
- [ ] Present validation only where compatible reference data exists.
- [ ] Display correlation or accuracy statistics only when supplied and approved.
- [ ] Add source citations and access dates where provided.
- [ ] Complete English, Urdu, and Pashto translations for all user-facing strings.
- [ ] Refine RTL layouts across Atlas and Methods.
- [ ] Implement translation fallback handling.
- [ ] Verify language persistence and state preservation.
- [ ] Review translations with a fluent reviewer.
- [ ] Keep glossary terms consistent across languages.

**Completion criteria:**

- [ ] Methods page matches the design system and shared shell.
- [ ] Dataset sources, coverage, resolution, and limitations are accurate.
- [ ] Methodology wording is approved by the responsible scientific owner.
- [ ] Validation content uses real reference data and states its coverage.
- [ ] No invented statistics, correlations, or claims.
- [ ] Language switching works across every page.
- [ ] RTL layouts verified for Urdu and Pashto.
- [ ] Missing translations fall back safely.

**Dependencies:** Approved methodology and limitations; confirmed dataset documentation; validation reference data; fluent translation review.

---

### PHASE 5 — Final Integration Readiness, Performance, QA & Competition-Level Polish

**Status:** Not Started — 0%  
**Owner:** Frontend/UI with the full team

**Purpose:** Bring the complete application together.

**Expected work:**

- [ ] Review the full repository and architecture.
- [ ] Audit cross-phase functionality.
- [ ] Verify frontend integration against the confirmed data contract.
- [ ] Document the final data contract and integration behavior.
- [ ] Review scientific data integrity with the validation owner.
- [ ] Audit UI/UX consistency and design-system use.
- [ ] Test mobile, tablet, desktop, and RTL layouts.
- [ ] Optimize map rendering and load finer boundaries on demand.
- [ ] Optimize chart loading and general page performance.
- [ ] Audit loading, empty, partial-data, error, and no-data states.
- [ ] Audit accessibility (semantics, keyboard, focus, contrast, labels).
- [ ] Test multilingual behavior and language persistence.
- [ ] Verify GitHub Pages compatibility and relative paths.
- [ ] Complete documentation and handover notes.
- [ ] Run final quality assurance and record actual results.

**Completion criteria:**

- [ ] All implemented features work together.
- [ ] No fabricated data or unsupported scientific claims.
- [ ] No farm-level or predictive claims.
- [ ] Responsive and RTL behavior verified.
- [ ] Performance measured and recorded, not merely claimed.
- [ ] Pending external dependencies documented.
- [ ] Documentation and handover complete.
- [ ] Static hosting verified.

**Dependencies:** All prior phases; final data contract; scientific sign-off; hosting confirmation; team review.

---

## 7. Live Project Progress Tracker

### Summary

| Phase | Name | Status | Progress | Verified notes |
|---|---|---|---|---|
| Phase 1 | Foundation, Architecture & Design System | In Progress | 70% | Tokens, base/layout/components/responsive CSS, service boundary, i18n and state primitives implemented on `site/`; browser responsive/RTL verification pending |
| Phase 2 | Core Atlas & Geographic Exploration | Not Started | 0% | Map drilldown exists in the team app but is not yet audited/owned as Phase 2; no Phase 2 sign-off |
| Phase 3 | Agricultural & Environmental Data Visualization | Not Started | 0% | No indicator views, charts, CSV export, or data service exists |
| Phase 4 | Methods, Data Sources, Validation & Multilingual Support | Not Started | 0% | No Methods page, documentation, translations, or RTL exists |
| Phase 5 | Final Integration, Performance & QA | Not Started | 0% | No integration, performance, or deployment verification exists |

### Overall project status

| Metric | Value |
|---|---|
| Overall completion | **14%** |
| Current active phase | Phase 1 — Foundation, Architecture & Design System |
| Completed phases | 0 of 5 |
| Pending phases | All five |
| Critical issues | Demo data only (`mode:"demo"`); no verified production KP datasets; browser responsive/RTL verification outstanding |
| External dependencies | See section 11 |
| Next development priority | Verify Phase 1 in a browser, then audit the team's map drilldown as Phase 2 |

Progress is calculated only from verified tasks. No phase receives credit for the legacy prototype, placeholder text, or delivered prompts.

### Phase 1 tracker

| Field | Value |
|---|---|
| Status | In Progress |
| Progress | 70% |
| Completed tasks | Clean-slate baseline; design tokens; base/layout/components/responsive CSS; shared state/i18n services; data-service boundary; loading/error/no-data primitives; legend component; Anime.js vendored and motion service |
| Partially completed tasks | Architecture note (captured in section 4); RTL and responsive verification (implementation done, browser check pending) |
| Pending tasks | Browser verification of responsive shell, RTL layout, language switching |
| Known bugs | None observed; static checks and asset smoke test pass. No console-level browser run performed |
| Blockers | None for the foundation itself; browser verification tooling |
| Relevant files | `site/css/*`, `site/js/config.js`, `site/js/utils.js`, `site/js/services/*`, `site/js/components/*`, `site/js/app.js`, `site/vendor/anime.min.js` |
| Next action | Browser-verify Phase 1 across desktop/tablet/mobile and en/ur/ps, then close Phase 1 |

### Phase 2 tracker

| Field | Value |
|---|---|
| Status | Not Started |
| Progress | 0% |
| Completed tasks | None |
| Partially completed tasks | None |
| Pending tasks | All Phase 2 tasks in section 6 |
| Known bugs | None observed for this phase; no map code exists |
| Blockers | Verified boundaries; confirmed dataset selection; period metadata; data contract |
| Relevant files | None |
| Next action | Obtain and inspect verified administrative boundaries and metadata |

### Phase 3 tracker

| Field | Value |
|---|---|
| Status | Not Started |
| Progress | 0% |
| Completed tasks | None |
| Partially completed tasks | None |
| Pending tasks | All Phase 3 tasks in section 6 |
| Known bugs | None observed for this phase; no visualization code exists |
| Blockers | Confirmed indicators and time series; units/periods; CSV format; scientific guidance |
| Relevant files | None |
| Next action | Confirm indicator and time-series schemas with the backend/data and validation leads |

### Phase 4 tracker

| Field | Value |
|---|---|
| Status | Not Started |
| Progress | 0% |
| Completed tasks | None |
| Partially completed tasks | None |
| Pending tasks | All Phase 4 tasks in section 6 |
| Known bugs | None observed for this phase; no Methods page exists |
| Blockers | Approved methodology; dataset documentation; validation data; translation review |
| Relevant files | None |
| Next action | Request methodology, dataset documentation, and validation references |

### Phase 5 tracker

| Field | Value |
|---|---|
| Status | Not Started |
| Progress | 0% |
| Completed tasks | None |
| Partially completed tasks | None |
| Pending tasks | All Phase 5 tasks in section 6 |
| Known bugs | None observed for this phase; no integrated application exists |
| Blockers | All prior phases; final contract; hosting confirmation; team sign-off |
| Relevant files | None |
| Next action | Revisit after Phase 4 acceptance |

### Verified completed features

Phase 1 foundation (statically verified: `node --check` on all JS, JSON parse, CSS brace balance, HTML asset smoke test over a local HTTP server). Browser console/responsive/RTL verification is still outstanding.

- Design-token stylesheet consumed by base/layout/components/responsive layers.
- Service boundary (`data-service.js`) plus i18n, state, csv and motion services.
- Shared legend and state (loading/error) components.
- Language switching with persistence and `dir`/`lang` toggling.

No map, analytics, or scientific feature is claimed as Phase 1 work.

### Remaining work

Finish Phase 1 browser verification; then Phases 2–5.

---

## 8. Real Data & Integration Contract

A demo data contract **v0.1 exists and is documented** at `docs/data-contract.md`, with demo data under `data/` (`meta.json` carries `mode:"demo"` and `contract_version 0.1`). It is a demo contract, not yet a production/real-data contract. This section records what the frontend consumes today and what must still be confirmed for real data.

`Pending production data confirmation` applies to every category not marked as demo-confirmed below.

### Expected information categories

| Category | Frontend need | Status |
|---|---|---|
| Geographic boundaries | Administrative geometries by level | Demo v0.1 confirmed (31 districts + ADM3 tehsils) |
| Geographic identifiers | Stable IDs and names for every area | Demo v0.1 confirmed (e.g. `PK.KP.CHA`) |
| Dataset identifiers | Stable dataset/product IDs and metadata | Demo v0.1 confirmed (`meta.json`) |
| Agricultural measurements | Confirmed agricultural attributes and units | Demo v0.1 (hectares); production pending |
| Satellite-derived indicators | Confirmed indicator values, units, periods | Demo v0.1 (`et_mm`, `rain_mm`, `deficit_mm`); production pending |
| Soil and moisture observations | Confirmed soil/moisture variables | Pending confirmation |
| Rainfall and precipitation | Confirmed precipitation variables and periods | Demo v0.1 (`rain_mm`); production pending |
| Weather and climate measurements | Confirmed parameters, units, periods | Pending confirmation |
| Terrain and elevation | Confirmed elevation/terrain products | Pending confirmation |
| Environmental observations | Confirmed environmental indicators | Pending confirmation |
| Time-series observations | Ordered observations with dates and units | Demo v0.1 confirmed (`series/*.json`, dekads) |
| Reporting-period metadata | Period IDs, start/end dates, labels | Demo v0.1 confirmed (dekads) |
| Dataset source information | Provider, product, version, citation, license | Demo v0.1 partial (`meta.sources`) |
| Spatial and temporal resolution | Resolution, coverage, cadence | Demo v0.1 partial (dekad cadence) |
| Validation data | Reference data and approved statistics | Demo skeleton (`validation.csv`); census rows pending |

### Interface documentation requirements

For every confirmed interface, record:

- Required fields.
- Optional fields.
- Data types.
- Units.
- Geographic identifiers.
- Timestamp/period format.
- Missing-data behavior.
- Error behavior.

Do not invent these fields. Add them only after the team confirms the contract.

### Common rules for all interfaces

- Dates use an agreed, documented format (ISO 8601 unless the team specifies otherwise).
- Units are explicit in the payload or metadata; never inferred silently.
- Geographic identifiers are stable and traceable to verified boundaries.
- Missing values are represented explicitly (for example `null`, omitted, or a documented sentinel) and rendered as no-data.
- Zero is a real measurement and must never be used as a missing-data placeholder.
- Errors and partial responses have defined UI behavior.
- No API keys or secrets in the frontend.

### Confirmed demo files (v0.1)

- `data/meta.json` — `mode`, `contract_version`, `generated_at`, `dekads`, `thresholds`, `sources`, district/unit counts.
- `data/districts.geojson` — district features with `district_id`, `name_en`/`name_ur`/`name_ps`, `status`, `deficit_mm` and hectares.
- `data/ucs/<district_id>.geojson` — ADM3 tehsil features with `uc_id`, `uc_name_en`, `district_id` and hectares.
- `data/series/<unit_id>.json` — `dekads[]` of `{start, end, et_mm, rain_mm, deficit_mm, status}`, plus `sources` and `generated_at`.
- `data/validation.csv` — census-vs-atlas rows (census values still to be entered).

Field names, units, identifiers and missing-data behavior are authoritative in `docs/data-contract.md`. The production data delivery method (static files vs API) is still to be confirmed (Q-03/Q-04).

---

## 9. Quality and Deployment Checklist

This checklist covers the Phase 1 foundation. Only statically verifiable items are ticked; browser/interaction items remain unchecked and must be tested in a real browser before Phase 5 sign-off.

### Functionality

- [ ] Main Atlas page works.
- [ ] Geographic interactions work.
- [ ] Available dataset layers work.
- [ ] Available charts work.
- [ ] Methods and Data Sources page works.
- [ ] Navigation works.
- [ ] Language switching works.
- [ ] CSV exports work where supported.

**Status:** Not verified in a browser — the Atlas, Methods page, language switching and CSV export are implemented on `site/` but only statically/served-checked.

### Data integrity

- [ ] No fabricated values.
- [ ] No false zero values.
- [ ] Correct units.
- [ ] Correct source attribution.
- [ ] Correct geographic identifiers.
- [ ] Clear missing-data behavior.

**Status:** Not verified — the demo data layer (`data-service.js`) exists but has not been browser-audited. No production data.

### Responsive design

- [ ] Mobile layout verified.
- [ ] Tablet layout verified.
- [ ] Desktop layout verified.
- [ ] Urdu RTL verified.
- [ ] Pashto RTL verified.

**Status:** Not verified — the responsive foundation and RTL direction switching are implemented; browser checks at target widths and in Urdu/Pashto are outstanding.

### Accessibility

- [ ] Semantic HTML.
- [ ] Keyboard navigation.
- [ ] Visible focus.
- [ ] Color contrast.
- [ ] Accessible forms and controls.
- [ ] Non-color-only status indicators.

**Status:** Not verified — requires a browser/keyboard/contrast audit. Focus styles and `sr-only` utilities exist in `base.css`; semantic markup is partially in place.

### Performance

- [ ] Efficient map rendering.
- [ ] On-demand geographic data loading.
- [ ] Efficient chart rendering.
- [ ] Optimized assets.
- [ ] No unnecessary dependencies.

**Status:** Not verified — no performance measurement has been performed.

### Deployment

- [ ] GitHub Pages compatibility.
- [x] Correct relative paths.
- [x] Direct page loading.
- [x] Refresh behavior.
- [x] Static hosting compatibility.

**Status:** Relative paths, direct page loading and static hosting verified locally over `python -m http.server` (all `site/` assets and `data/` fetches returned 200). Live GitHub Pages deploy not yet exercised.

---

## 10. Instructions for Future OpenCode Sessions

1. Read the root `AGENTS.md` before starting any project task.
2. Understand the current architecture before changing code.
3. Check the progress tracker before choosing the next task.
4. Respect the five-phase roadmap.
5. Do not skip unfinished dependencies from earlier phases.
6. Do not redo completed work without a verified reason.
7. Preserve the design system and shared components.
8. Follow the actual data contract.
9. Never invent data or API endpoints.
10. Keep frontend and backend responsibilities separate.
11. Test changes before marking tasks complete.
12. Update `AGENTS.md` after meaningful implementation work.
13. Update only progress supported by verified evidence.
14. Record blockers and pending external dependencies.
15. Keep the document concise enough to remain maintainable, but detailed enough to guide future development.

Whenever a future task changes the project architecture, data requirements, scope, or implementation status, update the relevant section of `AGENTS.md`.

### Progress update protocol

When completing meaningful work:

1. Tick the relevant checkbox(es).
2. Recalculate that phase's percentage from verified tasks.
3. Recalculate overall progress.
4. Record any new blocker or dependency.
5. Update the next recommended action.
6. Append a change-log entry with date and short description.

### Editing rules for this document

- Update this file in place; do not create a competing project guide.
- Preserve still-valid decisions and project history.
- Revise outdated or contradictory statements instead of silently deleting them.
- Do not document planned functionality as completed.
- Do not invent repository files, APIs, contracts, or implementation details.
- Re-inspect the repository before claiming any status change.

---

## 11. Blockers and external dependencies register

| ID | Dependency | Needed by | Impact if missing | Owner | Status |
|---|---|---|---|---|---|
| D-01 | Admin removal of legacy prototype files | Phase 1 | Prevents a clean baseline and risks mixing prototype with Atlas | Project admin | Resolved — removed 2026-11-14 |
| D-02 | Confirmed frontend architecture and folder layout | Phase 1 | Rework and inconsistent modules | Frontend lead + team | Resolved — settled on the team's `site/` app; documented in section 4 |
| D-03 | Confirmed backend/data contract | Phase 1–3 | UI cannot bind to real data; risk of invented schemas | Backend/data lead | Partial — demo v0.1 exists (`docs/data-contract.md`); production pending |
| D-04 | Verified administrative boundaries for KP | Phase 2 | Atlas map cannot render real geography | Data lead | Open |
| D-05 | Dataset selection and KP-coverage verification | Phase 2–3 | Risk of unusable or misleading layers | Science/data leads | Open |
| D-06 | Metadata: periods, units, resolution, coverage, thresholds | Phase 2–4 | Risk of fabricated periods and classifications | Data/science leads | Open |
| D-07 | Confirmed indicator and time-series data | Phase 3 | Charts and statistics cannot show real values | Data lead | Open |
| D-08 | Validation reference data and approved statistics | Phase 4 | Validation section cannot show real comparisons | Science lead | Open |
| D-09 | Approved methodology, wording, and limitations | Phase 4 | Risk of inaccurate scientific claims | Science lead | Open |
| D-10 | Urdu and Pashto translation review | Phase 4 | Risk of poor or inconsistent translations | Translation reviewer | Open |
| D-11 | GitHub Pages/hosting confirmation | Phase 5 | Deployment path unverified | Team/deployment owner | Open |
| D-12 | Licensing and usage restrictions for selected datasets | Phase 2–4 | Possible legal or attribution problems | Data lead | Open |

Update a row to `Resolved` only when the real artifact has been received and inspected.

---

## 12. Open questions and decisions needed

| ID | Question | Needed by | Default if unanswered |
|---|---|---|---|
| Q-01 | Which candidate datasets are actually available and suitable for KP? | Phase 2 | Do not build layers; hold dataset-dependent work |
| Q-02 | What exact products, versions, periods, and resolutions are confirmed? | Phase 2–3 | Display nothing until verified metadata exists |
| Q-03 | Will the backend provide precomputed static files or a live API? | Phase 1 | Partially answered — demo ships static files under `data/`; production delivery method still pending |
| Q-04 | What is the final data contract and file/endpoint naming? | Phase 1–3 | Partially answered — `docs/data-contract.md` v0.1 covers the demo; production schema pending |
| Q-05 | Which administrative levels and boundary dataset are authoritative? | Phase 2 | Do not hardcode names, counts, or geometries |
| Q-06 | Which indicators, reporting periods, and units are in scope? | Phase 3 | Do not invent indicators or periods |
| Q-07 | What CSV exports are required and what should they contain? | Phase 3 | Match displayed data; confirm before release |
| Q-08 | Who approves methodology, limitations, thresholds, and validation statistics? | Phase 4 | Block publication of unapproved claims |
| Q-09 | Which font and asset strategy is approved for low bandwidth? | Phase 1 | Use a system font stack and lightweight assets |
| Q-10 | Where will the final site be hosted? | Phase 5 | Verify relative paths under a repository subpath |

---

## 13. Legacy work register (do not build on this)

The following existed in the repository or its history but belong to an earlier NASA/Fieldnotes prototype. They are not part of the KP Open Farm Atlas and were removed from the working tree on 2026-11-14 before the clean-slate build.

| Item | Current state | Decision |
|---|---|---|
| `index.html` | Legacy Fieldnotes/NASA prototype landing and dashboard (1,035 lines) | Removed 2026-11-14 (upstream PR #6, fork PR #1); do not reuse as Atlas foundation; no phase credit |
| `indexes.html` | Legacy dashboard copy | Removed 2026-11-14 (fork PR #1); no phase credit |
| `README.md` | Previously described the earlier NASA Earth observation prototype | Rewritten by the team for the Atlas (local preview, pipeline, deploy) |
| `feature/index-page` | Old landing-page branch | Deleted locally; disposable |
| `feature/unified-index` | Old merged-prototype branch and PR #3 | Deleted locally; disposable |
| Existing PRs and upstream history | Prototype work | Not part of the Atlas source of truth |

The legacy prototype files were removed on 2026-11-14 (legacy-removal PRs #1/#5/#6; #5 superseded by #6). The team's `site/` frontend, not the prototype, is the Atlas source of truth. Do not reintroduce prototype code as Atlas foundation.

---

## 14. Change log

| Date | Change | Author |
|---|---|---|
| 2026-11-14 | Created `AGENTS.md` after repository inspection. Recorded all phases as Not Started (0%) because no KP Open Farm Atlas implementation exists. Registered legacy prototype files and external dependencies. | OpenCode, on behalf of the frontend owner |
| 2026-11-14 | Updated `AGENTS.md` to the broader agricultural and environmental Atlas identity; replaced the water-balance-only framing and old phase roadmap; added the candidate dataset inventory, team responsibilities, verified-vs-planned architecture, permanent rule categories, expanded tracker evidence, integration contract, quality checklist, and 15 OpenCode session instructions. Progress remains 0% with all phases Not Started. | OpenCode, on behalf of the frontend owner |
| 2026-11-14 | Removed legacy prototype files `index.html` and `indexes.html` from the working tree; confirmed clean-slate baseline. Resolved dependency D-01, updated the repository-state table, legacy register, Phase 1 roadmap and tracker, and set Phase 1 to In Progress 7% and overall progress to 1%. | OpenCode, on behalf of the frontend owner |
| 2026-11-14 | Merged upstream `505b783` into `main` (`b5fcb5e`); confirmed the team's `site/` app, `data/` demo contract v0.1, `docs/data-contract.md`, `docs/methods.md`, `pipeline/make_snapshot.py`, `scripts/serve.sh`, and `deploy-pages.yml` as the real repository state. Resolved D-02; recorded the demo contract under D-03/Q-03/Q-04. Corrected the sub-district level to tehsil (geoBoundaries ADM3) and district count to 31. | OpenCode, on behalf of the frontend owner |
| 2026-11-14 | Phase 1 foundation implemented on branch `feature/phase-1-foundation`: split `site/css/style.css` into `tokens/base/layout/components/responsive`; extracted `site/js/config.js`, `utils.js`, `services/{state,i18n,data-service,csv,motion}.js` and `components/{legend,states}.js`; rewrote `app.js` as a page controller; vendored Anime.js 3.2.2 at `site/vendor/anime.min.js`; updated both HTML pages. Static verification passed (`node --check`, JSON parse, CSS brace balance, local HTTP smoke test). Phase 1 → 70%, overall → 14%. Browser responsive/RTL verification still pending. | OpenCode, on behalf of the frontend owner |

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **Atlas** | The KP Open Farm Atlas website and its interactive geographic experience |
| **Administrative area** | A province, district, tehsil, or equivalent official geographic unit |
| **Tehsil** | A sub-district administrative unit; in this project the geoBoundaries ADM3 level (labelled "union council (tehsil)" in the UI, but not a Union Council boundary) |
| **Aggregate** | A value summarizing an entire administrative area, not a single farm |
| **Dataset** | A confirmed source of observations or derived information used by the Atlas |
| **Product** | A specific version or collection within a dataset |
| **Indicator** | A derived or observed variable presented in the interface, with defined units |
| **Layer** | A mappable dataset or indicator shown on the Atlas map |
| **Reporting period** | The confirmed time interval represented by a value; may be a dekad or another period |
| **Dekad** | A ten-day period, if used by the confirmed dataset/metadata |
| **ET** | Evapotranspiration: water lost through evaporation and plant transpiration |
| **Soil moisture** | Water content in the soil column for the confirmed product and depth |
| **Spatial resolution** | The ground area represented by a data cell, as defined by the product |
| **Temporal resolution** | The time interval between observations, as defined by the product |
| **No data** | A measurement is unavailable; it must be shown as unavailable, never as zero |
| **Partial data** | Some requested values are present and others are unavailable; both must be represented honestly |
| **Validation** | Comparison against approved reference data using approved methodology |
| **Data contract** | The confirmed schema, fields, units, identifiers, and behavior supplied by the backend/data lead |
| **Adapter** | A frontend module translating the confirmed contract into UI-ready data |
| **i18n** | Internationalization: centralized English, Urdu, and Pashto strings |
| **RTL** | Right-to-left layout direction required for Urdu and Pashto |

---

## 16. Handover and maintenance notes

- Keep this file self-contained; do not create competing instruction files.
- When a phase changes status, update both section 6 and section 7 in the same edit.
- When a dependency resolves, update section 11 and the relevant phase tracker.
- When legacy files are removed, update section 13 and unblock Phase 1.
- Re-inspect the repository before claiming any status change.
- If the project direction changes, record the decision in the change log before implementing it.
- Keep the tracker evidence-based; when in doubt, mark “requires verification” instead of guessing.

**End of permanent project guide.**
