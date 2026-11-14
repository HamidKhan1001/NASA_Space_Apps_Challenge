#!/usr/bin/env python3
"""Winter cereals, maize and irrigated hectares from ESA WorldCereal 2021, without Earth Engine.

WorldCereal is normally reached through Google Earth Engine. It is also published
openly on Zenodo as one GeoTIFF per agro-ecological zone, bundled into archives of
15 to 20 GB. Khyber Pakhtunkhwa is covered by four zones, so this script reads each
archive's index with a few small range requests and streams only those four members
(about 2.4 GB per product instead of 18 GB), computes the hectares per unit, and
deletes the file before moving on.

    python3 pipeline/worldcereal_zenodo.py            # writes worldcereal_stats.csv

Classification rasters use 100 for "class present", 0 for absent and 255 for no data.
Statistics are taken at about 75 m, matching worldcover_stats.py.
"""
import argparse
import csv
import json
import math
import os
import re
import shutil
import sys
import time

import numpy as np
import rasterio
import requests
from rasterio.features import rasterize
from rasterio.warp import transform_geom
from rasterio.windows import from_bounds

from geo import bbox, centroid, point_in_geom
from http_zip import extract_member, open_index

HERE = os.path.dirname(os.path.abspath(__file__))
BND = os.path.join(HERE, "cache", "boundaries")
CACHE = os.path.join(HERE, "cache", "worldcereal")
OUT = os.path.join(HERE, "worldcereal_stats.csv")
ZEN = "https://zenodo.org/records/7875105/files/{key}"
AEZ_URL = ZEN.format(key="WorldCereal_AEZ.geojson?download=1")
PRESENT = 100
TARGET_M = 75.0

PRODUCTS = [
    ("wheat_ha", "WorldCereal_2021_tc-wintercereals_wintercereals_classification.zip"),
    ("maize_ha", "WorldCereal_2021_tc-maize-main_maize_classification.zip"),
    ("irrigated_ha", "WorldCereal_2021_tc-wintercereals_irrigation_classification.zip"),
]


def load_layers():
    districts, ucs = [], []
    with open(os.path.join(BND, "districts.geojson"), encoding="utf-8") as fh:
        for f in json.load(fh)["features"]:
            districts.append((f["properties"]["district_id"], f["geometry"]))
    for name in sorted(os.listdir(os.path.join(BND, "ucs"))):
        with open(os.path.join(BND, "ucs", name), encoding="utf-8") as fh:
            for f in json.load(fh)["features"]:
                ucs.append((f["properties"]["uc_id"], f["geometry"]))
    return [districts, ucs]


def zones_for(units):
    """Agro-ecological zone ids whose polygon contains at least one unit centroid."""
    path = os.path.join(CACHE, "WorldCereal_AEZ.geojson")
    os.makedirs(CACHE, exist_ok=True)
    if not os.path.exists(path):
        print("downloading zone index")
        r = requests.get(AEZ_URL, timeout=120)
        r.raise_for_status()
        with open(path, "wb") as fh:
            fh.write(r.content)
    with open(path, encoding="utf-8") as fh:
        aez = json.load(fh)["features"]
    zones = set()
    for _, geom in units:
        c = centroid(geom)
        for f in aez:
            if point_in_geom(c, f["geometry"]):
                zones.add(int(f["properties"]["aez_id"]))
                break
    return sorted(zones)


def pixel_area_ha(src, win_transform, rows, cols):
    """Hectares per pixel, accounting for geographic or projected rasters."""
    if src.crs and src.crs.is_projected:
        return np.full((rows, 1), abs(win_transform.a * win_transform.e) / 10_000.0)
    lat = win_transform.f + (np.arange(rows) + 0.5) * win_transform.e
    per_row = (abs(win_transform.a) * 111_320.0 * np.cos(np.radians(lat))) * \
              (abs(win_transform.e) * 110_540.0) / 10_000.0
    return per_row[:, None]


