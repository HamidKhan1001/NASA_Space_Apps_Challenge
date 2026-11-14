# Storyboard: eight slides, four minutes

One-sentence pitch: *Developed countries have public maps of what grows where and whether it is getting enough water. Pakistan has none. We built KP's first one from free satellite data, and it updates itself every week.*

Unit: union council, never farm. Period: last ten days, never forecast.

| # | Slide | Speaker note | Time |
|---|---|---|---|
| 1 | Imran in Charsadda | Field assistant, nine union councils, 40,000 farms, one motorbike. Today he picks his route by whoever called last. | 0:00 |
| 2 | The numbers | 4.17 M farms in Pakistan; over 50 % canal losses; crop statistics arrive years late; 2.86 M people at IPC 3+ in KP. | 0:30 |
| 3 | Abroad vs here | USDA Cropland Data Layer, OpenET: public, weekly. Pakistan: nothing public at this level. | 0:50 |
| 4 | What we built | One screenshot: KP coloured by water balance. | 1:00 |
| 5 | Live demo | Click Charsadda → red units → one UC: "28 mm used, 3 mm received, 25 mm short, 6,400 ha of winter cereals under that signal, three dekads in a row." Chart. CSV. | 1:10 |
| 6 | Validation, honest | Census 2024 vs atlas scatter. Where it agrees; Dir and Chitral where terraces defeat the satellite, and we say so. | 2:15 |
| 7 | It updates itself | GitHub Action every Monday. Data contract. Five open issues for the next person. IWMI is placing sensors; this tells them where. | 3:00 |
| 8 | What we claim | "Union council, not farm. Last ten days, not forecast. That is what the data supports." Phase 2: current-season crops, SMS digest, GB and Balochistan. | 3:30 |

## Skeptical-judge Q&A
- **Why not farm level?** One ET pixel is 100 to 300 m; a farm here is 2 acres. We refuse to claim what the pixel cannot see.
- **Is WorldCereal 2021 not stale?** Cropland extent is stable; crop type is not, and we label it 2021. Updating it is issue #2.
- **How good is half-degree rainfall?** Good for regional events, poor for local storms. It is free, daily and keyless; swapping to CHIRPS or IMERG is one function.
- **Who uses it?** Extension officers (route), IWMI (sensor placement), UAP researchers (district CSV), journalists (numbers behind a story), P&D (first map of irrigated area).
- **What breaks it?** WaPOR gaps over mountains (we fall back to L1), boundary vintages (we document the 31 vs 35 district issue), Earth Engine quota (statistics only, 100 m).
