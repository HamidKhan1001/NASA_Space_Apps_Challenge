# KP Open Farm Atlas

The first public map of **what grows where in Khyber Pakhtunkhwa, which land is irrigated, and whether each union council's crops got enough water in the last ten days.** Built from free satellite data for the 2026 NASA Space Apps Challenge (Peshawar). It updates itself every Monday.

**Live site:** _GitHub Pages URL goes here after the first deploy (Settings → Pages → Source: GitHub Actions)._

![Validate data](https://github.com/HamidKhan1001/NASA_Space_Apps_Challenge/actions/workflows/validate-data.yml/badge.svg) ![Update data](https://github.com/HamidKhan1001/NASA_Space_Apps_Challenge/actions/workflows/update-data.yml/badge.svg)

## What it shows
1. **Province:** 31 districts coloured green, amber or red by water balance for the latest dekad (ten days). Six dekads to choose from. English, Urdu, Pashto.
2. **District:** its union councils (tehsils in v0.1), coloured by status, or shaded by hectares of cropland, winter cereals, maize or irrigated area.
3. **Union council:** hectares, the deficit in millimetres, a six-dekad chart of crop water use against rainfall, CSV and GeoJSON download, sources and dates.
4. **Methods and validation:** what each dataset is, how the traffic light is computed, and our cropped-area numbers against the 2024 Agricultural Census, including where they disagree.

Deficit = actual evapotranspiration (FAO WaPOR v3) − rainfall (NASA POWER), on irrigated winter-cereal land (ESA WorldCereal 2021). Green ≤ 0 mm, amber ≤ 30 mm, red > 30 mm. The reasoning is in [docs/thresholds.md](docs/thresholds.md).

## What it does not claim
It says "this union council, as a whole, lost more water than it received in the last ten days". It does not say "your farm is dry", it does not forecast, and it does not estimate yield. One satellite pixel holds several 2-acre farms.

## Repository layout
```
site/       static website: index.html, methods.html, strings.json, css/, js/   (Person 2)
data/       the data contract: meta.json, districts.geojson, ucs/, series/, validation.csv   (pipeline + Action)
pipeline/   Python + Earth Engine scripts that produce /data   (Persons 1 and 3)
docs/       methods, thresholds, sources, data contract   (Person 4)
pitch/      storyboard, checklist, Q&A   (Person 5)
.github/    weekly data update, contract validation, Pages deploy
```

## Run it locally
```
pip install -r pipeline/requirements.txt
python3 pipeline/prepare_boundaries.py
python3 pipeline/fetch_power.py --days 75          # NASA POWER, about 150 calls, cached
python3 pipeline/build_series.py                   # adds WaPOR ET when EE_SERVICE_ACCOUNT_KEY is set
python3 pipeline/validate_data.py
./scripts/serve.sh                                 # http://localhost:8000
```
Without Earth Engine credentials and `pipeline/worldcereal_stats.csv`, evapotranspiration and hectares are clearly flagged placeholders and the site shows a **DEMO DATA** badge. Rainfall and boundaries are real from the first run. See [pipeline/README.md](pipeline/README.md).

## Deploy
Push to `main`. `deploy-pages.yml` stages `site/` with `data/` and `docs/` and publishes to GitHub Pages. `update-data.yml` re-runs the pipeline every Monday 03:00 UTC (or on demand) and commits `data: dekad YYYY-MM-DD`.

## Data sources and licences
ESA WorldCereal 2021 (CC BY 4.0) · FAO WaPOR v3 (CC BY 4.0) · NASA POWER (public domain) · geoBoundaries (public domain / CC BY). Details and known weaknesses in [docs/sources.md](docs/sources.md). Code is MIT; data files carry attribution to ESA, FAO and NASA.

## Honesty rules
No screen says farm, forecast, predict, warning, drought or shortage. Every panel shows its sources and generation time. Placeholder values are labelled as such. A bad validation result is shown, not hidden.

## Contributing
Five first issues are listed in [CONTRIBUTING.md](CONTRIBUTING.md). Start with the data contract in [docs/data-contract.md](docs/data-contract.md).
