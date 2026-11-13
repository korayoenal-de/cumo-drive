#!/usr/bin/env python3
"""Datencheck Rest (13.11.): jede kuratierte Strecke mit dem Sportwagen Profil eng entlang ihrer eigenen Linie.

Am 12.11. wurde jede Strecke nur von Anfang bis Ende geplant; wich der Weg ab, stand sie unter Verdacht
(50 Strecken), ohne dass klar war, warum. Hier zwingen Stützpunkte alle 1,2 km den Weg auf die Linie. Dann zeigt
sich, ob das Profil der Linie folgen kann und was dort liegt:

  ratio      geplante Länge durch die Länge der Linie (1,0 heißt: folgt ihr)
  snap_m     größter Abstand eines Stützpunkts zur nächsten Straße, die das Profil fahren darf
  schnell    Anteil Autobahn und Kraftfahrstraße (motorway, trunk)
  anlieger   Meter mit Anlieger frei (road_access destination)
  schotter   Meter ohne festen Belag
  eng        Meter mit erlaubter Breite unter 3 m

Urteil: gut, neu_ziehen (Linie liegt neben der Straße, der geplante Weg ist die bessere Linie), schnell,
anlieger, raus (Schotter oder das Profil kommt nicht durch) und pruefen (alles andere).
Aufruf: python3 check3.py [GH] > ergebnis.json (GH Standard: Server 1). Nur lesende Abfragen.
"""
import json, math, sys, urllib.request, urllib.error, concurrent.futures as cf, os

GH = sys.argv[1] if len(sys.argv) > 1 else 'https://13-140-213-164.sslip.io'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
BAD_SURF = {'unpaved', 'compacted', 'fine_gravel', 'gravel', 'ground', 'dirt', 'grass', 'sand', 'wood'}
STEP_M = 1200


def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742000 * math.asin(math.sqrt(h))


def length(line):
    return sum(hav(line[i - 1], line[i]) for i in range(1, len(line)))


def probes(line):
    out, acc = [line[0]], 0.0
    for i in range(1, len(line)):
        acc += hav(line[i - 1], line[i])
        if acc >= STEP_M:
            out.append(line[i])
            acc = 0.0
    if out[-1] != line[-1]:
        out.append(line[-1])
    return out


def post(body):
    req = urllib.request.Request(GH + '/route', json.dumps(body).encode(), {'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return json.load(e)
        except Exception:
            return {'message': str(e)}
    except Exception as e:
        return {'message': str(e)}


def check(r):
    line = r['line']
    pts = probes(line)
    res = post({'points': [[p[1], p[0]] for p in pts], 'profile': 'sportwagen', 'points_encoded': False, 'instructions': False,
                'details': ['road_class', 'road_access', 'surface', 'max_width']})
    base = {'id': r['id'], 'name': r['name'], 'tier': r['tier'], 'level': r.get('level'), 'country': r.get('country'), 'line_km': round(length(line) / 1000, 1)}
    if 'paths' not in res:
        return {**base, 'urteil': 'raus', 'grund': f"nicht planbar: {res.get('message', '')[:120]}"}
    p = res['paths'][0]
    coords = [(c[1], c[0]) for c in p['points']['coordinates']]
    cum = [0.0]
    for i in range(1, len(coords)):
        cum.append(cum[-1] + hav(coords[i - 1], coords[i]))
    tot = cum[-1] or 1

    def meters(key, pred):
        return sum(cum[t] - cum[f] for f, t, v in p.get('details', {}).get(key, []) if pred(v))

    snapped = [(c[1], c[0]) for c in p.get('snapped_waypoints', {}).get('coordinates', [])]
    snap = max((hav(a, b) for a, b in zip(pts, snapped)), default=0)
    m = {
        'ratio': round(tot / max(1, length(line)), 2),
        'snap_m': round(snap),
        'schnell': round(meters('road_class', lambda v: v in ('motorway', 'trunk')) / tot, 2),
        'anlieger': round(meters('road_access', lambda v: str(v).lower() in ('destination', 'private', 'delivery'))),
        'schotter': round(meters('surface', lambda v: str(v).lower() in BAD_SURF)),
        'eng': round(meters('max_width', lambda v: isinstance(v, (int, float)) and v < 3)),
        'route': [[round(a, 5), round(b, 5)] for a, b in coords],
    }
    if m['schotter'] > 1000:
        u, g = 'raus', f"{m['schotter']} m ohne festen Belag"
    elif m['ratio'] > 1.4:
        u, g = 'raus', f"das Profil kommt nicht durch (Weg {m['ratio']} fach der Linie)"
    elif m['schnell'] > 0.25:
        u, g = 'schnell', f"{round(m['schnell'] * 100)} Prozent Autobahn oder Kraftfahrstraße"
    elif m['anlieger'] > 500:
        u, g = 'anlieger', f"{m['anlieger']} m Anlieger frei"
    elif m['ratio'] <= 1.1 and m['snap_m'] <= 80:
        u, g = 'gut', ''
    elif m['ratio'] <= 1.2:
        u, g = 'neu_ziehen', f"Linie liegt bis {m['snap_m']} m neben der Straße, Weg {m['ratio']} fach"
    else:
        u, g = 'pruefen', f"Weg {m['ratio']} fach, Stützpunkt bis {m['snap_m']} m neben der Straße"
    return {**base, **m, 'urteil': u, 'grund': g}


def main():
    roads = json.load(open(f'{ROOT}/app/src/data/curated-roads.json'))
    extra = os.environ.get('EXTRA')
    if extra:
        roads += json.load(open(extra))
    with cf.ThreadPoolExecutor(3) as ex:
        out = list(ex.map(check, roads))
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
