#!/usr/bin/env python3
"""Step 3: assemble the /data contract files. Every number is measured or computed.

    python3 build_series.py [--today YYYY-MM-DD] [--out ../data] [--no-ee]

Inputs
  cache/boundaries/*        from prepare_boundaries.py
  cache/power/<id>.json     from fetch_power.py: daily rain and the FAO-56 inputs
  worldcover_stats.csv      from worldcover_stats.py: real cropland hectares
  worldcereal_stats.csv     optional, from worldcereal_stats.js in Earth Engine:
                            winter cereals, maize and irrigated hectares
  thresholds.json           the traffic-light rule
  census_2024.csv           district rows typed from the Agricultural Census

The water balance
  deficit_mm = water the crops needed − rain they received, per dekad.

  "Water needed" comes from the best source available, in this order:
    1. FAO WaPOR v3 AETI, the actual evapotranspiration measured from space.
       Used when earthengine-api and credentials are present.
    2. FAO-56 Penman-Monteith reference evapotranspiration computed from NASA
       POWER daily temperature, humidity, wind, solar radiation and pressure.
       No credentials needed, so this is what the public build uses.
  Which one produced a file is recorded in meta.json and shown on every panel.

Nothing is invented. If a source is missing the field is null and the unit is
reported as "no data" rather than filled with a plausible-looking number.
"""
import argparse
import csv
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone

from dekads import last_complete_dekads
from et0 import et0_daily
from geo import centroid

HERE = os.path.dirname(os.path.abspath(__file__))
BND = os.path.join(HERE, "cache", "boundaries")
POWER = os.path.join(HERE, "cache", "power")
ROUND_MM = 1


# ----------------------------------------------------------------- small helpers
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


def classify(deficit, basis_ha, thr):
    """Traffic light. basis_ha is the cropped area the signal applies to."""
    if deficit is None or not basis_ha:
        return "nodata"
    if deficit <= thr["green"]["max_deficit_mm"]:
        return "green"
    if deficit <= thr["amber"]["max_deficit_mm"]:
        return "amber"
    return "red"


# ----------------------------------------------------------------- NASA POWER
def power_daily(unit_id):
    path = os.path.join(POWER, f"{unit_id}.json")
    if not os.path.exists(path):
        return None
    return load_json(path)


def rain_and_et0(rec, dekads, lat, max_missing=2):
    """Per-dekad rainfall (mm) and FAO-56 reference evapotranspiration (mm) from one POWER record."""
    if rec is None:
        return [None] * len(dekads), [None] * len(dekads)
    d = rec["daily"]
    rain_out, et_out = [], []
    for start, end in dekads:
        rain_total = et_total = 0.0
        rain_missing = et_missing = 0
        day = start
        while day <= end:
            key = day.strftime("%Y%m%d")
            doy = int(day.strftime("%j"))
            r = d["PRECTOTCORR"].get(key)
            if r is None:
                rain_missing += 1
            else:
                rain_total += r
            e = et0_daily(d["T2M_MAX"].get(key), d["T2M_MIN"].get(key), d["RH2M"].get(key),
                          d["WS2M"].get(key), d["ALLSKY_SFC_SW_DWN"].get(key), d["PS"].get(key),
                          lat, doy)
            if e is None:
                et_missing += 1
            else:
                et_total += e
            day += timedelta(days=1)
        rain_out.append(None if rain_missing > max_missing else round(rain_total, ROUND_MM))
        et_out.append(None if et_missing > max_missing else round(et_total, ROUND_MM))
    return rain_out, et_out


# ----------------------------------------------------------------- FAO WaPOR (optional)
def et_wapor(features, dekads):
    """Actual evapotranspiration per unit per dekad, or (None, reason) when unavailable."""
    try:
        import ee
    except ImportError:
        return None, "earthengine-api not installed"
    try:
        key = os.environ.get("EE_SERVICE_ACCOUNT_KEY")
        project = os.environ.get("EE_PROJECT", "kp-farm-atlas")
        if key:
            info = json.loads(key)
            ee.Initialize(ee.ServiceAccountCredentials(info["client_email"], key_data=key), project=project)
        else:
            ee.Initialize(project=project)
    except Exception as exc:  # noqa: BLE001
        return None, f"Earth Engine init failed: {str(exc)[:120]}"

    uid = lambda f: f["properties"].get("uc_id") or f["properties"]["district_id"]  # noqa: E731
    fc = ee.FeatureCollection([ee.Feature(ee.Geometry(f["geometry"]), {"uid": uid(f)}) for f in features])
    dataset = scale = None
    for level, sc in (("L2", 100), ("L1", 300)):
        name = f"FAO/WAPOR/3/{level}_AETI_D"
        try:
            ee.ImageCollection(name).first().getInfo()
            dataset, scale = name, sc
            break
        except Exception:  # noqa: BLE001
            continue
    if dataset is None:
        return None, "WaPOR collections not reachable"

    col = ee.ImageCollection(dataset)
    results = {uid(f): [] for f in features}
    for start, end in dekads:
        img = col.filterDate(start.isoformat(), (end + timedelta(days=1)).isoformat()).mosaic()
        stats = img.select([img.bandNames().get(0)]).multiply(0.1).reduceRegions(
            collection=fc, reducer=ee.Reducer.mean(), scale=scale).getInfo()
        got = {f["properties"]["uid"]: f["properties"].get("mean") for f in stats["features"]}
        for k in results:
            v = got.get(k)
            results[k].append(None if v is None else round(float(v), ROUND_MM))
    return results, dataset


