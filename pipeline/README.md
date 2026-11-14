# Pipeline

Turns three satellite datasets plus boundaries into the files described in `docs/data-contract.md`. Pure Python 3.11+, one third-party dependency (`requests`); `earthengine-api` is optional and only needed for live WaPOR evapotranspiration.

```
pip install -r pipeline/requirements.txt
python3 pipeline/prepare_boundaries.py      # 1. KP districts + tehsils from geoBoundaries  -> cache/boundaries
python3 pipeline/fetch_power.py --days 75   # 2. NASA POWER daily rain per centroid         -> cache/power (disk cache, resumable)
python3 pipeline/build_series.py            # 3. ET + rain + hectares -> ../data (series, geojson, meta, validation)
python3 pipeline/validate_data.py           # 4. contract check (also runs in CI)
```

| File | Owner | Purpose |
|---|---|---|
| `prepare_boundaries.py` | P1 | Download geoBoundaries, filter KP, assign tehsils to districts, stable IDs (`uc_ids.csv`) |
| `fetch_power.py` | P3 | NASA POWER `PRECTOTCORR`, one call per centroid, retries, cache |
| `build_series.py` | P1/P3 | Dekads, deficit, status, all output files; WaPOR through Earth Engine when credentials exist |
| `validate_data.py` | P3 | Fails CI on any contract violation |
| `worldcereal_stats.js` | P1 | Earth Engine Code Editor script; export → `worldcereal_stats.csv` (id, crop_ha, wheat_ha, maize_ha, irrigated_ha) |
| `thresholds.json` | P4 | Traffic-light rule; copied into `data/meta.json` |
| `census_2024.csv` | P4 | Type district rows from Census Table 4 here (hectares) |
| `district_codes.csv` | P1/P4 | Stable district IDs and Urdu/Pashto names |
| `geo.py`, `dekads.py` | – | Dependency-free helpers |

## Earth Engine (headless)
1. In the `kp-farm-atlas` Cloud project: IAM → Service accounts → create → grant *Earth Engine Resource Viewer* → create JSON key.
2. Register the service account for Earth Engine at code.earthengine.google.com/register (the project must be registered).
3. Put the JSON **text** in the repository secret `EE_SERVICE_ACCOUNT_KEY`. Never commit the file (`.gitignore` blocks `*service-account*.json`).
4. Locally: `export EE_SERVICE_ACCOUNT_KEY="$(cat key.json)"` then run `build_series.py`. Without it, `build_series.py` writes flagged placeholder ET and `meta.mode = "demo"`.

## Replacing the boundaries with real union councils
`prepare_boundaries.py` only needs a GeoJSON with one feature per UC and a district name. Point `fetch()` at GADM 4.1 level 3 (or a PBS UC shapefile converted with mapshaper), keep the `district_codes.csv` names in sync, and re-run. `uc_ids.csv` keeps old IDs stable and appends new ones.

## Traps
- `reduceRegions` at 10 m over whole districts times out; stay at 100 m for statistics.
- POWER is mm/day; WaPOR AETI-D is mm/dekad after the 0.1 scale factor. `build_series.py` sums POWER over the dekad before subtracting.
- POWER lags about three days. `dekads.last_complete_dekads(lag_days=3)` keeps the newest dekad complete.
