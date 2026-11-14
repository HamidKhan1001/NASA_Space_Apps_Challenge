#!/usr/bin/env python3
"""Step 2: daily weather from NASA POWER for every centroid, with a disk cache.

Pulls rainfall and the six variables needed for FAO-56 reference evapotranspiration
in a single request per point, so the whole water balance comes from one NASA source.

Usage:
  python3 fetch_power.py [--centroids cache/boundaries/centroids.csv] [--days 70]

Writes pipeline/cache/power/<id>.json  {"lon","lat","start","end","daily":{"YYYYMMDD": mm}}
PRECTOTCORR is bias-corrected precipitation in mm/day on a 0.5 x 0.625 degree
MERRA-2 grid. One point per request.
Re-running only fetches points whose cache does not cover the requested window.
"""
import argparse
import csv
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "power")
URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
# Rainfall plus every input the FAO-56 Penman-Monteith reference evapotranspiration
# needs, so one request per point serves both halves of the water balance.
PARAMS = ["PRECTOTCORR", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "PS"]
PARAM = ",".join(PARAMS)


def fetch_point(lon, lat, start, end, retries=4):
    q = {"parameters": PARAM, "community": "AG", "longitude": lon, "latitude": lat,
         "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"), "format": "JSON"}
    delay = 2
    for attempt in range(retries):
        try:
            r = requests.get(URL, params=q, timeout=60)
            if r.status_code == 429 or r.status_code >= 500:
                raise requests.HTTPError(f"{r.status_code}")
            r.raise_for_status()
            block = r.json()["properties"]["parameter"]
            # POWER uses -999 for missing days
            out = {}
            for name in PARAMS:
                series = block.get(name, {})
                out[name] = {k: (None if v is None or v < -900 else round(float(v), 3)) for k, v in series.items()}
            return out
        except Exception as exc:  # noqa: BLE001
            if attempt == retries - 1:
                raise
            print(f"  retry {attempt + 1} after {exc}", file=sys.stderr)
            time.sleep(delay)
            delay *= 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--centroids", default=os.path.join(HERE, "cache", "boundaries", "centroids.csv"))
    ap.add_argument("--days", type=int, default=70)
    ap.add_argument("--end", default=None, help="YYYY-MM-DD, default today")
    ap.add_argument("--limit", type=int, default=0, help="only first N points (testing)")
    ap.add_argument("--workers", type=int, default=4, help="parallel requests (POWER tolerates a few)")
    args = ap.parse_args()

    end = date.fromisoformat(args.end) if args.end else date.today()
    start = end - timedelta(days=args.days)
    os.makedirs(CACHE, exist_ok=True)
    with open(args.centroids, encoding="utf-8") as fh:
        points = list(csv.DictReader(fh))
    if args.limit:
        points = points[: args.limit]

    done = failed = skipped = 0
    todo = []
    for p in points:
        path = os.path.join(CACHE, f"{p['id']}.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                old = json.load(fh)
            if (old.get("start") <= start.isoformat() and old.get("end") >= end.isoformat()
                    and old.get("parameters") == PARAMS):
                skipped += 1
                continue
        todo.append(p)
    print(f"{len(todo)} points to fetch, {skipped} already cached, {args.workers} workers", flush=True)

    def work(p):
        daily = fetch_point(float(p["lon"]), float(p["lat"]), start, end)
        with open(os.path.join(CACHE, f"{p['id']}.json"), "w", encoding="utf-8") as fh:
            json.dump({"id": p["id"], "lon": float(p["lon"]), "lat": float(p["lat"]), "start": start.isoformat(),
                       "end": end.isoformat(), "parameters": PARAMS,
                       "units": {"PRECTOTCORR": "mm/day", "T2M_MAX": "C", "T2M_MIN": "C", "RH2M": "%",
                                 "WS2M": "m/s", "ALLSKY_SFC_SW_DWN": "MJ/m^2/day", "PS": "kPa"},
                       "fetched_at": date.today().isoformat(), "daily": daily}, fh)
        return p["id"]

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futures = {ex.submit(work, p): p for p in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            p = futures[fut]
            try:
                fut.result()
                done += 1
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f"{p['id']} FAILED: {exc}", file=sys.stderr, flush=True)
            if i % 10 == 0 or i == len(todo):
                print(f"[{i}/{len(todo)}] fetched {done}, failed {failed}", flush=True)
    print(f"POWER done: {done} fetched, {skipped} already cached, {failed} failed")
    sys.exit(1 if failed and not done and not skipped else 0)


if __name__ == "__main__":
    main()
