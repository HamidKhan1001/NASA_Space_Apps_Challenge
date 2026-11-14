# Contributing

The weekend was the beginning. The weekly Action keeps the map alive; these are the first things worth doing next. Each is meant to be a self-contained GitHub issue.

## Five first issues
1. **Real union-council boundaries.** v0.1 uses geoBoundaries tehsils (122 units, 2017) and 2019 districts (31, not 35). Swap in GADM 4.1 level 3 or a PBS UC layer in `pipeline/prepare_boundaries.py`; keep `pipeline/uc_ids.csv` append-only so existing links keep working.
2. **Update the crop map from WorldCereal 2021 to the current season.** Sentinel-2 NDVI time series in Earth Engine, Rabi 2025-26, winter cereals only. A final-year project. Output: a new `worldcereal_stats.csv` plus a methods paragraph.
3. **Pashto crop calendar per district.** So the panel says "wheat at tillering" rather than only a number. One JSON file keyed by `district_id` and dekad; render it in the UC panel.
4. **SMS or WhatsApp digest.** Every Monday after the Action, one line per red unit to registered extension officers. The data contract already has everything needed; design the hook in `pipeline/notify.py`, gateway (Twilio or a local provider) behind an environment variable.
5. **Calibrate thresholds against IWMI soil-moisture sensors** in Charsadda and Mansehra. Compare the deficit class with measured root-zone moisture for the same dekads; adjust `pipeline/thresholds.json` and document the result in `docs/thresholds.md`.

## Also welcome
- Extend to Gilgit-Baltistan or Balochistan: change the province filter in `prepare_boundaries.py`, add codes to `district_codes.csv`.
- Kharif season (maize, rice, sugarcane) with its own thresholds.
- Raster tiles so the officer sees actual fields, not just polygons.
- NDVI anomaly per district (MODIS MOD13Q1, current vs 2015-2024 mean).
- Native-speaker review of `site/strings.json` (Urdu, Pashto).

## Working rules
- `data/` is written only by the pipeline and the Action. Change the pipeline, not the files.
- Never hard-code thresholds in the site; they come from `data/meta.json`.
- Run `python3 pipeline/validate_data.py` before pushing. CI runs it too.
- Every number on screen must have a source and a date next to it.
- No word on any screen says farm, forecast, predict, warning, drought or shortage.
- Never commit Earth Engine keys. Repository secret `EE_SERVICE_ACCOUNT_KEY` only.
