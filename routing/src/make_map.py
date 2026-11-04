"""Erzeugt eine Kartenseite aus dem Ergebnis von analyze_route.py.

Aufruf: python3 -I make_map.py <ergebnis.json> <ausgabe.html> [titel]
"""
import html
import json
import sys

COLORS = {"ok": "#9A9A9F", "pruefen": "#E8B03A", "raus": "#E2461C"}

PAGE = """<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>
:root{{--g:#0B0B0C;--s:#161618;--s2:#1F1F22;--l:#2A2A2E;--t:#F4F4F2;--m:#9A9A9F;--sig:#E2461C;--warn:#E8B03A;--good:#4CC38A}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--g);color:var(--t);font:400 15px/1.5 Inter,system-ui,sans-serif}}
main{{max-width:960px;margin:0 auto;padding:24px 16px 48px}}
h1{{font:900 32px/1.05 Archivo,Inter,sans-serif;text-transform:uppercase;margin:0 0 6px}}
.sub{{color:var(--m);margin:0 0 20px}}
#map{{height:62vh;min-height:360px;border-radius:16px;background:var(--s)}}
.stats{{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1px;background:var(--s2);border-radius:14px;overflow:hidden;margin:16px 0}}
.stat{{background:var(--s);padding:14px 16px}}
.stat b{{display:block;font:800 22px Archivo,Inter,sans-serif;font-variant-numeric:tabular-nums}}
.stat span{{color:var(--m);font-size:12px}}
.legend{{display:flex;gap:16px;flex-wrap:wrap;color:var(--m);font-size:13px;margin:10px 0 0}}
.legend i{{display:inline-block;width:18px;height:4px;border-radius:2px;vertical-align:middle;margin-right:6px}}
h2{{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--m);margin:28px 0 8px}}
.row{{display:flex;gap:14px;padding:12px 0;border-top:1px solid var(--s2);cursor:pointer}}
.row:hover{{background:var(--s)}}
.km{{font:800 15px Archivo,Inter,sans-serif;font-variant-numeric:tabular-nums;min-width:86px}}
.tag{{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9px;margin-right:6px}}
.raus{{background:rgba(226,70,28,.18);color:#ff8a66}} .pruefen{{background:rgba(232,176,58,.16);color:var(--warn)}}
.why{{color:var(--m);font-size:13px}}
a{{color:var(--t)}}
</style></head><body><main>
<h1>{title}</h1>
<p class="sub">{subtitle}</p>
<div id="map" role="img" aria-label="Karte der Etappe mit markierten Abschnitten"></div>
<div class="legend"><span><i style="background:{c_ok}"></i>passt</span><span><i style="background:{c_pr}"></i>prüfen</span><span><i style="background:{c_ra}"></i>darf nicht eingeplant werden</span></div>
<div class="stats">{stats}</div>
<h2>Abschnitte, die raus müssen</h2>
<div>{rows_raus}</div>
<h2>Abschnitte zum Prüfen (ab 300 m)</h2>
<div>{rows_pr}</div>
<p class="sub" style="margin-top:28px">Daten: OpenStreetMap Mitwirkende. Abgleich der calimoto Routenpunkte mit dem OSM Straßennetz, Stand des Abrufs.</p>
</main>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
const D={data};
const map=L.map('map',{{zoomControl:true}});
L.tileLayer('https://tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png',{{maxZoom:19,attribution:'&copy; OpenStreetMap'}}).addTo(map);
const col={colors};
const all=[];
let run=null;
D.linie.forEach(s=>{{
  if(run&&run.c===s.c){{run.p.push(s.b);}}else{{if(run)draw(run);run={{c:s.c,p:[s.a,s.b]}};}}
  all.push(s.a);
}});
if(run)draw(run);
function draw(r){{L.polyline(r.p,{{color:col[r.c],weight:r.c==='ok'?4:7,opacity:r.c==='ok'?.8:1}}).addTo(map);}}
map.fitBounds(all);
document.querySelectorAll('.row').forEach(el=>el.addEventListener('click',()=>{{
  const s=D.abschnitte[+el.dataset.i];map.fitBounds(s.coords,{{maxZoom:15,padding:[30,30]}});
  document.getElementById('map').scrollIntoView({{behavior:'smooth'}});
}}));
</script></body></html>
"""


def row(i, s):
    e = html.escape
    name = e(s["name"]) or "ohne Namen"
    return (f'<div class="row" data-i="{i}"><div class="km">km {s["start_km"]:.1f}<br>'
            f'<span class="why">{s["laenge_km"]:.2f} km</span></div><div>'
            f'<span class="tag {s["klasse"]}">{"raus" if s["klasse"] == "raus" else "prüfen"}</span>'
            f'<b>{name}</b> <span class="why">bei {e(s["ort"])}</span><br>'
            f'<span class="why">{e("; ".join(s["gruende"]))}</span></div></div>')


def main():
    src, out = sys.argv[1], sys.argv[2]
    title = sys.argv[3] if len(sys.argv) > 3 else "Etappen Check"
    r = json.load(open(src))
    k = r["km_je_klasse"]
    stats = "".join(f'<div class="stat"><b>{v}</b><span>{lab}</span></div>' for v, lab in [
        (f'{r["laenge_km"]:.0f} km', "Etappe laut OSM Abgleich"),
        (f'{k["raus"]:.1f} km', "darf nicht eingeplant werden"),
        (f'{k["pruefen"]:.1f} km', "prüfen"),
        (f'{k["ok"]:.0f} km', "passt"),
    ])
    rows_raus = "".join(row(i, s) for i, s in enumerate(r["abschnitte"]) if s["klasse"] == "raus") or '<p class="why">keine</p>'
    rows_pr = "".join(row(i, s) for i, s in enumerate(r["abschnitte"])
                      if s["klasse"] == "pruefen" and s["laenge_km"] >= 0.3) or '<p class="why">keine</p>'
    page = PAGE.format(
        title=html.escape(title),
        subtitle="Jeder Meter der calimoto Route, abgeglichen mit OpenStreetMap und nach Sportwagen Regeln bewertet.",
        stats=stats, rows_raus=rows_raus, rows_pr=rows_pr,
        data=json.dumps({"linie": r["linie"], "abschnitte": r["abschnitte"]}, separators=(",", ":")),
        colors=json.dumps(COLORS), c_ok=COLORS["ok"], c_pr=COLORS["pruefen"], c_ra=COLORS["raus"],
    )
    with open(out, "w") as f:
        f.write(page)


if __name__ == "__main__":
    main()
