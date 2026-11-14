# Traffic-light thresholds

Owner: Person 4. Values live in `pipeline/thresholds.json` and are copied to `data/meta.json`. The website reads them from there.

## The quantity
For each unit and each dekad (10-day period):

    deficit_mm = ET_mm − rain_mm

- **ET** is actual evapotranspiration and interception from FAO WaPOR v3 (AETI, dekadal), averaged over the unit. It is what the crops and soil actually lost to the atmosphere, not a reference demand.
- **rain** is NASA POWER bias-corrected precipitation (PRECTOTCORR) summed over the dekad at the unit centroid.
- The signal is only meaningful where there are irrigated winter cereals (ESA WorldCereal 2021). Units with zero irrigated winter-cereal hectares are `nodata`.

## The classes
| Class | Rule | Reading |
|---|---|---|
| green | deficit ≤ 0 mm | Rain alone covered what the crop used. |
| amber | 0 < deficit ≤ 30 mm | One canal irrigation turn covers the gap. |
| red | deficit > 30 mm | Stress likely if canal water is late. |
| nodata | no irrigated winter cereals, or ET/rain missing | Not computed. |

## Why 30 mm
- Rabi wheat in the Peshawar valley uses about 3 to 4 mm/day in November and December, so 30 to 40 mm per dekad. One dekad with no rain and no irrigation therefore produces a deficit at or just above 30 mm.
- A canal irrigation turn in the Doaba and Warsak commands applies roughly 75 mm at the outlet; at 40 % field efficiency about 30 mm reaches the root zone. A deficit under 30 mm is one turn away from balance; a deficit above it means a missed turn.
- The boundary is deliberately simple. It will be calibrated against IWMI's soil-moisture sensors in Charsadda and Mansehra in phase 2 (see CONTRIBUTING).

## What the classes are not
- Not a drought index, not a forecast, not a yield estimate.
- Not a farm-level statement. One WaPOR pixel (100 to 300 m) covers several 2-acre farms. The class describes the unit as a whole.
- Not corrected for irrigation actually applied: irrigation water shows up in ET, which makes irrigated units look *better*, not worse. A red irrigated unit is therefore a strong signal.
