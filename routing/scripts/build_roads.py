"""Strecken Pipeline: kuratierte Strecken aus routing/data/roads mit Valhalla routen, pruefen,
doppelte zusammenfuehren, ausduennen und als app/src/data/curated-roads.json schreiben.

Aufruf: python3 routing/scripts/build_roads.py   (Bericht danach in routing/scripts/report.json)
Was die Pruefung nicht besteht (Laenge, Stichstrasse, kein Weg), steht im Bericht und wird weggelassen.
"""
import glob, hashlib, json, math, os, re, ssl, sys, time, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = f'{ROOT}/routing/data/roads'
OUT = f'{ROOT}/app/src/data/curated-roads.json'
SCR = os.path.dirname(os.path.abspath(__file__))
# Antworten von Valhalla werden zwischengespeichert, damit ein erneuter Lauf schnell ist (nicht im Repo)
CACHE = f'{SCR}/.cache'
os.makedirs(CACHE, exist_ok=True)
URL = 'https://valhalla1.openstreetmap.de/route'
CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt') if os.path.exists('/root/.ccr/ca-bundle.crt') else None
STEP = int(os.environ.get('STEP', '400'))

def hv(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))

def length(line):
    return sum(hv(line[i - 1], line[i]) for i in range(1, len(line)))

def decode6(s):
    out, idx, lat, lon = [], 0, 0, 0
    while idx < len(s):
        vals = []
        for _ in range(2):
            shift = res = 0
            while True:
                b = ord(s[idx]) - 63; idx += 1
                res |= (b & 0x1f) << shift; shift += 5
                if b < 0x20: break
            vals.append(~(res >> 1) if res & 1 else res >> 1)
        lat += vals[0]; lon += vals[1]
        out.append((lat / 1e6, lon / 1e6))
    return out

last_call = [0.0]
def route(locs):
    body = {'locations': locs, 'costing': 'auto', 'shape_format': 'polyline6', 'directions_type': 'none'}
    key = hashlib.sha1(json.dumps(body, sort_keys=True).encode()).hexdigest()
    path = f'{CACHE}/{key}.json'
    if os.path.exists(path):
        return json.load(open(path))
    for attempt in range(4):
        wait = 1.1 - (time.time() - last_call[0])
        if wait > 0: time.sleep(wait)
        last_call[0] = time.time()
        req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
                data = json.load(r)
            break
        except urllib.error.HTTPError as e:
            txt = e.read().decode(errors='replace')
            if e.code == 400:
                data = {'error': txt}
                break
            time.sleep(3 + attempt * 3)
            data = {'error': f'HTTP {e.code} {txt[:200]}'}
        except Exception as e:  # Netz
            time.sleep(3 + attempt * 3)
            data = {'error': str(e)}
    json.dump(data, open(path, 'w'))
    return data

def route_chunked(locs):
    """Valhalla erlaubt hoechstens 10 Orte je Anfrage: in Stuecken routen und zusammensetzen."""
    if len(locs) <= 10: return route(locs)
    legs = []
    i = 0
    while i < len(locs) - 1:
        part = [dict(l) for l in locs[i:i + 10]]
        part[0]['type'] = part[-1]['type'] = 'break'
        d = route(part)
        if 'trip' not in d: return d
        legs += d['trip']['legs']
        i += 9
    return {'trip': {'legs': legs}}

def shape_of(data):
    pts = []
    for leg in data['trip']['legs']:
        s = decode6(leg['shape'])
        pts.extend(s if not pts else s[1:])
    return pts

def resample(line, step):
    """Punkte im Abstand step entlang der Linie (interpoliert), fuer die Pruefungen."""
    out = [line[0]]; carry = 0.0
    for i in range(1, len(line)):
        a, b = line[i - 1], line[i]
        d = hv(a, b)
        t = step - carry
        while t <= d:
            f = t / d
            out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
            t += step
        carry = (carry + d) % step if d else carry
    if out[-1] != line[-1]: out.append(line[-1])
    return out

def thin(line, step):
    """Echte Stuetzpunkte der Linie, etwa alle step Meter (keine Abkuerzung durch Interpolation)."""
    out = [line[0]]; acc = 0.0
    for i in range(1, len(line)):
        acc += hv(line[i - 1], line[i])
        if acc >= step:
            out.append(line[i]); acc = 0.0
    if out[-1] != line[-1]:
        if hv(out[-1], line[-1]) < step * 0.3 and len(out) > 1: out[-1] = line[-1]
        else: out.append(line[-1])
    return out

def heading(a, b):
    k = math.cos(math.radians(a[0]))
    return math.degrees(math.atan2(b[0] - a[0], (b[1] - a[1]) * k))

