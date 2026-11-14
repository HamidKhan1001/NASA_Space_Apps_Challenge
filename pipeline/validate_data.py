#!/usr/bin/env python3
"""Contract check for /data. Exit 1 on any violation. Run on every push (see .github/workflows)."""
import csv
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
STATUS = {"green", "amber", "red", "nodata"}
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DISTRICT_KEYS = {"district_id", "name_en", "name_ur", "name_ps", "crop_ha", "wheat_ha", "maize_ha", "irrigated_ha", "status", "deficit_mm"}
errors = []


def err(msg):
    errors.append(msg)


def load(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as fh:
        return json.load(fh)


def num_or_null(v):
    return v is None or isinstance(v, (int, float))


def check_props(p, where, extra=()):
    for k in DISTRICT_KEYS | set(extra):
        if k not in p:
            err(f"{where}: missing property {k}")
    if p.get("status") not in STATUS:
        err(f"{where}: status {p.get('status')!r} not in {sorted(STATUS)}")
    for k in ("crop_ha", "wheat_ha", "maize_ha", "irrigated_ha", "deficit_mm"):
        if not num_or_null(p.get(k)):
            err(f"{where}: {k} must be a number or null")
    if p.get("status") != "nodata" and p.get("deficit_mm") is None:
        err(f"{where}: status {p['status']} but deficit_mm is null")


def main():
    meta = load("meta.json")
    for k in ("generated_at", "mode", "latest_dekad", "dekads", "thresholds", "sources"):
        if k not in meta:
            err(f"meta.json: missing {k}")
    dek = [(d["start"], d["end"]) for d in meta["dekads"]]
    for s, e in dek:
        if not (ISO.match(s) and ISO.match(e)):
            err(f"meta.json: non-ISO dekad {s}..{e}")
    if meta["mode"] not in ("live", "demo"):
        err("meta.json: mode must be live or demo")

    districts = load("districts.geojson")["features"]
    if len(districts) < 30:
        err(f"districts.geojson: only {len(districts)} features")
    ids = set()
    for f in districts:
        p = f["properties"]
        check_props(p, f"district {p.get('district_id')}")
        if p["district_id"] in ids:
            err(f"duplicate district_id {p['district_id']}")
        ids.add(p["district_id"])
        ucp = os.path.join(ROOT, "ucs", f"{p['district_id']}.geojson")
        if not os.path.exists(ucp):
            err(f"missing ucs/{p['district_id']}.geojson")
            continue
        for u in load(f"ucs/{p['district_id']}.geojson")["features"]:
            up = u["properties"]
            check_props(up, f"uc {up.get('uc_id')}", extra=("uc_id", "uc_name_en"))
            if not up.get("uc_id", "").startswith(p["district_id"] + "."):
                err(f"uc {up.get('uc_id')} id does not start with {p['district_id']}.")
            check_series(up["uc_id"], dek, up["status"])
        check_series(p["district_id"], dek, p["status"])

    with open(os.path.join(ROOT, "validation.csv"), encoding="utf-8") as fh:
        hdr = next(csv.reader(fh))
    for col in ("district", "census_crop_ha", "atlas_crop_ha", "census_wheat_ha", "atlas_wheat_ha"):
        if col not in hdr:
            err(f"validation.csv: missing column {col}")

    size = os.path.getsize(os.path.join(ROOT, "districts.geojson"))
    if size > 300_000:
        err(f"districts.geojson is {size/1000:.0f} KB; contract says under 300 KB for 3G")

    if errors:
        print(f"{len(errors)} contract violation(s):")
        for e in errors[:50]:
            print(" -", e)
        sys.exit(1)
    print(f"data contract OK: {len(districts)} districts, latest dekad {meta['latest_dekad']['start']}..{meta['latest_dekad']['end']}, mode={meta['mode']}")


def check_series(uid, dek, status):
    p = os.path.join(ROOT, "series", f"{uid}.json")
    if not os.path.exists(p):
        err(f"missing series/{uid}.json")
        return
    s = load(f"series/{uid}.json")
    got = [(d["start"], d["end"]) for d in s.get("dekads", [])]
    if got != dek:
        err(f"series/{uid}.json dekads do not match meta.json")
    for d in s.get("dekads", []):
        for k in ("et_mm", "rain_mm", "deficit_mm"):
            if not num_or_null(d.get(k)):
                err(f"series/{uid}.json: {k} not numeric")
        if d.get("status") not in STATUS:
            err(f"series/{uid}.json: bad status {d.get('status')}")
    if s["dekads"] and s["dekads"][-1]["status"] != status:
        err(f"series/{uid}.json latest status {s['dekads'][-1]['status']} != polygon status {status}")
    if "generated_at" not in s or "sources" not in s:
        err(f"series/{uid}.json: missing generated_at or sources")


if __name__ == "__main__":
    main()
