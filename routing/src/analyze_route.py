"""Legt eine GPX Route auf OSM Daten und bewertet jeden Abschnitt für Sportwagen.

Aufruf: python3 -I analyze_route.py <route.gpx> <osm_kachelordner> <ausgabe.json>

Vorgehen: Zwischen zwei aufeinanderfolgenden Routenpunkten wird der kürzeste Weg im
OSM Netz gesucht (calimoto Punkte liegen meist unter 1 km auseinander). So entsteht die
tatsächlich gefahrene Straßenfolge mit allen Tags. Jede Kante bekommt eine Klasse:
ok, pruefen oder raus (siehe classify).
"""
import glob
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

import networkx as nx

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpx import read_points  # noqa: E402

DRIVABLE = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified",
    "residential", "living_street", "service", "road", "track",
}
NON_MOTOR = {"path", "cycleway", "footway", "bridleway", "pedestrian", "steps"}
UNPAVED = {
    "unpaved", "gravel", "fine_gravel", "compacted", "dirt", "earth", "ground", "grass",
    "mud", "sand", "pebblestone", "rock", "woodchips", "grass_paver",
}
BAD_SMOOTH = {"bad", "very_bad", "horrible", "very_horrible", "impassable"}


def hav(a, b):
    r = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(d))


def load(folder):
    nodes, ways, places = {}, {}, []
    for f in glob.glob(os.path.join(folder, "*.osm")):
        root = ET.parse(f).getroot()
        for el in root:
            if el.tag == "node":
                nid = int(el.get("id"))
                nodes[nid] = (float(el.get("lat")), float(el.get("lon")))
                tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
                if tags.get("place") in ("village", "town", "city", "hamlet") and "name" in tags:
                    places.append((nodes[nid], tags["name"], tags["place"]))
            elif el.tag == "way":
                tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
                if "highway" not in tags:
                    continue
                ways[int(el.get("id"))] = ([int(n.get("ref")) for n in el.findall("nd")], tags)
    return nodes, ways, places


def classify(tags):
    """Gibt (klasse, gründe) zurück. klasse: ok, pruefen, raus."""
    hw = tags.get("highway", "")
    reasons = []
    if hw in NON_MOTOR:
        reasons.append(f"highway={hw} (kein Autoweg)")
    if hw == "track":
        reasons.append("highway=track (Wirtschafts oder Waldweg)")
    if tags.get("surface") in UNPAVED:
        reasons.append(f"surface={tags['surface']}")
    if tags.get("tracktype") in ("grade2", "grade3", "grade4", "grade5"):
        reasons.append(f"tracktype={tags['tracktype']}")
    if tags.get("smoothness") in BAD_SMOOTH:
        reasons.append(f"smoothness={tags['smoothness']}")
    for k in ("motor_vehicle", "motorcar", "vehicle", "access"):
        if tags.get(k) in ("no", "private", "forestry", "agricultural"):
            reasons.append(f"{k}={tags[k]}")
            break
    try:
        w = float(tags.get("width", "").replace(",", ".").split()[0])
        if w < 3.5:
            reasons.append(f"width={w:g} m")
    except (ValueError, IndexError):
        pass
    if reasons:
        return "raus", reasons
    soft = []
    if hw in ("unclassified", "residential", "service", "road") and "surface" not in tags:
        soft.append(f"highway={hw} ohne Belagsangabe")
    if hw == "service":
        soft.append("highway=service")
    if tags.get("lanes") == "1" or tags.get("lane_markings") == "no":
        soft.append("einspurig oder ohne Mittellinie")
    if soft:
        return "pruefen", soft
    return "ok", []


def build_graph(nodes, ways):
    g = nx.Graph()
    for wid, (nds, tags) in ways.items():
        hw = tags["highway"]
        if hw not in DRIVABLE and hw not in NON_MOTOR:
            continue
        # Fußwege und Treppen leicht teurer, damit sie nur gewählt werden, wenn die Route dort liegt
        factor = 1.6 if hw in ("footway", "steps", "pedestrian") else 1.0
        for a, b in zip(nds, nds[1:]):
            if a in nodes and b in nodes:
                d = hav(nodes[a], nodes[b])
                g.add_edge(a, b, length=d, cost=d * factor, way=wid)
    return g


