# Methods and validation

The KP Open Farm Atlas answers one question for every union council (tehsil) in Khyber Pakhtunkhwa: **over the last ten days, did the crops lose more water than they received?** It also shows how much land is cropped, how much of it is winter cereals or maize, and how much is irrigated.

It is a public, static website. The numbers are recomputed every Monday by a GitHub Action and committed to the repository, so every value on the map can be traced to a file, a date and a source.

## What each dataset is

**ESA WorldCereal 2021** is a global 10 m crop map produced by ESA from Sentinel-1 and Sentinel-2. We use four of its products: temporary crops (annual cropland), winter cereals, maize, and active irrigation. It describes the 2021 season. Cropland extent is stable over a few years; crop type is not, so the atlas says "winter cereals in 2021", not "wheat this year". WorldCereal is known to under-detect terraced and very small fields, which matters in Dir, Chitral and Kohistan.

**FAO WaPOR v3** provides actual evapotranspiration and interception (AETI) every ten days at 100 m (Level 2) and 300 m (Level 1), derived from satellite thermal and optical data with a surface-energy-balance model. It is the water the crop and soil actually lost, including irrigation that was applied. Irrigation therefore raises ET; it does not hide it.

**NASA POWER** provides daily bias-corrected precipitation (PRECTOTCORR) from the MERRA-2 reanalysis on a half-degree grid. We sum the daily values into the same dekads as WaPOR at each unit's centroid. It is coarse, but free, keyless and updated within a few days.

**geoBoundaries** supplies the district (ADM2) and tehsil (ADM3) polygons, simplified for fast loading on a phone.

## How the traffic light is computed

For each unit and each dekad:

```
deficit_mm = ET_mm (WaPOR, unit mean) − rain_mm (POWER, dekad sum)
```

| Class | Rule |
|---|---|
| green | deficit ≤ 0 mm: rain covered crop water use |
| amber | 0 < deficit ≤ 30 mm: one irrigation turn covers it |
| red | deficit > 30 mm: stress likely if canal water is late |
| nodata | no irrigated winter cereals mapped, or a source was missing |

The 30 mm boundary comes from wheat water use in the Peshawar valley in November to December (3 to 4 mm/day, so 30 to 40 mm per dekad) and from what one canal irrigation turn delivers to the root zone (about 30 mm). The reasoning is in `docs/thresholds.md`; the values are stored once in `data/meta.json` and the website reads them from there.

## What this cannot tell you

- **Nothing about a single farm.** One ET pixel covers several 2-acre farms. The atlas says "this union council, as a whole, lost more water than it received". It never says "your field is dry".
- **Nothing about the future.** Every number is the last ten days. There is no forecast.
- **Nothing about yield, food security, groundwater or salinity.** Those are phase-2 and phase-3 layers listed in CONTRIBUTING.
- **Crop type is from 2021.** Fields that switched between wheat and another crop since then are misclassified.
- **Rainfall is a half-degree reanalysis.** Local storms can be missed or smeared across neighbouring units.

## Validation

We compare our per-district cropped area and winter-cereal area against the district tables of the **2024 Agricultural Census** (Pakistan Bureau of Statistics). The scatter below shows census on the x-axis, atlas on the y-axis, one dot per district, with the 1:1 line and the Pearson correlation. The three districts with the largest disagreement are named. We expect mountain districts to disagree most, because WorldCereal struggles with terraces and small plots, and we say so rather than hide it.

Census figures are reported per season in acres; we convert to hectares (× 0.4047) and compare Rabi cropped area with WorldCereal winter cereals, which is the like-for-like pair.

## Reproducing the numbers

```
pip install -r pipeline/requirements.txt
python3 pipeline/prepare_boundaries.py     # boundaries from geoBoundaries
python3 pipeline/fetch_power.py            # NASA POWER rainfall, cached to disk
python3 pipeline/build_series.py           # WaPOR via Earth Engine if available, then /data
python3 pipeline/validate_data.py          # contract check
```

Hectares come from `pipeline/worldcereal_stats.js`, run once in the Earth Engine Code Editor, exported to `pipeline/worldcereal_stats.csv`. Until that file and Earth Engine credentials are present, the pipeline writes clearly flagged placeholder values and the site shows a DEMO badge.