# ----------------------------------------------------------------- crop areas
def load_stats(filename, columns):
    path = os.path.join(HERE, filename)
    if not os.path.exists(path):
        return None
    out = {}
    with open(path, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            vals = {}
            for c in columns:
                raw = row.get(c, "")
                vals[c] = int(round(float(raw))) if raw not in ("", None) else None
            out[row["id"]] = vals
    return out


# ----------------------------------------------------------------- main
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
    ucs = {d["properties"]["district_id"]:
           load_json(os.path.join(BND, "ucs", f"{d['properties']['district_id']}.geojson"))["features"]
           for d in districts}
    all_units = districts + [f for feats in ucs.values() for f in feats]
    uid = lambda f: f["properties"].get("uc_id") or f["properties"]["district_id"]  # noqa: E731

    cover = load_stats("worldcover_stats.csv", ["crop_ha", "total_ha"])
    if cover is None:
        sys.exit("worldcover_stats.csv is missing. Run: python3 pipeline/worldcover_stats.py")
    cereal = load_stats("worldcereal_stats.csv", ["wheat_ha", "maize_ha", "irrigated_ha"])

    wapor, wapor_note = (None, "skipped (--no-ee)") if args.no_ee else et_wapor(all_units, dekads)
    et_method = "wapor_aeti" if wapor else "fao56_power"
    if not wapor:
        print(f"water demand: FAO-56 Penman-Monteith from NASA POWER ({wapor_note})")

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    series_dir = os.path.join(out, "series")
    os.makedirs(series_dir, exist_ok=True)
    for old in os.listdir(series_dir):
        os.remove(os.path.join(series_dir, old))

    sources = {
        "water_demand": {
            "name": ("FAO WaPOR v3 actual evapotranspiration (AETI, dekadal)" if wapor else
                     "Reference evapotranspiration (FAO-56 Penman-Monteith) from NASA POWER daily weather"),
            "dataset": wapor_note if wapor else
                       "NASA POWER T2M_MAX, T2M_MIN, RH2M, WS2M, ALLSKY_SFC_SW_DWN, PS",
            "method": et_method, "status": "live",
            "licence": "CC BY 4.0 (FAO)" if wapor else "Public domain (NASA)"},
        "rain": {"name": "NASA POWER daily bias-corrected precipitation (PRECTOTCORR, MERRA-2)",
                 "dataset": "power.larc.nasa.gov temporal/daily/point, community AG",
                 "status": "live", "licence": "Public domain (NASA)"},
        "cropland": {"name": "ESA WorldCover 2021 v200, class 40 cropland, 10 m",
                     "dataset": "esa-worldcover public bucket, statistics at about 75 m",
                     "status": "live", "licence": "CC BY 4.0 (ESA)"},
        "crop_type": {"name": "ESA WorldCereal 2021 v100: winter cereals, maize, active irrigation",
                      "dataset": "ESA/WorldCereal/2021/MODELS/v100 via Earth Engine",
                      "status": "live" if cereal else "not_connected",
                      "licence": "CC BY 4.0 (ESA)",
                      "note": None if cereal else
                      "Needs Earth Engine credentials. Until then these hectares are reported as "
                      "unavailable rather than estimated."},
        "boundaries": {"name": "geoBoundaries gbOpen Pakistan ADM2 districts (2019) and ADM3 tehsils (2017)",
                       "dataset": "github.com/wmgeolab/geoBoundaries release 9469f09",
                       "status": "live", "licence": "Public domain / CC BY 4.0",
                       "note": "Level-3 units are tehsils, not union councils; 31 districts, not 35."},
    }
    status_basis = "irrigated winter cereals" if cereal else "cropland"
    missing_power = []

    def build_unit(f):
        k = uid(f)
        lon, lat = centroid(f["geometry"])
        rec = power_daily(k)
        if rec is None:
            missing_power.append(k)
        rain, et0 = rain_and_et0(rec, dekads, lat)
        et = wapor[k] if wapor else et0
        ha = {"crop_ha": None, "wheat_ha": None, "maize_ha": None, "irrigated_ha": None}
        if cover and k in cover:
            ha["crop_ha"] = cover[k]["crop_ha"]
        if cereal and k in cereal:
            ha.update(cereal[k])
        basis = ha["irrigated_ha"] if cereal else ha["crop_ha"]

        rows = []
        for (s, e), e_mm, r_mm in zip(dekads, et, rain):
            deficit = None if e_mm is None or r_mm is None else round(e_mm - r_mm, ROUND_MM)
            rows.append({"start": s.isoformat(), "end": e.isoformat(), "et_mm": e_mm, "rain_mm": r_mm,
                         "deficit_mm": deficit, "status": classify(deficit, basis, thr)})
        latest = rows[-1]
        p = f["properties"]
        p.update(ha)
        p.update({"status": latest["status"], "deficit_mm": latest["deficit_mm"],
                  "et_mm": latest["et_mm"], "rain_mm": latest["rain_mm"],
                  "centroid": [round(lon, 4), round(lat, 4)]})
        key = "uc_id" if "uc_id" in p else "district_id"
        dump_json(os.path.join(series_dir, f"{k}.json"), {
            key: k, "name_en": p.get("uc_name_en") or p["name_en"], "district_id": p["district_id"],
            "dekads": rows, "hectares": ha, "et_method": et_method, "status_basis": status_basis,
            "sources": {"water_demand": sources["water_demand"]["name"], "rain": sources["rain"]["name"],
                        "cropland": sources["cropland"]["name"]},
            "generated_at": generated_at})
        return p

    for feats in ucs.values():
        for f in feats:
            build_unit(f)
    for d in districts:
        build_unit(d)
        d["properties"]["uc_count"] = len(ucs[d["properties"]["district_id"]])

    dump_json(os.path.join(out, "districts.geojson"),
              {"type": "FeatureCollection", "generated_at": generated_at, "features": districts}, compact=True)
    for did, feats in ucs.items():
        dump_json(os.path.join(out, "ucs", f"{did}.geojson"),
                  {"type": "FeatureCollection", "generated_at": generated_at, "district_id": did,
                   "features": feats}, compact=True)
    # one combined file so the province view can reveal every union council on zoom
    dump_json(os.path.join(out, "ucs", "all.geojson"),
              {"type": "FeatureCollection", "generated_at": generated_at,
               "features": [f for feats in ucs.values() for f in feats]}, compact=True)

    census = {}
    cpath = os.path.join(HERE, "census_2024.csv")
    if os.path.exists(cpath):
        with open(cpath, encoding="utf-8") as fh:
            census = {r["district"]: r for r in csv.DictReader(fh)}
    with open(os.path.join(out, "validation.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["district", "district_id", "census_crop_ha", "atlas_crop_ha",
                    "census_wheat_ha", "atlas_wheat_ha"])
        for d in districts:
            p = d["properties"]
            c = census.get(p["name_en"], {})
            w.writerow([p["name_en"], p["district_id"], c.get("census_crop_ha", ""), p["crop_ha"],
                        c.get("census_wheat_ha", ""), p["wheat_ha"] if p["wheat_ha"] is not None else ""])

    counts = {"green": 0, "amber": 0, "red": 0, "nodata": 0}
    for d in districts:
        counts[d["properties"]["status"]] += 1
    mode = "live" if all(s["status"] in ("live", "not_connected") for s in sources.values()) else "demo"
    dump_json(os.path.join(out, "meta.json"), {
        "generated_at": generated_at, "mode": mode, "et_method": et_method, "status_basis": status_basis,
        "latest_dekad": {"start": dekads[-1][0].isoformat(), "end": dekads[-1][1].isoformat()},
        "dekads": [{"start": s.isoformat(), "end": e.isoformat()} for s, e in dekads],
        "thresholds": {k: v for k, v in thr.items() if not k.startswith("_")},
        "sources": sources,
        "counts": {"districts": len(districts), "level3_units": sum(len(v) for v in ucs.values()),
                   "district_status": counts, "units_without_weather": len(missing_power)},
        "unit_note": "Level-3 units are tehsils from geoBoundaries until union-council polygons are sourced.",
        "contract_version": "0.2"})
    print(f"wrote {out}: {len(districts)} districts, {sum(len(v) for v in ucs.values())} units, "
          f"mode={mode}, et={et_method}, basis={status_basis}, district status={counts}")
    if missing_power:
        print(f"  no POWER weather for {len(missing_power)} units: {missing_power[:5]}")


if __name__ == "__main__":
    main()
