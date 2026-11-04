"""Liest Punkte aus GPX Dateien (Routenpunkte, sonst Trackpunkte)."""
import xml.etree.ElementTree as ET

NS = {"g": "http://www.topografix.com/GPX/1/1"}


def read_points(path):
    root = ET.parse(path).getroot()
    pts = [(float(p.get("lat")), float(p.get("lon"))) for p in root.findall(".//g:rtept", NS)]
    if not pts:
        pts = [(float(p.get("lat")), float(p.get("lon"))) for p in root.findall(".//g:trkpt", NS)]
    # doppelte Punkte direkt hintereinander entfernen
    out = []
    for p in pts:
        if not out or abs(out[-1][0] - p[0]) > 1e-6 or abs(out[-1][1] - p[1]) > 1e-6:
            out.append(p)
    return out
