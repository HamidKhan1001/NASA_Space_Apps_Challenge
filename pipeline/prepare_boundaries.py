#!/usr/bin/env python3
"""Step 1 of the pipeline: build the KP boundary skeletons.

Reads geoBoundaries (gbOpen, public domain) ADM1/ADM2/ADM3 for Pakistan,
keeps the units whose centroid falls in Khyber Pakhtunkhwa, assigns each
level-3 unit (tehsil) to a district by centroid, and writes:

  pipeline/cache/boundaries/districts.geojson   (31 districts, no stats yet)
  pipeline/cache/boundaries/ucs/<district_id>.geojson
  pipeline/cache/boundaries/centroids.csv       (id, lon, lat for NASA POWER)
  pipeline/uc_ids.csv                           (stable id map, committed)

build_series.py then attaches statistics and status and writes /data.

Honesty notes (also in docs/sources.md):
  * geoBoundaries ADM2 reflects 2019 districts: 31 polygons, not 35.
    Chitral, Kohistan and Torghar/Kolai-Palas splits are not represented.
  * geoBoundaries ADM3 for Pakistan is TEHSILS (2017 census), not union
    councils. The data contract keeps the uc_* keys so the site does not
    change when real UC boundaries (GADM 4.1 L3 or PBS) are dropped in.
  * Tehsil-to-district assignment is by centroid and the two layers come
    from different sources, so a handful land in the wrong district.
    Replace with GADM when the network allows; see pipeline/README.md.
"""
import csv
import json
import os
import re
import sys
import requests

from geo import centroid, point_in_geom, round_coords

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "cache", "boundaries")
GB = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/PAK/{lvl}/geoBoundaries-PAK-{lvl}_simplified.geojson"
PROVINCE = "Khyber Pakhtunkhwa"


def fetch(lvl):
    path = os.path.join(RAW, f"pak_{lvl}_simplified.geojson")
    if not os.path.exists(path):
        os.makedirs(RAW, exist_ok=True)
        url = GB.format(lvl=lvl)
        print(f"downloading {url}")
        r = requests.get(url, timeout=300)
        r.raise_for_status()
        with open(path, "wb") as fh:
            fh.write(r.content)
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)["features"]


def load_codes():
    with open(os.path.join(HERE, "district_codes.csv"), encoding="utf-8") as fh:
        return {r["name_en"]: r for r in csv.DictReader(fh)}


def slug(name):
    s = re.sub(r"[^A-Z0-9]", "", name.upper())
    return s[:8] or "X"


def title(name):
    # geoBoundaries tehsil names are UPPERCASE; present them nicely
    small = {"e", "of", "and"}
    words = []
    for w in name.strip().split():
        lw = w.lower()
        if "." in w or w.isupper() and len(w) <= 3 and w not in ("I", "II", "III", "IV"):
            words.append(w.upper())
        elif w in ("I", "II", "III", "IV"):
            words.append(w)
        else:
            words.append(lw if lw in small else lw.capitalize())
    return " ".join(words).replace("(", " (").replace("  ", " ")


def main():
    adm1, adm2, adm3 = fetch("ADM1"), fetch("ADM2"), fetch("ADM3")
    kp = next(f for f in adm1 if f["properties"]["shapeName"] == PROVINCE)["geometry"]
    codes = load_codes()

    districts = []
    for f in adm2:
        if not point_in_geom(centroid(f["geometry"]), kp):
            continue
        name = f["properties"]["shapeName"]
        if name not in codes:
            sys.exit(f"district {name!r} missing from district_codes.csv; add a stable code")
        c = codes[name]
        districts.append({
            "type": "Feature",
            "properties": {
                "district_id": c["district_id"],
                "name_en": name,
                "name_ur": c["name_ur"],
                "name_ps": c["name_ps"],
                "source_shape_id": f["properties"]["shapeID"],
            },
            "geometry": round_coords(f["geometry"]),
        })
    districts.sort(key=lambda d: d["properties"]["district_id"])
    print(f"{len(districts)} districts in {PROVINCE}")

    # stable UC id map: shapeID -> uc_id, extended but never rewritten
    idmap_path = os.path.join(HERE, "uc_ids.csv")
    idmap = {}
    if os.path.exists(idmap_path):
        with open(idmap_path, encoding="utf-8") as fh:
            idmap = {r["source_shape_id"]: r for r in csv.DictReader(fh)}

    ucs = {d["properties"]["district_id"]: [] for d in districts}
    used = {r["uc_id"] for r in idmap.values()}
    for f in adm3:
        c = centroid(f["geometry"])
        if not point_in_geom(c, kp):
            continue
        home = next((d for d in districts if point_in_geom(c, d["geometry"])), None)
        if home is None:
            print("WARN tehsil outside every district:", f["properties"]["shapeName"], c)
            continue
        did = home["properties"]["district_id"]
        sid = f["properties"]["shapeID"]
        raw_name = f["properties"]["shapeName"]
        if sid in idmap:
            uc_id = idmap[sid]["uc_id"]
        else:
            base = f"{did}.{slug(raw_name)}"
            uc_id, n = base, 2
            while uc_id in used:
                uc_id, n = f"{base}{n}", n + 1
            used.add(uc_id)
            idmap[sid] = {"source_shape_id": sid, "uc_id": uc_id, "uc_name_en": title(raw_name), "district_id": did}
        ucs[did].append({
            "type": "Feature",
            "properties": {
                "uc_id": uc_id,
                "uc_name_en": idmap[sid]["uc_name_en"],
                "district_id": did,
                "name_en": home["properties"]["name_en"],
                "name_ur": home["properties"]["name_ur"],
                "name_ps": home["properties"]["name_ps"],
                "source_shape_id": sid,
            },
            "geometry": round_coords(f["geometry"]),
        })

    with open(idmap_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["source_shape_id", "uc_id", "uc_name_en", "district_id"])
        w.writeheader()
        for r in sorted(idmap.values(), key=lambda r: r["uc_id"]):
            w.writerow(r)

    os.makedirs(os.path.join(OUT, "ucs"), exist_ok=True)
    with open(os.path.join(OUT, "districts.geojson"), "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "features": districts}, fh, ensure_ascii=False, separators=(",", ":"))
    rows = []
    for did, feats in ucs.items():
        feats.sort(key=lambda f: f["properties"]["uc_id"])
        with open(os.path.join(OUT, "ucs", f"{did}.geojson"), "w", encoding="utf-8") as fh:
            json.dump({"type": "FeatureCollection", "features": feats}, fh, ensure_ascii=False, separators=(",", ":"))
        for f in feats:
            lon, lat = centroid(f["geometry"])
            rows.append((f["properties"]["uc_id"], round(lon, 4), round(lat, 4)))
    for d in districts:
        lon, lat = centroid(d["geometry"])
        rows.append((d["properties"]["district_id"], round(lon, 4), round(lat, 4)))
    with open(os.path.join(OUT, "centroids.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "lon", "lat"])
        w.writerows(rows)
    print(f"{sum(len(v) for v in ucs.values())} level-3 units; {len(rows)} centroids -> {OUT}")


if __name__ == "__main__":
    main()
