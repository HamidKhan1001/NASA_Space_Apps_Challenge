#!/usr/bin/env python3
"""Step 3: assemble the /data contract files.

  python3 build_series.py [--today YYYY-MM-DD] [--out ../data]

Inputs
  cache/boundaries/*            from prepare_boundaries.py (run automatically if missing)
  cache/power/<id>.json         from fetch_power.py (daily rain, mm/day)
  worldcereal_stats.csv         hectares per unit from Earth Engine (optional; see worldcereal_stats.js)
  thresholds.json               the traffic-light rule (Person 4)
  census_2024.csv               district rows typed from the 2024 Agricultural Census (Person 4)
  Earth Engine                  FAO WaPOR v3 AETI dekadal, if `earthengine-api` is installed and
                                EE_SERVICE_ACCOUNT_KEY (JSON text) or a local EE login is available

Outputs (the data contract; see docs/data-contract.md)
  data/meta.json, data/districts.geojson, data/ucs/<district_id>.geojson,
  data/series/<id>.json (one per UC and per district), data/validation.csv

Every source reports its status in meta.json ("live" or "synthetic"). When any
source is synthetic the mode is "demo" and the website shows a DEMO badge. The
synthetic numbers exist only so the website can be built and tested before the
real ones land; they are seeded from the unit id so they are stable run to run.
"""
import argparse
import csv
import hashlib
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone

from dekads import last_complete_dekads
from geo import area_ha, centroid

HERE = os.path.dirname(os.path.abspath(__file__))
BND = os.path.join(HERE, "cache", "boundaries")
POWER = os.path.join(HERE, "cache", "power")

ROUND_MM = 1


