"""Tiny pure-Python geometry helpers so the pipeline has no GIS dependencies.

Accuracy is good enough for centroids, point-in-polygon and approximate
hectare areas of administrative units. Real zonal statistics (hectares of
cropland etc.) come from Earth Engine, not from here.
"""
import math

EARTH_R = 6371008.8  # metres


def rings(geom):
    """Yield polygons as lists of rings (outer first) for Polygon/MultiPolygon."""
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    raise ValueError(f"unsupported geometry {geom['type']}")


def _ring_signed_area(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][:2]
        x2, y2 = ring[i + 1][:2]
        a += x1 * y2 - x2 * y1
    return a / 2.0


def point_in_ring(pt, ring):
    x, y = pt
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][:2]
        x2, y2 = ring[(i + 1) % n][:2]
        if (y1 > y) != (y2 > y):
            xi = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < xi:
                inside = not inside
    return inside


def point_in_geom(pt, geom):
    for poly in rings(geom):
        if point_in_ring(pt, poly[0]) and not any(point_in_ring(pt, hole) for hole in poly[1:]):
            return True
    return False


def centroid(geom):
    """Centroid of the largest part's outer ring (lon, lat)."""
    best, best_area = None, -1.0
    for poly in rings(geom):
        ring = poly[0]
        a = _ring_signed_area(ring)
        if abs(a) <= best_area:
            continue
        cx = cy = 0.0
        for i in range(len(ring) - 1):
            x1, y1 = ring[i][:2]
            x2, y2 = ring[i + 1][:2]
            c = x1 * y2 - x2 * y1
            cx += (x1 + x2) * c
            cy += (y1 + y2) * c
        if a == 0:
            best, best_area = tuple(ring[0][:2]), 0
        else:
            best, best_area = (cx / (6 * a), cy / (6 * a)), abs(a)
    return best


def area_ha(geom):
    """Approximate area in hectares (equirectangular projection at the mean latitude)."""
    total = 0.0
    for poly in rings(geom):
        for k, ring in enumerate(poly):
            lat0 = sum(p[1] for p in ring) / len(ring)
            kx = math.radians(1) * EARTH_R * math.cos(math.radians(lat0))
            ky = math.radians(1) * EARTH_R
            proj = [(p[0] * kx, p[1] * ky) for p in ring]
            a = abs(_ring_signed_area(proj))
            total += a if k == 0 else -a
    return total / 10_000.0


def bbox(geom):
    xs, ys = [], []
    for poly in rings(geom):
        for p in poly[0]:
            xs.append(p[0]); ys.append(p[1])
    return [min(xs), min(ys), max(xs), max(ys)]


def round_coords(geom, ndigits=4):
    def rr(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], ndigits), round(c[1], ndigits)]
        return [rr(x) for x in c]
    return {"type": geom["type"], "coordinates": rr(geom["coordinates"])}