def stats_for_raster(path, layers, totals, seen_values):
    with rasterio.open(path) as src:
        res_m = abs(src.transform.a) * (1.0 if (src.crs and src.crs.is_projected) else 111_320.0)
        decim = max(1, int(round(TARGET_M / max(res_m, 0.001))))
        b = src.bounds
        for layer in layers:
            for uid, geom in layer:
                g = geom
                if src.crs and src.crs.to_epsg() != 4326:
                    g = transform_geom("EPSG:4326", src.crs, geom)
                minx, miny, maxx, maxy = bbox(g) if g["type"] in ("Polygon", "MultiPolygon") else (0, 0, 0, 0)
                if minx >= b.right or maxx <= b.left or miny >= b.top or maxy <= b.bottom:
                    continue
                win = from_bounds(max(minx, b.left), max(miny, b.bottom),
                                  min(maxx, b.right), min(maxy, b.top), src.transform)
                win = win.round_offsets().round_lengths()
                h, w = int(win.height), int(win.width)
                if h < 1 or w < 1:
                    continue
                oh, ow = max(1, h // decim), max(1, w // decim)
                arr = src.read(1, window=win, out_shape=(oh, ow),
                               resampling=rasterio.enums.Resampling.nearest, boundless=False)
                tr = src.window_transform(win)
                tr = tr * tr.scale(w / ow, h / oh)
                mask = rasterize([(g, 1)], out_shape=arr.shape, transform=tr, fill=0, dtype="uint8")
                if not mask.any():
                    continue
                if len(seen_values) < 6:
                    seen_values.update(np.unique(arr[mask == 1]).tolist())
                area = pixel_area_ha(src, tr, arr.shape[0], arr.shape[1])
                hit = (mask == 1) & (arr == PRESENT)
                totals[uid] = totals.get(uid, 0.0) + float((np.broadcast_to(area, arr.shape)[hit]).sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="keep the streamed zone rasters")
    args = ap.parse_args()

    layers = load_layers()
    units = [u for layer in layers for u in layer]
    zones = zones_for(units)
    print(f"{len(units)} units, zones covering them: {zones}")
    os.makedirs(CACHE, exist_ok=True)

    results = {}
    for column, key in PRODUCTS:
        print(f"\n=== {column}  ({key})")
        url = ZEN.format(key=key)
        try:
            z, fh = open_index(url)
        except Exception as exc:  # noqa: BLE001
            print(f"  archive unreachable: {str(exc)[:90]}", file=sys.stderr)
            continue
        members = {}
        for info in z.infolist():
            m = re.match(r"(\d+)_", info.filename.split("/")[-1])
            if m and int(m.group(1)) in zones:
                members[int(m.group(1))] = info
        print(f"  {len(members)}/{len(zones)} zones present in this archive")
        totals, seen = {}, set()
        for zone, info in sorted(members.items()):
            tif = os.path.join(CACHE, f"{column}_{zone}.tif")
            if not os.path.exists(tif):
                mb = info.compress_size / 1e6
                t0 = time.time()
                last = [0.0]

                def progress(done, total, t0=t0, last=last, zone=zone, mb=mb):
                    if time.time() - last[0] > 20:
                        last[0] = time.time()
                        print(f"    zone {zone}: {100 * done / total:4.0f}%  "
                              f"{done / 1e6 / max(0.1, time.time() - t0):.1f} MB/s", flush=True)

                print(f"  zone {zone}: streaming {mb:.0f} MB compressed", flush=True)
                extract_member(url, info, tif, fh=fh, progress=progress)
                print(f"  zone {zone}: inflated to {os.path.getsize(tif) / 1e6:.0f} MB "
                      f"in {time.time() - t0:.0f}s", flush=True)
            stats_for_raster(tif, layers, totals, seen)
            print(f"  zone {zone}: {sum(totals.values()):,.0f} ha so far", flush=True)
            if not args.keep:
                os.remove(tif)
        print(f"  raster values seen: {sorted(seen)}")
        for uid, v in totals.items():
            results.setdefault(uid, {})[column] = int(round(v))

    if not results:
        sys.exit("no products could be read")
    columns = [c for c, _ in PRODUCTS]
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id"] + columns + ["source"])
        for uid, _ in units:
            row = results.get(uid)
            if not row:
                continue
            w.writerow([uid] + [row.get(c, 0) for c in columns] + ["ESA WorldCereal 2021 v100"])
    print(f"\nwrote {OUT}: {len(results)}/{len(units)} units")


if __name__ == "__main__":
    main()
