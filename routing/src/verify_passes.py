#!/usr/bin/env python3
"""Prüft app/src/data/passes.json.

* Höhe am Punkt über den Valhalla Höhendienst (valhalla1.openstreetmap.de/height)
  gegen das Feld ele, Toleranz 80 m
* doppelte ids
* Koordinaten außerhalb der Länder Box (lat 42,3 bis 55, lon -2 bis 17, mit Frankreich inkl. Pyrenäen und Zentralmassiv)
* Pflichtfelder und erlaubte Werte

Aufruf:  python3 routing/src/verify_passes.py [pfad/zu/passes.json]
Exit Code 1, wenn mindestens ein Pass die Prüfung nicht besteht.
"""
import json
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path

HEIGHT_URL = "https://valhalla1.openstreetmap.de/height"
BATCH = 200
TOLERANCE_M = 80
BOX = {"lat": (42.3, 55.0), "lon": (-2.0, 17.0)}
TIERS = ("ikone", "bekannt", "mittel")
REQUIRED = ("id", "name", "names", "country", "region", "lat", "lon", "ele", "tier",
            "hairpins", "winter_closed", "closed_months", "toll", "car_note", "source")

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "app" / "src" / "data" / "passes.json"


def fetch_heights(points):
    """points: Liste von (lat, lon). Liefert Liste von Höhen (oder None)."""
    out = []
    for i in range(0, len(points), BATCH):
        chunk = points[i:i + BATCH]
        body = json.dumps({"shape": [{"lat": la, "lon": lo} for la, lo in chunk]}).encode()
        req = urllib.request.Request(HEIGHT_URL, data=body, headers={
            "Content-Type": "application/json",
            "User-Agent": "cumo-drive-verify-passes/1.0",
        })
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = json.load(r)
                break
            except Exception as exc:  # Netzfehler, kurz warten und nochmal
                if attempt == 3:
                    raise
                print(f"  Höhendienst Fehler ({exc}), neuer Versuch ...", file=sys.stderr)
                time.sleep(3 * (attempt + 1))
        heights = data.get("height", [])
        if len(heights) != len(chunk):
            raise RuntimeError(f"Höhendienst lieferte {len(heights)} statt {len(chunk)} Werte")
        out.extend(heights)
        time.sleep(1)
    return out


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    passes = json.loads(path.read_text(encoding="utf-8"))
    problems = []

    # Struktur
    for p in passes:
        missing = [k for k in REQUIRED if k not in p]
        if missing:
            problems.append((p.get("id", "?"), f"fehlende Felder: {', '.join(missing)}"))
        if p.get("tier") not in TIERS:
            problems.append((p.get("id", "?"), f"ungültiger tier: {p.get('tier')}"))

    # doppelte ids
    ids = Counter(p.get("id") for p in passes)
    for pid, n in ids.items():
        if n > 1:
            problems.append((pid, f"id {n} mal vorhanden"))

    # Box
    for p in passes:
        la, lo = p.get("lat"), p.get("lon")
        if not (isinstance(la, (int, float)) and isinstance(lo, (int, float))):
            problems.append((p.get("id"), "lat/lon fehlt oder keine Zahl"))
            continue
        if not (BOX["lat"][0] <= la <= BOX["lat"][1] and BOX["lon"][0] <= lo <= BOX["lon"][1]):
            problems.append((p["id"], f"Koordinate außerhalb der Box: {la}, {lo}"))

    # Höhe
    valid = [p for p in passes if isinstance(p.get("lat"), (int, float)) and isinstance(p.get("lon"), (int, float))]
    print(f"Frage Höhen für {len(valid)} Pässe ab ({HEIGHT_URL}) ...")
    heights = fetch_heights([(p["lat"], p["lon"]) for p in valid])
    height_ok = 0
    for p, h in zip(valid, heights):
        if h is None or p.get("ele") is None:
            problems.append((p["id"], f"keine Höhe (Daten {h}, ele {p.get('ele')})"))
            continue
        diff = h - p["ele"]
        if abs(diff) > TOLERANCE_M:
            problems.append((p["id"], f"Höhe Daten {h} m, ele {p['ele']} m, Abweichung {diff:+.0f} m"))
        else:
            height_ok += 1

    bad_ids = {pid for pid, _ in problems}
    ok_total = sum(1 for p in passes if p.get("id") not in bad_ids)

    if problems:
        print(f"\n{len(problems)} Befunde:")
        for pid, msg in problems:
            print(f"  {pid}: {msg}")
    else:
        print("\nKeine Befunde.")

    # Zusammenfassung
    print("\nZusammenfassung")
    print(f"  Pässe gesamt: {len(passes)}")
    by_country = Counter(c for p in passes for c in p.get("country", []))
    print("  je Land (Grenzpässe zählen in beiden Ländern): "
          + ", ".join(f"{c} {n}" for c, n in sorted(by_country.items(), key=lambda x: -x[1])))
    by_tier = Counter(p.get("tier") for p in passes)
    print("  je tier: " + ", ".join(f"{t} {by_tier.get(t, 0)}" for t in TIERS))
    for c in sorted(by_country):
        t = Counter(p["tier"] for p in passes if c in p.get("country", []))
        print(f"    {c}: " + ", ".join(f"{k} {t.get(k, 0)}" for k in TIERS))
    print(f"  Höhenprüfung ok: {height_ok} von {len(valid)} (Toleranz {TOLERANCE_M} m)")
    print(f"  alle Prüfungen ok: {ok_total} von {len(passes)}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
