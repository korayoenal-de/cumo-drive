#!/usr/bin/env python3
"""Wendet routing/data/roads/auswahl.json auf die kuratierten Strecken an (Datenprüfung 12.11.2026).

gestrichen und geparkt fliegen aus der App Datei, zusammengeführte Doppelte ebenfalls,
nur_bevorzugt wird nicht mehr angesagt, umbenannt und felder überschreiben einzelne Werte.
Aufruf allein: python3 routing/scripts/apply_auswahl.py (arbeitet auf app/src/data/curated-roads.json).
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEL = f'{ROOT}/routing/data/roads/auswahl.json'
OUT = f'{ROOT}/app/src/data/curated-roads.json'


def apply(roads):
    sel = json.load(open(SEL))
    drop = set(sel['gestrichen']) | set(sel['geparkt']) | set(sel['zusammengefuehrt'])
    # Doppelte id (Furkajoch stand zweimal drin): der angesagte Eintrag bleibt, sonst der mit der längeren Linie
    best = {}
    for r in roads:
        b = best.get(r['id'])
        if b is None or (r['tier'] == 'highlight', len(r['line'])) > (b['tier'] == 'highlight', len(b['line'])):
            best[r['id']] = r
    out = []
    for r in roads:
        if r['id'] in drop or best[r['id']] is not r:
            continue
        r = dict(r)
        if r['id'] in sel['nur_bevorzugt']:
            r['tier'] = 'prefer'
        if r['id'] in sel['umbenannt']:
            r['name'] = sel['umbenannt'][r['id']]
        if r['id'] in sel['felder']:
            line = r.pop('line')
            r.update(sel['felder'][r['id']])
            r['line'] = line
        out.append(r)
    return out


def write(roads):
    txt = '[\n' + ',\n'.join(json.dumps(o, ensure_ascii=False, separators=(',', ':')) for o in roads) + '\n]\n'
    open(OUT, 'w').write(txt)


if __name__ == '__main__':
    before = json.load(open(OUT))
    after = apply(before)
    write(after)
    print('vorher', len(before), 'nachher', len(after))
