# Data sources

| Layer | Dataset | Resolution | Period used | Access | Licence |
|---|---|---|---|---|---|
| Cropland, winter cereals, maize, irrigation | ESA WorldCereal 2021 v100 (`ESA/WorldCereal/2021/MODELS/v100`) | 10 m | 2021 season | Google Earth Engine | CC BY 4.0 |
| Actual evapotranspiration (AETI) | FAO WaPOR v3, dekadal (`FAO/WAPOR/3/L2_AETI_D`, fallback L1) | 100 m (L2) / 300 m (L1) | last six dekads | Google Earth Engine | CC BY 4.0 |
| Rainfall | NASA POWER, daily `PRECTOTCORR` (MERRA-2, bias-corrected) | 0.5° × 0.625° | last 75 days | HTTPS API, no key | Public domain |
| Boundaries | geoBoundaries gbOpen, Pakistan ADM1/ADM2/ADM3, release `9469f09` | vector | ADM2 2019, ADM3 2017 | GitHub raw | Public domain / CC BY |
| Validation | Pakistan Agricultural Census 2024, KP district tables | district | 2024 | PBS PDF, typed by hand | PBS terms |

## Notes and known weaknesses
- **WorldCereal** is a 2021 product. Cropland extent changes slowly but field-level crop type does not; we present it as "what grew in 2021", never "what grows now". It under-detects terraced and very small plots (Dir, Chitral, Kohistan).
- **WaPOR** L2 coverage of mountain KP is incomplete; the pipeline falls back to L1 for consistency if L2 is missing. Dekads publish about a week after they close.
- **NASA POWER** is a half-degree reanalysis product. It captures regional rain events well and local convective cells poorly. It is used because it is free, keyless and daily; a CHIRPS or IMERG swap is a one-function change in `fetch_power.py`.
- **geoBoundaries ADM3** for Pakistan is tehsils, not union councils, and ADM2 predates the 2018 to 2019 district splits (31 districts, not 35). GADM 4.1 level 3 was unreachable from the build network; swapping it in is `pipeline/prepare_boundaries.py` only.
- **Tehsil-to-district assignment** uses polygon centroids across two sources from different years; a handful of tehsils (for example Hangu tehsil, FR Bannu) land in a neighbouring district. Listed in `pipeline/uc_ids.csv`; fixable by hand there.
