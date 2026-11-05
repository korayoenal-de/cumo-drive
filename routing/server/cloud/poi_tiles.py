#!/usr/bin/env python3
"""POI Kacheln für "Stopps an der Strecke" aus einem osmium geojsonseq Export bauen.

Aufruf: python3 poi_tiles.py EINGABE.geojsonseq AUSGABE_ORDNER
Nur Standardbibliothek. Schreibt AUSGABE_ORDNER/{kind}/{x}_{y}.json (Kacheln zu 0,1 Grad,
x = floor(lon*10), y = floor(lat*10)) und AUSGABE_ORDNER/meta.json.

Eintrag je POI: {"i": "n123", "n": Name, "la": Breite, "lo": Länge, "d": {...}} und bei Tankstellen
"p": 1, wenn Super Plus nur über die Marke vermutet wird (kein fuel:octane_98/100 eingetragen).
Kurzschlüssel in d: b Marke, op Betreiber, o Oktan (98 oder 100), h Öffnungszeiten, c Küche, e Höhe.
"""
import json
import math
import os
import re
import sys
import time

# wie PREMIUM_BRANDS in app/src/lib/stops-along.ts
PREMIUM_BRANDS = 'Shell|Aral|Esso|OMV|TotalEnergies|Total|BP|Agip|Eni|Q8|Tamoil|Avia|Jet|Migrol|Coop|Socar|Eni Station'
PREMIUM_RE = re.compile(f'^({PREMIUM_BRANDS})$', re.IGNORECASE)
PARK_RADIUS_M = 300.0
GRID = 0.01  # Rasterzelle für die Parkplatzsuche in Grad


def rep_point(geom):
    """Ein Punkt je Objekt: Punkt selbst, sonst Mittel der (äußeren) Stützpunkte."""
    t = geom.get('type')
    c = geom.get('coordinates')
    if not c:
        return None
    if t == 'Point':
        return c[0], c[1]
    if t == 'LineString':
        pts = c[:-1] if len(c) > 2 and c[0] == c[-1] else c
    elif t == 'Polygon':
        pts = c[0][:-1] or c[0]
    elif t == 'MultiPolygon':
        pts = c[0][0][:-1] or c[0][0]
    elif t == 'MultiLineString':
        pts = c[0]
    else:
        return None
    if not pts:
        return None
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def vertices(geom, limit=40):
    """Stützpunkte eines Parkplatzes (ausgedünnt), damit große Flächen am Rand gefunden werden."""
    t = geom.get('type')
    c = geom.get('coordinates')
    if t == 'Polygon':
        pts = c[0]
    elif t == 'MultiPolygon':
        pts = [p for poly in c for p in poly[0]]
    elif t == 'LineString':
        pts = c
    else:
        return []
    if len(pts) > limit:
        k = math.ceil(len(pts) / limit)
        pts = pts[::k]
    return [(p[0], p[1]) for p in pts]


def dist_m(lo1, la1, lo2, la2):
    x = math.radians(lo2 - lo1) * math.cos(math.radians((la1 + la2) / 2))
    y = math.radians(la2 - la1)
    return 6371000.0 * math.hypot(x, y)


def short(v, n=80):
    return v[:n] if isinstance(v, str) else None