# ----------------------------------------------------------------------------- helpers
def h01(key, salt=""):
    """Deterministic pseudo-random float in [0,1) from a string."""
    return int(hashlib.sha1(f"{salt}:{key}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dump_json(path, obj, compact=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        if compact:
            json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(obj, fh, ensure_ascii=False, indent=1)
            fh.write("\n")


def classify(deficit, irrigated_ha, thr):
    if deficit is None or irrigated_ha is None or irrigated_ha <= 0:
        return "nodata"
    if deficit <= thr["green"]["max_deficit_mm"]:
        return "green"
    if deficit <= thr["amber"]["max_deficit_mm"]:
        return "amber"
    return "red"


# ----------------------------------------------------------------------------- rain (NASA POWER)
def rain_by_dekad(unit_id, dekads, max_missing=2):
    path = os.path.join(POWER, f"{unit_id}.json")
    if not os.path.exists(path):
        return [None] * len(dekads), "missing"
    daily = load_json(path)["daily"]
    out = []
    for start, end in dekads:
        total, missing, d = 0.0, 0, start
        while d <= end:
            v = daily.get(d.strftime("%Y%m%d"))
            if v is None:
                missing += 1
            else:
                total += v
            d += timedelta(days=1)
        out.append(None if missing > max_missing else round(total, ROUND_MM))
    return out, "live"


# ----------------------------------------------------------------------------- ET (FAO WaPOR via Earth Engine)
def et_wapor(features, dekads):
    """Return ({id: [mm per dekad]}, dataset_name) or (None, reason) if EE is unavailable."""
    try:
        import ee  # noqa: WPS433
    except ImportError:
        return None, "earthengine-api not installed"
    try:
        key = os.environ.get("EE_SERVICE_ACCOUNT_KEY")
        project = os.environ.get("EE_PROJECT", "kp-farm-atlas")
        if key:
            info = json.loads(key)
            creds = ee.ServiceAccountCredentials(info["client_email"], key_data=key)
            ee.Initialize(creds, project=project)
        else:
            ee.Initialize(project=project)
    except Exception as exc:  # noqa: BLE001
        return None, f"Earth Engine init failed: {exc}"

    fc = ee.FeatureCollection([
        ee.Feature(ee.Geometry(f["geometry"]), {"uid": f["properties"].get("uc_id") or f["properties"]["district_id"]})
        for f in features
    ])
    results = {f["properties"].get("uc_id") or f["properties"]["district_id"]: [] for f in features}
    dataset = None
    for level, scale in (("L2", 100), ("L1", 300)):
        name = f"FAO/WAPOR/3/{level}_AETI_D"
        try:
            col = ee.ImageCollection(name)
            col.first().getInfo()
            dataset, use_scale = name, scale
            break
        except Exception:  # noqa: BLE001
            continue
    if dataset is None:
        return None, "WaPOR collections not reachable"

    col = ee.ImageCollection(dataset)
    for start, end in dekads:
        img = col.filterDate(start.isoformat(), (end + timedelta(days=1)).isoformat()).mosaic()
        band = img.bandNames().get(0)
        stats = img.select([band]).multiply(0.1).reduceRegions(
            collection=fc, reducer=ee.Reducer.mean(), scale=use_scale).getInfo()
        got = {f["properties"]["uid"]: f["properties"].get("mean") for f in stats["features"]}
        for uid in results:
            v = got.get(uid)
            results[uid].append(None if v is None else round(float(v), ROUND_MM))
    return results, dataset


def et_synthetic(unit_id, lat, dekads):
    """Seasonal placeholder crop water use (mm/dekad) so the site can be built before WaPOR lands."""
    daily_by_month = {1: 2.0, 2: 2.8, 3: 4.0, 4: 5.0, 5: 6.0, 6: 6.5, 7: 5.5, 8: 5.0, 9: 4.5, 10: 3.5, 11: 2.8, 12: 2.0}
    factor = 0.85 + 0.3 * h01(unit_id, "et")
    cool = max(0.6, 1 - 0.04 * max(0.0, lat - 34.0))  # mountains to the north use less
    out = []
    for start, end in dekads:
        days = (end - start).days + 1
        out.append(round(daily_by_month[start.month] * days * factor * cool, ROUND_MM))
    return out


# ----------------------------------------------------------------------------- crop areas (WorldCereal)
def load_worldcereal():
    path = os.path.join(HERE, "worldcereal_stats.csv")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        rows = {r["id"]: r for r in csv.DictReader(fh)}
    return {k: {c: int(round(float(v[c]))) for c in ("crop_ha", "wheat_ha", "maize_ha", "irrigated_ha")} for k, v in rows.items()}


def crops_synthetic(unit_id, geom, lat):
    total = area_ha(geom)
    mountain = max(0.0, min(1.0, (lat - 34.3) / 1.6))  # 0 in the valley, 1 far north
    crop_frac = (0.45 - 0.38 * mountain) * (0.8 + 0.4 * h01(unit_id, "crop"))
    crop = total * max(0.02, crop_frac)
    wheat = crop * (0.55 + 0.15 * h01(unit_id, "wheat"))
    maize = crop * (0.25 + 0.15 * h01(unit_id, "maize"))
    irrigated = crop * (0.85 - 0.6 * mountain) * (0.8 + 0.3 * h01(unit_id, "irr"))
    return {"crop_ha": int(crop), "wheat_ha": int(wheat), "maize_ha": int(maize), "irrigated_ha": int(max(0, irrigated))}


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", default=None)
    ap.add_argument("--out", default=os.path.join(HERE, "..", "data"))
    ap.add_argument("--no-ee", action="store_true", help="skip Earth Engine even if available")
    args = ap.parse_args()
    today = date.fromisoformat(args.today) if args.today else date.today()
    out = os.path.abspath(args.out)

    if not os.path.exists(os.path.join(BND, "districts.geojson")):
        subprocess.check_call([sys.executable, os.path.join(HERE, "prepare_boundaries.py")])
    thr = load_json(os.path.join(HERE, "thresholds.json"))
    dekads = last_complete_dekads(today, n=6, lag_days=3)
    print("dekads:", [f"{s}..{e}" for s, e in dekads])

    districts = load_json(os.path.join(BND, "districts.geojson"))["features"]
    ucs = {d["properties"]["district_id"]: load_json(os.path.join(BND, "ucs", f"{d['properties']['district_id']}.geojson"))["features"]
           for d in districts}
    all_units = districts + [f for feats in ucs.values() for f in feats]
    uid = lambda f: f["properties"].get("uc_id") or f["properties"]["district_id"]  # noqa: E731

    # --- sources
    wc = load_worldcereal()
    crops_status = "live" if wc else "synthetic"
    et_live, et_note = (None, "skipped (--no-ee)") if args.no_ee else et_wapor(all_units, dekads)
    et_status = "live" if et_live else "synthetic"
    if not et_live:
        print("ET: synthetic placeholder;", et_note)
    rain_missing = 0

    series_dir = os.path.join(out, "series")
    os.makedirs(series_dir, exist_ok=True)
    for old in os.listdir(series_dir):
        os.remove(os.path.join(series_dir, old))

    sources = {
        "et": {"name": "FAO WaPOR v3 actual evapotranspiration and interception, dekadal (AETI-D)",
               "dataset": et_note if et_live else "FAO/WAPOR/3/L2_AETI_D (not connected)", "status": et_status,
               "licence": "CC BY 4.0 (FAO)"},
        "rain": {"name": "NASA POWER daily bias-corrected precipitation (PRECTOTCORR, MERRA-2)",
                 "dataset": "power.larc.nasa.gov temporal/daily/point, community AG", "status": "live",
                 "licence": "Public domain (NASA)"},
        "crops": {"name": "ESA WorldCereal 2021 v100: temporary crops, winter cereals, maize, active irrigation",
                  "dataset": "ESA/WorldCereal/2021/MODELS/v100", "status": crops_status, "licence": "CC BY 4.0 (ESA)"},
        "boundaries": {"name": "geoBoundaries gbOpen Pakistan ADM2 (districts, 2019) and ADM3 (tehsils, 2017)",
                       "dataset": "github.com/wmgeolab/geoBoundaries release 9469f09", "status": "live",
                       "licence": "Public domain / CC BY 4.0 (geoBoundaries)",
                       "note": "Level-3 units are tehsils, not union councils; 31 districts reflect 2019 boundaries."},
    }

    def build_unit(f):
        k = uid(f)
        lon, lat = centroid(f["geometry"])
        rain, rstat = rain_by_dekad(k, dekads)
        nonlocal rain_missing
        if rstat == "missing":
            rain_missing += 1
        et = et_live[k] if et_live else et_synthetic(k, lat, dekads)
        crops = (wc or {}).get(k) if wc else crops_synthetic(k, f["geometry"], lat)
        if crops is None:
            crops = {"crop_ha": None, "wheat_ha": None, "maize_ha": None, "irrigated_ha": None}
        rows = []
        for (s, e), e_mm, r_mm in zip(dekads, et, rain):
            deficit = None if e_mm is None or r_mm is None else round(e_mm - r_mm, ROUND_MM)
            rows.append({"start": s.isoformat(), "end": e.isoformat(), "et_mm": e_mm, "rain_mm": r_mm,
                         "deficit_mm": deficit, "status": classify(deficit, crops["irrigated_ha"], thr)})
        latest = rows[-1]
        props = f["properties"]
        props.update(crops)
        props.update({"status": latest["status"], "deficit_mm": latest["deficit_mm"],
                      "et_mm": latest["et_mm"], "rain_mm": latest["rain_mm"],
                      "centroid": [round(lon, 4), round(lat, 4)]})
        series = {"uc_id" if "uc_id" in props else "district_id": k, "name_en": props.get("uc_name_en") or props["name_en"],
                  "district_id": props["district_id"], "dekads": rows,
                  "hectares": crops,
                  "sources": {"et": sources["et"]["name"], "rain": sources["rain"]["name"], "crops": sources["crops"]["name"]},
                  "source_status": {"et": et_status, "rain": rstat, "crops": crops_status},
                  "generated_at": generated_at}
        dump_json(os.path.join(series_dir, f"{k}.json"), series)
        return props

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    for feats in ucs.values():
        for f in feats:
            build_unit(f)
    for d in districts:
        build_unit(d)
        # district hectares = sum of its level-3 units when zonal stats are per unit
        d["properties"]["uc_count"] = len(ucs[d["properties"]["district_id"]])

    dump_json(os.path.join(out, "districts.geojson"), {"type": "FeatureCollection", "generated_at": generated_at,
                                                        "features": districts}, compact=True)
    for did, feats in ucs.items():
        dump_json(os.path.join(out, "ucs", f"{did}.geojson"), {"type": "FeatureCollection", "generated_at": generated_at,
                                                               "district_id": did, "features": feats}, compact=True)

    # --- validation.csv (census columns typed by Person 4 in census_2024.csv)
    census = {}
    cpath = os.path.join(HERE, "census_2024.csv")
    if os.path.exists(cpath):
        with open(cpath, encoding="utf-8") as fh:
            census = {r["district"]: r for r in csv.DictReader(fh)}
    with open(os.path.join(out, "validation.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["district", "district_id", "census_crop_ha", "atlas_crop_ha", "census_wheat_ha", "atlas_wheat_ha"])
        for d in districts:
            p = d["properties"]
            c = census.get(p["name_en"], {})
            w.writerow([p["name_en"], p["district_id"], c.get("census_crop_ha", ""), p["crop_ha"],
                        c.get("census_wheat_ha", ""), p["wheat_ha"]])

    counts = {"green": 0, "amber": 0, "red": 0, "nodata": 0}
    for d in districts:
        counts[d["properties"]["status"]] += 1
    mode = "live" if et_status == crops_status == "live" else "demo"
    meta = {
        "generated_at": generated_at,
        "mode": mode,
        "latest_dekad": {"start": dekads[-1][0].isoformat(), "end": dekads[-1][1].isoformat()},
        "dekads": [{"start": s.isoformat(), "end": e.isoformat()} for s, e in dekads],
        "thresholds": {k: v for k, v in thr.items() if not k.startswith("_")},
        "sources": sources,
        "counts": {"districts": len(districts), "level3_units": sum(len(v) for v in ucs.values()),
                   "district_status": counts, "rain_missing_units": rain_missing},
        "unit_note": "Level-3 units are tehsils from geoBoundaries until union-council polygons are sourced.",
        "contract_version": "0.1",
    }
    dump_json(os.path.join(out, "meta.json"), meta)
    print(f"wrote {out}: {len(districts)} districts, {meta['counts']['level3_units']} units, mode={mode}, "
          f"district status={counts}, rain missing for {rain_missing} units")


if __name__ == "__main__":
    main()