def problems(line):
    """Stichstrassen (gleiche Strecke hin und zurueck) und kleine Schleifen."""
    P = resample(line, 25)
    n = len(P)
    hd = [heading(P[i], P[i + 1]) for i in range(n - 1)] + [0]
    back = [False] * n
    loops = []
    grid = {}
    for i, p in enumerate(P):
        grid.setdefault((int(p[0] / 0.0002), int(p[1] / 0.0003)), []).append(i)
    for i in range(n):
        gx, gy = int(P[i][0] / 0.0002), int(P[i][1] / 0.0003)
        cand = sorted(j for dx in (-1, 0, 1) for dy in (-1, 0, 1) for j in grid.get((gx + dx, gy + dy), ()) if j >= i + 12)
        for j in cand:  # mehr als 300 m weiter entlang
            d = hv(P[i], P[j])
            if d < 15:
                dh = abs((hd[i] - hd[j] + 180) % 360 - 180)
                if dh > 150: back[i] = back[j] = True
                elif j - i < 160 and dh < 60: loops.append((i, j))  # zurueck an dieselbe Stelle binnen 4 km
    # laengster Lauf doppelt befahrener Punkte
    run = best = 0; where = None; cur = 0
    for i, b in enumerate(back):
        if b:
            if run == 0: cur = i
            run += 1
            if run > best: best, where = run, cur
        else: run = 0
    spur_m = best * 25 / 2  # hin und zurueck zaehlen beide Haelften
    res = []
    if spur_m >= 200: res.append(('stich', round(spur_m), P[where + best // 2] if where is not None else None))
    if loops:
        i, j = loops[0]
        res.append(('schleife', (j - i) * 25, P[i]))
    return res

def seg_dist(p, a, b):
    k = math.cos(math.radians(p[0])) * 111320
    ax, ay = (a[1] - p[1]) * k, (a[0] - p[0]) * 110540
    bx, by = (b[1] - p[1]) * k, (b[0] - p[0]) * 110540
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = max(0, min(1, -(ax * dx + ay * dy) / l2)) if l2 > 0 else 0
    return math.hypot(ax + t * dx, ay + t * dy)

def share_near(A, B, m=150):
    """Anteil der Punkte von A, die hoechstens m neben der Linie B liegen."""
    s = min(p[0] for p in B) - 0.01; n = max(p[0] for p in B) + 0.01
    w = min(p[1] for p in B) - 0.015; e = max(p[1] for p in B) + 0.015
    hit = 0
    for p in A:
        if not (s < p[0] < n and w < p[1] < e): continue
        if any(seg_dist(p, B[i], B[i + 1]) <= m for i in range(len(B) - 1)): hit += 1
    return hit / len(A)

# ---------- kurze Unterzeile ----------
GENERIC = {'Straße', 'Bundesstraße', 'Landesstraße', 'Kurvenstraße', 'Bergstraße', 'Alpenstraße'}
def short_note(e, kind):
    note = (e.get('note') or '').strip()
    low = note.lower()
    if kind == 'rallye':
        return 'Rallyestrecke'
    if kind == 'bergrennen':
        return 'historische Bergrennstrecke' if ('histor' in low or 'älteste' in low) else 'Bergrennstrecke'
    if e['kind'] == 'pass':
        w = re.findall(r'[A-ZÄÖÜ][\wäöüß]*stra(?:ß|ss)e', note)
        if w and w[0] in ('Hochalpenstraße', 'Pflasterstraße', 'Panoramastraße'): return w[0]
        return 'Passstraße'
    if 'rennstrecke' in low or 'grand prix' in low:
        return 'historische Rennstrecke'
    if 'mille miglia' in low:
        return 'Mille Miglia Strecke'
    words = re.findall(r'[A-ZÄÖÜ][\wäöüß]*(?:straße|strecke)\b', note)
    words = [x for x in words if x not in ('Strecke',)]
    if words:
        w = words[0]
        if w in ('Straße', 'Bundesstraße', 'Landesstraße', 'Kurvenstraße'): return 'Kurvenstrecke'
        if w == 'Bergstrecke': return 'Bergstrecke'
        if w == 'Vogelsbergstraße': return 'Kurvenstrecke'
        if w == 'Felsküstenstraße': return 'Küstenstraße'
        if w == 'Mautstraße': return 'Panoramastraße'
        if w == 'Talstrecke': return 'Talstraße'
        if w == 'Genießerstrecke': return 'Genießerstrecke'
        return w
    if kind == 'aussicht':
        return 'Panoramastraße'
    if 'tal' in low or 'schlucht' in low: return 'Talstraße'
    return 'Kurvenstrecke'

# ---------- Ablauf ----------
entries = []
for f in sorted(glob.glob(f'{SRC}/*.json')):
    for e in json.load(open(f)):
        e['_file'] = os.path.basename(f)
        entries.append(e)

skipped, built = [], []
SKIP = {'fr-turckheim-trois-epis'}  # Bergrennen nicht belegt, von Koray offen gelassen
for n, e in enumerate(entries):
    if e['id'] in SKIP: continue
    tag = f"{e['_file']}:{e['id']}"
    fr, to = e.get('from'), e.get('to')
    if e['kind'] == 'pass' and (not to or hv((fr['lat'], fr['lon']), (to['lat'], to['lon'])) < 300 and not e.get('via')):
        skipped.append((tag, 'Pass ohne Strecke'))
        continue
    vias = list(e.get('via') or [])
    note_retry = ''
    for attempt in range(3):
        locs = [{'lat': fr['lat'], 'lon': fr['lon'], 'type': 'break'}]
        locs += [{'lat': v['lat'], 'lon': v['lon'], 'type': 'through'} for v in vias]
        locs += [{'lat': to['lat'], 'lon': to['lon'], 'type': 'break'}]
        data = route_chunked(locs)
        if 'trip' not in data:
            reason = f"kein Weg ({str(data.get('error'))[:80]})"
            line = None
            break
        line = shape_of(data)
        probs = problems(line)
        if not probs:
            reason = None
            break
        reason = ', '.join(f'{k} {m} m' for k, m, _ in probs)
        # Zwischenort am Problem weglassen und neu rechnen
        if not vias: break
        at = probs[0][2]
        k = min(range(len(vias)), key=lambda i: hv(at, (vias[i]['lat'], vias[i]['lon'])))
        if hv(at, (vias[k]['lat'], vias[k]['lon'])) > 3000: break
        note_retry += f" ohne {vias[k]['name']}"
        vias = vias[:k] + vias[k + 1:]
    if reason:
        skipped.append((tag, reason + (f' (auch{note_retry})' if note_retry else '')))
        continue
    km = length(line) / 1000
    if e.get('length_km'):
        r = km / e['length_km']
        if not (0.6 <= r <= 1.5):
            skipped.append((tag, f"Länge {km:.1f} km statt {e['length_km']} km (Faktor {r:.2f})"))
            continue
    step = STEP
    while True:
        t = thin(line, step)
        if length(t) >= 0.85 * length(line) or step <= 100: break
        step //= 2
    kind = 'strecke' if e['kind'] == 'pass' else e['kind']
    built.append({
        'id': e['id'], 'name': e['name'], 'kind': kind, 'tier': e['tier'],
        'note': short_note(e, kind), 'level': max(1, min(5, int(e.get('quality') or 3))), 'country': e.get('country') or {'fr.json': 'FR', 'it.json': 'IT', 'de.json': 'DE'}.get(e['_file'], '??'),
        'line': [[round(a, 5), round(b, 5)] for a, b in t],
        '_km': km, '_full': resample(line, 100), '_q': e.get('quality') or 0, '_file': e['_file'],
        '_pass': e['kind'] == 'pass', '_retry': note_retry.strip(), '_step': step,
    })
    print(f'{n + 1}/{len(entries)} {tag} {km:.1f} km {len(t)} Punkte{" " + note_retry if note_retry else ""}', flush=True)

# Doppelte ueber Dateien hinweg: gegenseitig zu mindestens 70 % deckungsgleich
built.sort(key=lambda r: (r['tier'] != 'highlight', -r['_q'], -r['_km']))
kept, dups = [], []
for r in built:
    twin = next((k for k in kept if share_near(r['_full'], k['_full']) >= 0.7 and share_near(k['_full'], r['_full']) >= 0.7), None)
    if twin: dups.append((f"{r['_file']}:{r['id']}", f"doppelt zu {twin['_file']}:{twin['id']}"))
    else: kept.append(r)

# Paesse mit eigener Strecke: Passhoehe aus passes.json auf der Linie, dann nur bevorzugen
passes = json.load(open(f'{ROOT}/app/src/data/passes.json'))
demoted = []
for r in kept:
    if r['_pass'] and r['tier'] == 'highlight':
        hit = [p for p in passes if any(hv((p['lat'], p['lon']), q) < 1500 for q in r['_full'])]
        if hit:
            r['tier'] = 'prefer'
            demoted.append((r['id'], hit[0]['id']))

order = {'DE': 0, 'AT': 1, 'CH': 2, 'IT': 3, 'FR': 4, 'SI': 5}
kept.sort(key=lambda r: (order.get(r['country'], 9), r['tier'] != 'highlight', r['id']))
out = [{k: v for k, v in r.items() if not k.startswith('_')} for r in kept]
txt = '[\n' + ',\n'.join(json.dumps(o, ensure_ascii=False, separators=(',', ':')) for o in out) + '\n]\n'
open(OUT, 'w').write(txt)
json.dump({'skipped': skipped, 'dups': dups, 'demoted': demoted,
           'retry': [(r['id'], r['_retry']) for r in kept if r['_retry']],
           'steps': [(r['id'], r['_step']) for r in kept if r['_step'] != STEP]},
          open(f'{SCR}/report.json', 'w'), ensure_ascii=False, indent=1)
print('geschrieben', len(out), os.path.getsize(OUT), 'Bytes; übersprungen', len(skipped), 'doppelt', len(dups), 'Pässe nur bevorzugt', len(demoted))
