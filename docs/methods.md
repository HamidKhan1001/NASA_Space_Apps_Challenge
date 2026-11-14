# Methods and validation

The KP Open Farm Atlas answers one question for every union council in Khyber Pakhtunkhwa: **over the last ten days, did the crops get as much water as they needed?** It also shows how much land in each unit is cropped.

It is a public, static website. Every number is recomputed each week by a scheduled job and committed to the repository, so any value on the map can be traced back to a file, a date and a source. Nothing on the map is estimated by hand: when a source is not connected, the field is shown as unavailable rather than filled in.

## What each dataset is

**NASA POWER** supplies the weather. For every unit centroid we request daily bias-corrected precipitation (`PRECTOTCORR`) together with maximum and minimum temperature, relative humidity, wind speed, downward shortwave radiation and surface pressure, from the MERRA-2 reanalysis on a 0.5° by 0.625° grid. It is free, needs no key, and updates within a few days. Being a reanalysis, it represents regional weather well and single local storms poorly.

**Water demand** is computed from those same NASA variables with the FAO-56 Penman-Monteith equation for reference evapotranspiration, the international standard for crop water requirements (Allen and others, FAO Irrigation and Drainage Paper 56, 1998). It is the depth of water a short, well-watered reference crop would use in the period. For Peshawar in November this comes to roughly 2.2 mm per day, and in June to roughly 7 mm per day, which matches the published agronomy for the valley.

**FAO WaPOR v3** provides actual evapotranspiration measured from space, every ten days at 100 m or 300 m. It is the better input because it reflects the water a real crop lost, including irrigation that was applied. The pipeline uses it automatically whenever Earth Engine credentials are present, and falls back to the FAO-56 calculation otherwise. Each generated file records which of the two produced it, and the site shows this on every panel.

**ESA WorldCover 2021** gives the cropland mask: a global 10 m land-cover map built from Sentinel-1 and Sentinel-2, of which we use class 40, cropland. It is read directly from the public cloud-optimised rasters at about 75 m, which keeps the area error for units of this size to a couple of percent.

**ESA WorldCereal 2021** would separate winter cereals, maize and irrigated land. It is distributed through Google Earth Engine, so it needs credentials this public build does not have. Those three figures are therefore reported as not connected, and the water-balance signal is computed over all mapped cropland instead of over irrigated winter cereals alone.

**geoBoundaries** supplies the boundaries, simplified for fast loading on a phone.

## How the traffic light is computed

For each unit and each ten-day period:

```
deficit_mm = water needed (mm) − rainfall (mm)
```

| Class | Rule |
|---|---|
| green | deficit of 0 mm or less: rain covered what the crops needed |
| amber | deficit of 1 to 30 mm: one irrigation turn covers it |
| red | deficit above 30 mm: more than one irrigation turn is missing |
| nodata | no cropland mapped, or a source missing for the period |

The 30 mm boundary comes from the irrigation practice of the region rather than from the satellite: a canal turn here applies roughly 75 mm at the outlet, of which about 30 mm reaches the root zone at typical field efficiency. The threshold values live in `data/meta.json` and the website reads them from there, so changing the rule never means changing the site. The reasoning is set out in `docs/thresholds.md`.

## What this cannot tell you

- **Nothing about a single farm.** One weather or evapotranspiration pixel covers several two-acre farms. The Atlas says "this union council, as a whole, needed more water than it received". It never says "your field is dry".
- **Nothing about the future.** Every number describes the last ten days. There is no forecast.
- **Nothing about yield, food security, groundwater or soil salinity.**
- **Crop extent is from 2021.** Land that has come into or gone out of cultivation since then is described by the 2021 map.
- **Rainfall is a coarse reanalysis.** A convective storm over one union council can be smoothed across its neighbours.

## Validation

We compare the per-district cropland area against the district tables of the Agricultural Census. The chart below puts the census on the horizontal axis and this atlas on the vertical, one dot per district, with the 1:1 line and the Pearson correlation, and names the three districts that disagree most.

The province total from ESA WorldCover is about 1.38 million hectares of cropland against a published cropped area in the region of 1.6 to 1.9 million hectares. The gap is expected and is itself informative: the satellite under-detects terraced and very small plots, which is why Kohistan and Shangla come out near zero percent cropped while Dera Ismail Khan and Swabi come out near half. Those are the districts to treat with caution, and they are named rather than hidden.

The census column is typed by hand from the published tables into `pipeline/census_2024.csv`; the chart appears as soon as at least three districts are filled in.

## Reproducing the numbers

```
pip install -r pipeline/requirements.txt
python3 pipeline/prepare_boundaries.py     # boundaries from geoBoundaries
python3 pipeline/fetch_power.py --days 80  # NASA POWER weather, cached on disk
python3 pipeline/worldcover_stats.py       # cropland hectares from ESA WorldCover
python3 pipeline/build_series.py           # water balance and every /data file
python3 pipeline/validate_data.py          # contract check
```

Only the crop-type statistics need an account: run `pipeline/worldcereal_stats.js` once in the Earth Engine Code Editor, save the export as `pipeline/worldcereal_stats.csv`, and the winter cereals, maize and irrigated columns light up by themselves on the next build.
