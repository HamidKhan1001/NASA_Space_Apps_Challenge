# Data contract (v0.1)

The `/data` folder is the only interface between the pipeline and the website. Agreed at hour 0; do not change shapes without a version bump in `meta.json.contract_version`.

Rules
- Areas in hectares, water in millimetres, dates ISO `YYYY-MM-DD`, timestamps ISO UTC with `Z`.
- `status` is exactly one of `green`, `amber`, `red`, `nodata`.
- Thresholds live only in `meta.json`; the site reads them and never hard-codes them.
- Every file carries `generated_at`; the site shows it in the footer and in every panel.
- IDs are stable strings (`PK.KP.CHA`, `PK.KP.CHA.TANGI`), never row numbers. The map from source shape IDs to our IDs is `pipeline/uc_ids.csv`; append to it, never rewrite it.
- `pipeline/validate_data.py` enforces all of this on every push.

## `data/meta.json`
```json
{
  "generated_at": "2026-11-14T12:00:00Z",
  "mode": "demo | live",
  "latest_dekad": {"start": "2026-11-01", "end": "2026-11-10"},
  "dekads": [{"start": "...", "end": "..."}],           // six, oldest first
  "thresholds": {"green": {"max_deficit_mm": 0}, "amber": {"max_deficit_mm": 30}, "red": {}, "nodata": {}},
  "sources": {"et": {...}, "rain": {...}, "crops": {...}, "boundaries": {...}},   // each with name, dataset, status: live|synthetic, licence
  "counts": {"districts": 31, "level3_units": 122, "district_status": {"green": 0, "amber": 0, "red": 0, "nodata": 0}},
  "contract_version": "0.1"
}
```
`mode` is `demo` whenever any source is `synthetic`; the site then shows a DEMO badge.

## `data/districts.geojson`
FeatureCollection, one feature per district. Properties:
```json
{"district_id": "PK.KP.CHA", "name_en": "Charsadda", "name_ur": "چارسدہ", "name_ps": "چارسده",
 "crop_ha": 61240, "wheat_ha": 38900, "maize_ha": 21100, "irrigated_ha": 55300,
 "status": "red", "deficit_mm": 25.4, "et_mm": 28.4, "rain_mm": 3.0, "centroid": [71.73, 34.15], "uc_count": 3}
```
Numbers may be `null` when a source is missing; `status` is then `nodata`. Under 300 KB.

## `data/ucs/<district_id>.geojson`
Same properties as a district feature plus `uc_id`, `uc_name_en`, `district_id`. One file per district so the site loads only what is clicked.

## `data/series/<id>.json`
One per union council **and** one per district (`id` = `uc_id` or `district_id`).
```json
{"uc_id": "PK.KP.CHA.TANGI", "name_en": "Tangi", "district_id": "PK.KP.CHA",
 "dekads": [{"start": "2026-09-11", "end": "2026-09-20", "et_mm": 31.2, "rain_mm": 8.0, "deficit_mm": 23.2, "status": "amber"}],
 "hectares": {"crop_ha": 0, "wheat_ha": 0, "maize_ha": 0, "irrigated_ha": 0},
 "sources": {"et": "...", "rain": "...", "crops": "..."},
 "source_status": {"et": "live|synthetic", "rain": "live|missing", "crops": "live|synthetic"},
 "generated_at": "2026-11-14T12:00:00Z"}
```

## `data/validation.csv`
`district, district_id, census_crop_ha, atlas_crop_ha, census_wheat_ha, atlas_wheat_ha`. Census columns are blank until Person 4 fills `pipeline/census_2024.csv`.

## Known deviations in v0.1
- Level-3 units are **tehsils** (geoBoundaries ADM3, 2017), not union councils. Keys are kept as `uc_*` so the site does not change when UC polygons arrive.
- 31 districts (2019 boundaries), not 35. Chitral, Kohistan and Torghar splits are not represented.
