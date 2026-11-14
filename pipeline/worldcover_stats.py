#!/usr/bin/env python3
"""Real cropland hectares per unit from ESA WorldCover 2021 (10 m), no credentials needed.

The WorldCover v200 map is published as cloud-optimised GeoTIFFs on a public
bucket, so this reads an overview level over HTTP range requests instead of
downloading the full 10 m rasters. Statistics are taken at about 100 m, which
is what the hackathon plan calls for: the area error is under a couple of
percent for units of this size and the export finishes in minutes.

    python3 pipeline/worldcover_stats.py            # writes worldcover_stats.csv

Output columns: id, crop_ha, total_ha, pixels, class_source
Class 40 of WorldCover is "cropland". WorldCover does not separate winter
cereals, maize or irrigated land; those come from ESA WorldCereal through
Earth Engine and stay empty here rather than being guessed.
"""
import csv
import json
import math
import os
import sys

import numpy as np
import rasterio
from rasterio.features import rasterize

from geo import bbox

HERE = os.path.dirname(os.path.abspath(__file__))
BND = os.path.join(HERE, "cache", "boundaries")
OUT = os.path.join(HERE, "worldcover_stats.csv")
URL = ("https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
       "ESA_WorldCover_10m_2021_v200_{tile}_Map.tif")
CROPLAND = 40
TARGET_M = 100.0          # statistics resolution


def tile_name(lat, lon):
    la = int(math.floor(lat / 3.0) * 3)
    lo = int(math.floor(lon / 3.0) * 3)
    return f"{'N' if la >= 0 else 'S'}{abs(la):02d}{'E' if lo >= 0 else 'W'}{abs(lo):03d}"


def tiles_for(bounds):
    minx, miny, maxx, maxy = bounds
    out = []
    lat = math.floor(miny / 3.0) * 3
    while lat <= maxy:
        lon = math.floor(minx / 3.0) * 3
        while lon <= maxx:
            out.append(tile_name(lat + 0.1, lon + 0.1))
            lon += 3
        lat += 3
    return sorted(set(out))


def load_units():
    """Two layers, kept apart because a district overlaps its own tehsils and a
    single rasterise pass would let the tehsils paint over the district."""
    districts, ucs = [], []
    with open(os.path.join(BND, "districts.geojson"), encoding="utf-8") as fh:
        for f in json.load(fh)["features"]:
            districts.append((f["properties"]["district_id"], f["geometry"]))
    ucdir = os.path.join(BND, "ucs")
    for name in sorted(os.listdir(ucdir)):
        with open(os.path.join(ucdir, name), encoding="utf-8") as fh:
            for f in json.load(fh)["features"]:
                ucs.append((f["properties"]["uc_id"], f["geometry"]))
    return [districts, ucs]


def main():
    layers = load_units()
    units = [u for layer in layers for u in layer]
    boxes = {uid: bbox(g) for uid, g in units}
    all_bounds = [min(b[0] for b in boxes.values()), min(b[1] for b in boxes.values()),
                  max(b[2] for b in boxes.values()), max(b[3] for b in boxes.values())]
    tiles = tiles_for(all_bounds)
    print(f"{len(units)} units, bounds {[round(v, 2) for v in all_bounds]}, tiles {tiles}")

    crop_ha = {uid: 0.0 for uid, _ in units}
    total_ha = {uid: 0.0 for uid, _ in units}
    pixels = {uid: 0 for uid, _ in units}

    env = rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES",
                       GDAL_HTTP_TIMEOUT="60", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="3",
                       VSI_CACHE="TRUE", VSI_CACHE_SIZE="134217728")
    with env:
        for tile in tiles:
            url = URL.format(tile=tile)
            try:
                src = rasterio.open(url)
            except Exception as exc:  # noqa: BLE001
                print(f"  {tile}: unavailable ({str(exc)[:70]}), skipping", file=sys.stderr)
                continue
            with src:
                res_m = abs(src.transform.a) * 111_320.0
                factor = max(1, int(round(TARGET_M / res_m)))
                ovr = [1] + list(src.overviews(1))
                decim = min(ovr, key=lambda o: abs(o - factor))
                out_h, out_w = src.height // decim, src.width // decim
                print(f"  {tile}: {src.width}x{src.height} at {res_m:.1f} m, "
                      f"reading 1/{decim} -> {out_w}x{out_h} (~{res_m * decim:.0f} m)", flush=True)
                arr = src.read(1, out_shape=(out_h, out_w),
                               resampling=rasterio.enums.Resampling.nearest)
                tr = src.transform * src.transform.scale(src.width / out_w, src.height / out_h)
                tb = src.bounds

                touched = 0
                tile_crop = 0.0
                rows = np.arange(arr.shape[0])
                lat = tr.f + (rows + 0.5) * tr.e
                px_ha = (abs(tr.a) * 111_320.0 * np.cos(np.radians(lat))) * (abs(tr.e) * 110_540.0) / 10_000.0
                area = np.repeat(px_ha[:, None], arr.shape[1], axis=1)

                for layer in layers:
                    here = [(uid, g) for uid, g in layer
                            if boxes[uid][0] < tb.right and boxes[uid][2] > tb.left
                            and boxes[uid][1] < tb.top and boxes[uid][3] > tb.bottom]
                    if not here:
                        continue
                    index = {i + 1: uid for i, (uid, _) in enumerate(here)}
                    shapes = [(g, i + 1) for i, (_, g) in enumerate(here)]
                    zones = rasterize(shapes, out_shape=arr.shape, transform=tr, fill=0,
                                      dtype="int32", all_touched=False)
                    nz = zones > 0
                    z = zones[nz]
                    a = area[nz]
                    v = arr[nz]
                    n = len(here) + 1
                    total = np.bincount(z, weights=a, minlength=n)
                    crop = np.bincount(z[v == CROPLAND], weights=a[v == CROPLAND], minlength=n)
                    count = np.bincount(z, minlength=n)
                    for i, uid in index.items():
                        total_ha[uid] += float(total[i])
                        crop_ha[uid] += float(crop[i])
                        pixels[uid] += int(count[i])
                    touched += len(here)
                    tile_crop += float(crop.sum())
                here = range(touched)
                crop = np.array([tile_crop])
                print(f"  {tile}: {len(here)} units touched, "
                      f"{crop.sum():,.0f} ha cropland", flush=True)

    got = sum(1 for u in pixels if pixels[u] > 0)
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "crop_ha", "total_ha", "pixels", "class_source"])
        for uid, _ in units:
            if pixels[uid] == 0:
                continue
            w.writerow([uid, int(round(crop_ha[uid])), int(round(total_ha[uid])), pixels[uid],
                        "ESA WorldCover 2021 v200 class 40"])
    print(f"wrote {OUT}: {got}/{len(units)} units with data")


if __name__ == "__main__":
    main()
