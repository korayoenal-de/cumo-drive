"""Erzeugt aus einem Etappen Check eine kompakte Tour für die App.

Aufruf: python3 -I export_sample.py <route.gpx> <ergebnis.json> <ausgabe.json> <name>

Ausgabe: Wegpunkte (aus den GPX wpt), Linie als Läufe gleicher Klasse (ok, pruefen, raus),
und die zusammengefassten Warnungen. Punkte werden ausgedünnt (mindestens 25 m Abstand).
"""
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_map import merge_rows, runs  # noqa: E402

NS = {"g": "http://www.topografix.com/GPX/1/1"}


def hav(a, b):
    r = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(d))


def thin(points, min_m=25):
    out = [points[0]]
    for p in points[1:-1]:
        if hav(out[-1], p) >= min_m:
            out.append(p)
    out.append(points[-1])
    return out


def main():
    gpx, res, out, name = sys.argv[1:5]
    r = json.load(open(res))
    root = ET.parse(gpx).getroot()
    wpts = [[float(w.get("lat")), float(w.get("lon"))] for w in root.findall("g:wpt", NS)]
    line = [{"c": x["c"], "p": [[round(a, 5), round(b, 5)] for a, b in thin(x["p"])]} for x in runs(r["linie"])]

    def warn(s):
        return {"klasse": s["klasse"], "start_km": round(s["start_km"], 1), "laenge_km": s["laenge_km"],
                "name": s["name"], "ort": s["ort"].split(" (")[0],
                "gruende": [g for g in s["gruende"]][:4], "mitte": s["mitte"]}

    data = {
        "name": name,
        "laenge_km": r["laenge_km"],
        "km_je_klasse": r["km_je_klasse"],
        "wegpunkte": wpts,
        "linie": line,
        "warnungen": [warn(s) for s in merge_rows(r["abschnitte"], "raus")]
        + [warn(s) for s in merge_rows(r["abschnitte"], "pruefen", 0.5)],
    }
    with open(out, "w") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(out, os.path.getsize(out), "Bytes,", sum(len(x["p"]) for x in line), "Punkte")


if __name__ == "__main__":
    main()