class Grid:
    def __init__(self, nodes, ids, cell=0.002):
        self.cell, self.nodes, self.idx = cell, nodes, {}
        for n in ids:
            la, lo = nodes[n]
            self.idx.setdefault((int(la / cell), int(lo / cell)), []).append(n)

    def nearest(self, p, rings=3):
        cy, cx = int(p[0] / self.cell), int(p[1] / self.cell)
        best, bd = None, 1e18
        for r in range(rings + 1):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    if max(abs(dy), abs(dx)) != r:
                        continue
                    for n in self.idx.get((cy + dy, cx + dx), ()):
                        d = hav(p, self.nodes[n])
                        if d < bd:
                            best, bd = n, d
            if best is not None and r >= 1:
                break
        return best, bd


def main():
    gpx, folder, out = sys.argv[1:4]
    pts = read_points(gpx)
    nodes, ways, places = load(folder)
    g = build_graph(nodes, ways)
    grid = Grid(nodes, list(g.nodes))
    snapped = [grid.nearest(p) for p in pts]

    edges, gaps = [], []
    for i in range(len(pts) - 1):
        a, da = snapped[i]
        b, db = snapped[i + 1]
        if a is None or b is None or a == b:
            continue
        try:
            _, path = nx.bidirectional_dijkstra(g, a, b, weight="cost")
        except nx.NetworkXNoPath:
            gaps.append(i)
            continue
        straight = hav(pts[i], pts[i + 1])
        plen = sum(g[u][v]["length"] for u, v in zip(path, path[1:]))
        if straight > 50 and plen > 4 * straight + 500:
            gaps.append(i)  # Umweg, Abgleich unsicher
        for u, v in zip(path, path[1:]):
            edges.append((u, v, g[u][v]["way"], g[u][v]["length"]))

    # Abschnitte nach Klasse zusammenfassen
    km, sections, cur = 0.0, [], None
    stats = {"ok": 0.0, "pruefen": 0.0, "raus": 0.0}
    hw_km = {}
    line = []
    for u, v, wid, length in edges:
        tags = ways[wid][1]
        cls, reasons = classify(tags)
        stats[cls] += length
        hw_km[tags["highway"]] = hw_km.get(tags["highway"], 0) + length
        line.append({"a": nodes[u], "b": nodes[v], "c": cls})
        if cls != "ok":
            key = (cls, tuple(reasons))
            if cur and cur["key"] == key and abs(cur["end_km"] - km) < 0.05:
                cur["end_km"] = km + length / 1000
                cur["coords"].append(nodes[v])
                cur["ways"].add(wid)
            else:
                cur = {"key": key, "klasse": cls, "gruende": list(reasons), "start_km": km,
                       "end_km": km + length / 1000, "coords": [nodes[u], nodes[v]], "ways": {wid},
                       "name": tags.get("name") or tags.get("ref") or ""}
                sections.append(cur)
        km += length / 1000

    def near_place(p):
        best = min(places, key=lambda x: hav(p, x[0]), default=None)
        return f"{best[1]} ({hav(p, best[0]) / 1000:.1f} km)" if best else ""

    out_sections = []
    for s in sections:
        mid = s["coords"][len(s["coords"]) // 2]
        out_sections.append({
            "klasse": s["klasse"], "gruende": s["gruende"], "name": s["name"],
            "start_km": round(s["start_km"], 2), "laenge_km": round(s["end_km"] - s["start_km"], 2),
            "mitte": [round(mid[0], 5), round(mid[1], 5)], "ort": near_place(mid),
            "osm_ways": sorted(s["ways"]), "coords": [[round(a, 5), round(b, 5)] for a, b in s["coords"]],
        })

    result = {
        "route": os.path.basename(gpx), "punkte": len(pts), "kanten": len(edges),
        "laenge_km": round(km, 1), "abgleich_luecken": gaps,
        "km_je_klasse": {k: round(v / 1000, 2) for k, v in stats.items()},
        "km_je_highway": {k: round(v / 1000, 2) for k, v in sorted(hw_km.items(), key=lambda x: -x[1])},
        "abschnitte": out_sections, "linie": line,
    }
    with open(out, "w") as f:
        json.dump(result, f, ensure_ascii=False)
    print(json.dumps({k: result[k] for k in ("laenge_km", "km_je_klasse", "km_je_highway", "abgleich_luecken")}, ensure_ascii=False, indent=1))
    big = [s for s in out_sections if s["laenge_km"] >= 0.2 or s["klasse"] == "raus"]
    for s in big:
        print(f"{s['klasse']:7} km {s['start_km']:6.1f} +{s['laenge_km']:5.2f}  {s['name'][:28]:28} {s['ort'][:30]:30} {'; '.join(s['gruende'])}")


if __name__ == "__main__":
    main()