def main():
    src, out = sys.argv[1], sys.argv[2]
    t0 = time.time()
    seen = set()
    tank, view, food, cafe = [], [], [], []
    parking = {}  # Rasterzelle -> Liste (lon, lat)
    n_lines = 0
    with open(src, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip().lstrip('\x1e')
            if not line:
                continue
            n_lines += 1
            if n_lines % 500000 == 0:
                print(f'  {n_lines} Objekte gelesen', flush=True)
            try:
                feat = json.loads(line)
            except ValueError:
                continue
            fid = str(feat.get('id', ''))
            if fid.startswith('a') and fid[1:].isdigit():
                # osmium Flächen: gerade Nummer = Weg id * 2, ungerade = Relation id * 2 + 1
                n = int(fid[1:])
                fid = f'w{n // 2}' if n % 2 == 0 else f'r{n // 2}'
            if fid and fid in seen:
                continue  # geschlossene Wege kommen als Linie und als Fläche
            tags = feat.get('properties') or {}
            geom = feat.get('geometry') or {}
            amenity = tags.get('amenity')
            if amenity == 'parking':
                if fid:
                    seen.add(fid)
                pts = vertices(geom)
                rp = rep_point(geom)
                if rp:
                    pts.append(rp)
                for lo, la in pts:
                    parking.setdefault((math.floor(lo / GRID), math.floor(la / GRID)), []).append((lo, la))
                continue
            kind = None
            if amenity == 'fuel':
                kind = 'tank'
            elif tags.get('tourism') == 'viewpoint':
                kind = 'aussicht'
            elif amenity == 'restaurant' and tags.get('name'):
                kind = 'mittag'
            elif amenity == 'cafe' and tags.get('name'):
                kind = 'kaffee'
            if not kind:
                continue
            rp = rep_point(geom)
            if not rp:
                continue
            if fid:
                seen.add(fid)
            lo, la = rp
            o = {'i': fid, 'la': round(la, 5), 'lo': round(lo, 5)}
            name = tags.get('name')
            d = {}
            if kind == 'tank':
                if tags.get('fuel:octane_100') == 'yes':
                    d['o'] = 100
                elif tags.get('fuel:octane_98') == 'yes':
                    d['o'] = 98
                elif PREMIUM_RE.match(tags.get('brand', '')):
                    o['p'] = 1
                else:
                    continue
                if tags.get('brand'):
                    d['b'] = short(tags['brand'], 40)
                elif tags.get('operator'):
                    d['op'] = short(tags['operator'], 40)
                name = name or tags.get('brand')
            elif kind == 'aussicht':
                if tags.get('ele'):
                    d['e'] = short(tags['ele'], 10)
            else:
                if tags.get('cuisine'):
                    d['c'] = short(tags['cuisine'], 40)
            if tags.get('opening_hours') and kind != 'aussicht':
                d['h'] = short(tags['opening_hours'])
            if name:
                o['n'] = short(name, 80)
            if d:
                o['d'] = d
            {'tank': tank, 'aussicht': view, 'mittag': food, 'kaffee': cafe}[kind].append(o)
    print(f'  {n_lines} Objekte gelesen, {len(parking)} Rasterzellen mit Parkplätzen', flush=True)

    def has_parking(o):
        gx, gy = math.floor(o['lo'] / GRID), math.floor(o['la'] / GRID)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for lo, la in parking.get((gx + dx, gy + dy), ()):
                    if dist_m(o['lo'], o['la'], lo, la) <= PARK_RADIUS_M:
                        return True
        return False

    view = [o for o in view if has_parking(o)]
    counts = {}
    tiles = 0
    for kind, items in (('tank', tank), ('aussicht', view), ('mittag', food), ('kaffee', cafe)):
        buckets = {}
        for o in items:
            buckets.setdefault((math.floor(o['lo'] * 10), math.floor(o['la'] * 10)), []).append(o)
        os.makedirs(os.path.join(out, kind), exist_ok=True)
        for (x, y), arr in buckets.items():
            with open(os.path.join(out, kind, f'{x}_{y}.json'), 'w', encoding='utf-8') as f:
                json.dump(arr, f, ensure_ascii=False, separators=(',', ':'))
        counts[kind] = {'pois': len(items), 'tiles': len(buckets)}
        tiles += len(buckets)
        print(f'  {kind}: {len(items)} Stopps in {len(buckets)} Kacheln', flush=True)
    meta = {
        'version': 1,
        'built': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'tile_deg': 0.1,
        'counts': counts,
        'seconds': round(time.time() - t0, 1),
    }
    with open(os.path.join(out, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
    print(f'  {tiles} Kacheln geschrieben in {meta["seconds"]} s', flush=True)


if __name__ == '__main__':
    main()
