#!/usr/bin/env python3
# Datenprüfung CUMO DRIVE (12.11.): Pässe und kuratierte Strecken gegen den eigenen Graph.
import json, math, sys, urllib.request, urllib.error, concurrent.futures as cf
GH = 'http://localhost:8989'
DET = ['surface', 'track_type', 'road_class', 'road_access', 'max_width', 'urban_density', 'toll', 'road_environment']
BAD_SURF = {'unpaved','compacted','fine_gravel','gravel','ground','dirt','grass','sand','wood'}
def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 12742000 * math.asin(math.sqrt(h))
def post(body):
    req = urllib.request.Request(GH + '/route', json.dumps(body).encode(), {'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        try: return json.load(e)
        except Exception: return {'message': str(e)}
    except Exception as e: return {'message': str(e)}
def shares(path):
    pts = [(p[1], p[0]) for p in path['points']['coordinates']]
    cum = [0.0]
    for i in range(1, len(pts)): cum.append(cum[-1] + hav(pts[i-1], pts[i]))
    tot = cum[-1] or 1
    out = {}
    for k, iv in path.get('details', {}).items():
        d = {}
        for f, t, v in iv: d[str(v).lower() if not isinstance(v, (int, float)) or isinstance(v, bool) else v] = d.get(str(v).lower() if not isinstance(v,(int,float)) or isinstance(v,bool) else v, 0) + (cum[t]-cum[f])
        out[k] = d
    return out, tot
def summarize(sh, tot):
    s = {}
    surf = sh.get('surface', {}); s['unpaved_m'] = round(sum(v for k, v in surf.items() if k in BAD_SURF))
    s['cobble_m'] = round(sum(v for k, v in surf.items() if k in ('cobblestone','paving_stones')))
    tt = sh.get('track_type', {}); s['track_grade2plus_m'] = round(sum(v for k, v in tt.items() if k not in ('missing','grade1')))
    rc = sh.get('road_class', {}); s['track_m'] = round(rc.get('track', 0)); s['service_m'] = round(rc.get('service', 0))
    s['residential_m'] = round(rc.get('residential', 0) + rc.get('living_street', 0)); s['motorway_m'] = round(rc.get('motorway', 0) + rc.get('trunk', 0))
    s['unclassified_m'] = round(rc.get('unclassified', 0))
    ra = sh.get('road_access', {}); s['access'] = {k: round(v) for k, v in ra.items() if k not in ('yes','missing') and v > 20}
    mw = [k for k in sh.get('max_width', {}) if isinstance(k, (int, float))]; s['min_width'] = min(mw) if mw else None
    s['narrow_m'] = round(sum(v for k, v in sh.get('max_width', {}).items() if isinstance(k,(int,float)) and k < 3))
    ud = sh.get('urban_density', {}); s['city_m'] = round(ud.get('city', 0)); s['resi_m'] = round(ud.get('residential', 0))
    s['toll_m'] = round(sum(v for k, v in sh.get('toll', {}).items() if k not in ('no','missing')))
    env = sh.get('road_environment', {}); s['ferry_m'] = round(env.get('ferry', 0)); s['tunnel_m'] = round(env.get('tunnel', 0))
    s['len_m'] = round(tot)
    return s
def route(points, profile, extra=None):
    b = {'profile': profile, 'points': [[p[1], p[0]] for p in points], 'points_encoded': False, 'instructions': False, 'details': DET, 'ch.disable': True}
    if extra: b.update(extra)
    return post(b)
def check_pass(p):
    pt = (p['lat'], p['lon']); r = {'id': p['id'], 'name': p['name'], 'tier': p['tier'], 'country': p['country'], 'note': p.get('car_note')}
    for prof in ('sportwagen', 'auto'):
        j = route([pt], prof, {'algorithm': 'round_trip', 'round_trip.distance': 4000, 'round_trip.seed': 3})
        if 'paths' not in j: r[prof] = {'error': j.get('message', '')[:120]}; continue
        path = j['paths'][0]; sw = path['snapped_waypoints']['coordinates'][0]
        sh, tot = shares(path); s = summarize(sh, tot); s['snap_m'] = round(hav(pt, (sw[1], sw[0]))); r[prof] = s
    return r
def check_road(x):
    line = [tuple(p) for p in x['line']]
    L = sum(hav(line[i-1], line[i]) for i in range(1, len(line)))
    r = {'id': x['id'], 'name': x['name'], 'kind': x['kind'], 'tier': x['tier'], 'level': x['level'], 'country': x['country'], 'line_m': round(L), 'n': len(line)}
    for prof in ('sportwagen', 'auto'):
        j = route(line, prof)
        if 'paths' not in j:
            j2 = route([line[0], line[-1]], prof)
            r[prof] = {'error': j.get('message', '')[:160], 'ends_ok': 'paths' in j2}; continue
        path = j['paths'][0]; sh, tot = shares(path); s = summarize(sh, tot)
        s['ratio'] = round(path['distance'] / L, 2) if L else None
        sn = path['snapped_waypoints']['coordinates']; s['max_snap_m'] = round(max(hav(line[i], (sn[i][1], sn[i][0])) for i in range(len(line))))
        s['min'] = round(path['time'] / 60000, 1); r[prof] = s
    return r
passes = json.load(open('passes.json')); roads = json.load(open('curated-roads.json'))
with cf.ThreadPoolExecutor(6) as ex:
    P = list(ex.map(check_pass, passes)); R = list(ex.map(check_road, roads))
json.dump({'passes': P, 'roads': R}, open('result.json', 'w'), ensure_ascii=False)
print(len(P), len(R), 'fertig')
