"""Orte einer Strecken Liste mit Nominatim aufloesen und als Eintraege im Schema der Strecken Datenbank schreiben.

Aufruf: python3 routing/scripts/geocode_roads.py <specs.py> <ausgabe.json>
specs.py enthaelt eine Liste S mit (id, name, land, region, strassen, tier, qualitaet, notiz, km, [Orte], hinweise).
Nominatim erlaubt eine Anfrage pro Sekunde; Treffer werden in .geocache.json zwischengespeichert.
Danach unplausible Orte pruefen (Abstand gegen die angegebene Laenge) und die Datei nach routing/data/roads legen.
"""
import json, os, ssl, sys, time, urllib.parse, urllib.request, importlib.util
D = os.path.dirname(os.path.abspath(__file__))
CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt') if os.path.exists('/root/.ccr/ca-bundle.crt') else None
CACHE = f'{D}/.geocache.json'
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
CC = {'DE': 'de', 'AT': 'at', 'CH': 'ch', 'FR': 'fr', 'IT': 'it', 'SI': 'si'}
last = [0.0]
def geo(q, cc):
    k = f'{cc}|{q}'
    if k in cache: return cache[k]
    w = 1.1 - (time.time() - last[0])
    if w > 0: time.sleep(w)
    last[0] = time.time()
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': q, 'format': 'json', 'limit': 1, 'countrycodes': cc})
    req = urllib.request.Request(url, headers={'User-Agent': 'cumo-drive-roads/1.0'})
    try:
        r = json.load(urllib.request.urlopen(req, timeout=30, context=CTX))
    except Exception as e:
        print('ERR', q, e); return None
    v = {'lat': round(float(r[0]['lat']), 5), 'lon': round(float(r[0]['lon']), 5), 'dn': r[0]['display_name'][:80]} if r else None
    if v is None and cc in ('at', 'ch', 'si', 'it', 'fr', 'de'):
        # Grenzorte: ohne Länderfilter versuchen
        pass
    cache[k] = v
    json.dump(cache, open(CACHE, 'w'), ensure_ascii=False, indent=0)
    return v
spec_file = sys.argv[1]; out_file = sys.argv[2]
spec = importlib.util.spec_from_file_location('s', spec_file); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
out, miss = [], []
for (id_, name, land, region, roads, tier, q, note, km, places, cav) in m.S:
    pts = []
    for p in places:
        g = geo(p, CC[land])
        if not g:
            # Mangart, Grenzpunkte: auch Nachbarländer
            g = geo(p, 'at,ch,de,fr,it,si')
        if not g: miss.append((id_, p)); continue
        pts.append({'name': p.split(',')[0], 'lat': g['lat'], 'lon': g['lon']})
    if len(pts) < 2: miss.append((id_, 'zu wenig Orte')); continue
    out.append({'id': id_, 'name': name, 'country': land, 'region': region, 'kind': 'strecke', 'tier': tier, 'note': note,
                'roads': roads, 'from': pts[0], 'to': pts[-1], 'via': pts[1:-1], 'length_km': km, 'quality': q,
                'caveats': cav, 'sources': ['Kuratierte Liste von Koray, Nov 2026; Orte über Nominatim']})
json.dump(out, open(out_file, 'w'), ensure_ascii=False, indent=1)
print(len(out), 'Einträge; fehlend:', miss)
