#!/usr/bin/env python3
"""Prüft den eigenen Valhalla nach dem Bau (Koray 14.11.): Jede Stichprobe muss das richtige Land und
Rechtsverkehr liefern, und der Kreisverkehr bei Obernai muss "1. Ausfahrt" ansagen. Ausgabe ins setup.log."""
import json, sys, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002"
POINTS = {
    "DE": (49.64, 8.64), "AT": (47.26, 11.39), "CH": (47.37, 8.54), "IT": (46.50, 11.35),
    "FR": (48.58, 7.75), "SI": (46.05, 14.50),
}

def post(path, body):
    req = urllib.request.Request(BASE + "/" + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))

ok = True
for cc, (lat, lon) in POINTS.items():
    try:
        # kurze Route, damit die Punkte sicher auf einer Straße liegen, dann deren Kanten auslesen
        leg = post("route", {"locations": [{"lat": lat, "lon": lon}, {"lat": lat + 0.01, "lon": lon + 0.01}],
                             "costing": "auto"})["trip"]["legs"][0]
        r = post("trace_attributes", {"encoded_polyline": leg["shape"], "costing": "auto", "shape_match": "edge_walk"})
        got = {a.get("country_code") for a in r.get("admins", [])}
        right = {e.get("drive_on_right") for e in r.get("edges", [])}
        good = cc in got and right == {True}
    except Exception as e:  # noqa: BLE001
        got, right, good = str(e), None, False
    print(f"Prüfung {cc}: Land {sorted(map(str, got)) if isinstance(got, set) else got}, rechts {right}, {'ok' if good else 'FEHLER'}")
    ok &= good

try:
    r = post("route", {"locations": [{"lat": 48.5734, "lon": 7.7521}, {"lat": 48.4060, "lon": 7.4500}],
                       "costing": "auto", "language": "de-DE"})
    ra = [m["instruction"] for m in r["trip"]["legs"][0]["maneuvers"] if m["type"] == 26]
    good = any("1. Ausfahrt" in t for t in ra)
    print(f"Prüfung Kreisverkehr Obernai: {'ok' if good else 'FEHLER'} ({len(ra)} Kreisverkehre)")
    ok &= good
except Exception as e:  # noqa: BLE001
    print(f"Prüfung Kreisverkehr Obernai: FEHLER {e}")
    ok = False

sys.exit(0 if ok else 1)
