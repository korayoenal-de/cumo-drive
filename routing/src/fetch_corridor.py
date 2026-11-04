"""Lädt OSM Daten (API 0.6 /map) in Kacheln entlang einer GPX Route.

Aufruf: python3 -I fetch_corridor.py <route.gpx> <zielordner> [kachelgröße_grad]
Kacheln, die schon da sind, werden übersprungen. Zu volle Kacheln werden geviertelt.
"""
import math
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpx import read_points  # noqa: E402

API = "https://api.openstreetmap.org/api/0.6/map?bbox={:.5f},{:.5f},{:.5f},{:.5f}"
UA = "cumo-drive-routing-prototype/0.1"


def haversine(a, b):
    r = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(d))


def tiles_for(points, size):
    keys = set()
    for a, b in zip(points, points[1:]):
        n = max(1, int(haversine(a, b) / 150))
        for i in range(n + 1):
            lat = a[0] + (b[0] - a[0]) * i / n
            lon = a[1] + (b[1] - a[1]) * i / n
            # Nachbarkacheln mitnehmen, wenn der Punkt nah am Rand liegt
            for dlat in (-0.004, 0, 0.004):
                for dlon in (-0.006, 0, 0.006):
                    keys.add((math.floor((lat + dlat) / size), math.floor((lon + dlon) / size)))
    return sorted(keys)


def fetch(bbox, path, depth=0):
    url = API.format(*bbox)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
            return [path]
        except urllib.error.HTTPError as e:
            if e.code == 400 and depth < 3:
                w, s, e_, n = bbox
                mx, my = (w + e_) / 2, (s + n) / 2
                out = []
                for i, sub in enumerate([(w, s, mx, my), (mx, s, e_, my), (w, my, mx, n), (mx, my, e_, n)]):
                    out += fetch(sub, f"{path[:-4]}_{i}.osm", depth + 1)
                return out
            if e.code in (429, 509, 503):
                time.sleep(10 * (attempt + 1))
                continue
            raise
        except urllib.error.URLError:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Abruf fehlgeschlagen: {url}")


def main():
    gpx, out = sys.argv[1], sys.argv[2]
    size = float(sys.argv[3]) if len(sys.argv) > 3 else 0.02
    os.makedirs(out, exist_ok=True)
    pts = read_points(gpx)
    keys = tiles_for(pts, size)
    print(f"{len(pts)} Routenpunkte, {len(keys)} Kacheln")
    for i, (ky, kx) in enumerate(keys):
        path = os.path.join(out, f"t_{ky}_{kx}.osm")
        if os.path.exists(path) or os.path.exists(path[:-4] + "_0.osm"):
            continue
        bbox = (kx * size, ky * size, (kx + 1) * size, (ky + 1) * size)
        fetch(bbox, path)
        time.sleep(0.5)
        if i % 20 == 0:
            print(f"  {i + 1}/{len(keys)}", flush=True)
    print("fertig")


if __name__ == "__main__":
    main()
