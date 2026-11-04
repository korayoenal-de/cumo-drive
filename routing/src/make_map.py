"""Erzeugt eine eigenständige Seite aus dem Ergebnis von analyze_route.py.

Aufruf: python3 -I make_map.py <ergebnis.json> <ausgabe.html> [titel]

Die Karte wird als SVG gezeichnet (keine Kartenkacheln), damit die Seite auch als
veröffentlichtes Artifact funktioniert. Pro Abschnitt gibt es einen Link zu OpenStreetMap.
"""
import html
import json
import math
import sys

COLORS = {"ok": "var(--route)", "pruefen": "var(--warn)", "raus": "var(--stop)"}


def project(points, w, h, pad=24):
    lats = [p[0] for p in points]
    lons = [p[1] for p in points]
    la0, la1, lo0, lo1 = min(lats), max(lats), min(lons), max(lons)
    k = math.cos(math.radians((la0 + la1) / 2))
    sx = (w - 2 * pad) / max((lo1 - lo0) * k, 1e-9)
    sy = (h - 2 * pad) / max(la1 - la0, 1e-9)
    s = min(sx, sy)
    ox = pad + ((w - 2 * pad) - (lo1 - lo0) * k * s) / 2
    oy = pad + ((h - 2 * pad) - (la1 - la0) * s) / 2

    def f(p):
        return (ox + (p[1] - lo0) * k * s, oy + (la1 - p[0]) * s)
    return f


def runs(linie):
    out, cur = [], None
    for s in linie:
        if cur and cur["c"] == s["c"] and cur["p"][-1] == s["a"]:
            cur["p"].append(s["b"])
        else:
            cur = {"c": s["c"], "p": [s["a"], s["b"]]}
            out.append(cur)
    return out


def svg(linie, w, h, labels, box=None):
    pts = [s["a"] for s in linie] + [linie[-1]["b"]]
    if box:
        la0, la1, lo0, lo1 = box
        pts_in = [p for p in pts if la0 <= p[0] <= la1 and lo0 <= p[1] <= lo1]
        linie = [s for s in linie if la0 - .01 <= s["a"][0] <= la1 + .01 and lo0 - .01 <= s["a"][1] <= lo1 + .01]
        pts = pts_in or pts
    f = project(pts, w, h)
    parts = []
    order = {"ok": 0, "pruefen": 1, "raus": 2}
    for r in sorted(runs(linie), key=lambda r: order[r["c"]]):
        d = " ".join(f"{x:.1f},{y:.1f}" for x, y in map(f, r["p"]))
        width = 3 if r["c"] == "ok" else 5.5
        parts.append(f'<polyline points="{d}" fill="none" stroke="{COLORS[r["c"]]}" stroke-width="{width}" '
                     f'stroke-linecap="round" stroke-linejoin="round"/>')
    for p, text, anchor in labels:
        x, y = f(p)
        if not (0 <= x <= w and 0 <= y <= h):
            continue
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="var(--ink)" stroke="var(--bg)" stroke-width="2"/>')
        dx = 9 if anchor == "start" else -9
        parts.append(f'<text x="{x + dx:.1f}" y="{y + 4:.1f}" text-anchor="{anchor}" class="lbl">{html.escape(text)}</text>')
    return f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Karte der Etappe">{"".join(parts)}</svg>'


def osm_link(s):
    la, lo = s["mitte"]
    return f"https://www.openstreetmap.org/?mlat={la}&mlon={lo}#map=15/{la}/{lo}"


def row(s):
    e = html.escape
    name = e(s["name"]) or "ohne Namen"
    tag = "raus" if s["klasse"] == "raus" else "prüfen"
    return (f'<li class="row"><div class="km">km {s["start_km"]:.0f}<span>{str(s["laenge_km"]).replace(".", ",")} km</span></div>'
            f'<div class="txt"><p><span class="pill {s["klasse"]}">{tag}</span><b>{name}</b> bei {e(s["ort"])}</p>'
            f'<p class="why">{e("; ".join(s["gruende"]))}</p></div>'
            f'<a class="osm" href="{osm_link(s)}" target="_blank" rel="noopener">OSM</a></li>')


def merge_rows(sections, cls, min_km=0.0):
    """Fasst benachbarte Abschnitte gleicher Klasse für die Liste zusammen."""
    out = []
    for s in sections:
        if s["klasse"] != cls:
            continue
        if out and s["start_km"] - (out[-1]["start_km"] + out[-1]["laenge_km"]) < 0.3:
            o = out[-1]
            o["laenge_km"] = round(s["start_km"] + s["laenge_km"] - o["start_km"], 2)
            for g in s["gruende"]:
                if g not in o["gruende"]:
                    o["gruende"].append(g)
            if not o["name"] and s["name"]:
                o["name"] = s["name"]
        else:
            out.append({**s, "gruende": list(s["gruende"])})
    return [s for s in out if s["laenge_km"] >= min_km]


PAGE = """<title>{title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,700..900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* Layout: eine Spalte wie ein Roadbook, Übersichtskarte, Detailkarte des Problemabschnitts, Liste */
:root{{
  --bg:#0B0B0C; --surface:#161618; --line:#26262A; --ink:#F4F4F2; --muted:#9A9A9F;
  --route:#6E6E74; --warn:#E8B03A; --stop:#E2461C; --good:#4CC38A;
  --display:"Archivo","Arial Narrow",Inter,system-ui,sans-serif; --body:Inter,system-ui,sans-serif;
  color-scheme:dark;
}}
body{{background:var(--bg);color:var(--ink);font:400 15px/1.5 var(--body)}}
main{{max-width:980px;margin:0 auto;padding-block:28px 56px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;gap:28px}}
.eyebrow{{font:600 12px var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0}}
h1{{font:900 clamp(30px,6vw,52px)/.95 var(--display);font-stretch:125%;text-transform:uppercase;margin:6px 0 10px;text-wrap:balance}}
.lead{{max-width:62ch;color:var(--muted);margin:0}}
.stats{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line);border-radius:14px;overflow:hidden}}
.stat{{background:var(--surface);padding:14px 16px;display:flex;flex-direction:column;gap:2px}}
.stat b{{font:800 26px var(--display);font-stretch:112%;font-variant-numeric:tabular-nums}}
.stat span{{color:var(--muted);font-size:13px}}
.stat.stop b{{color:var(--stop)}} .stat.warn b{{color:var(--warn)}}
figure{{margin:0;display:flex;flex-direction:column;gap:8px}}
figure svg{{width:100%;height:auto;background:var(--surface);border-radius:16px;display:block}}
figcaption{{color:var(--muted);font-size:13px}}
.lbl{{font:600 12px var(--body);fill:var(--ink);paint-order:stroke;stroke:var(--surface);stroke-width:4px}}
.legend{{display:flex;flex-wrap:wrap;gap:16px;color:var(--muted);font-size:13px}}
.legend i{{display:inline-block;width:18px;height:4px;border-radius:2px;vertical-align:middle;margin-right:6px}}
.finding{{background:var(--surface);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:10px}}
.finding h2{{margin:0;font:800 20px var(--display);font-stretch:112%}}
.finding ul{{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px}}
h3{{font:600 12px var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 4px}}
ol{{list-style:none;margin:0;padding:0}}
.row{{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:14px;align-items:start;padding:12px 0;border-top:1px solid var(--line)}}
.km{{font:800 15px var(--display);font-variant-numeric:tabular-nums;display:flex;flex-direction:column}}
.km span{{font:400 12px var(--body);color:var(--muted)}}
.txt p{{margin:0}} .why{{color:var(--muted);font-size:13px}}
.pill{{display:inline-block;font-size:11px;font-weight:700;padding:1px 8px;border-radius:9px;margin-right:8px}}
.pill.raus{{background:color-mix(in srgb,var(--stop) 22%,transparent);color:var(--stop)}}
.pill.pruefen{{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}}
.osm{{color:var(--ink);font-size:13px;font-weight:600;padding:4px 10px;border:1px solid var(--line);border-radius:14px;text-decoration:none}}
.osm:hover,.osm:focus-visible{{border-color:var(--ink);outline:none}}
.foot{{color:var(--muted);font-size:12px}}
</style>
<main>
<header>
<p class="eyebrow">CUMO DRIVE · Etappen Check</p>
<h1>{title}</h1>
<p class="lead">Die calimoto Route, Straße für Straße mit OpenStreetMap abgeglichen und nach Sportwagen Regeln bewertet. Rot heißt: hätte nie eingeplant werden dürfen.</p>
</header>
<section class="stats" aria-label="Kennzahlen">{stats}</section>
<section class="finding">
<h2>{f_title}</h2>
<p class="why" style="margin:0">{f_sub}</p>
<ul>{f_items}</ul>
</section>
<figure>{svg_detail}<figcaption>Ausschnitt {f_where}. Grau passt, gelb prüfen, rot raus.</figcaption></figure>
<figure>{svg_all}<figcaption>Gesamte Etappe, {laenge} km.</figcaption></figure>
<div class="legend"><span><i style="background:var(--route)"></i>passt</span><span><i style="background:var(--warn)"></i>prüfen</span><span><i style="background:var(--stop)"></i>darf nicht eingeplant werden</span></div>
<section><h3>Abschnitte, die raus müssen</h3><ol>{rows_raus}</ol></section>
<section><h3>Abschnitte zum Prüfen, ab 500 m</h3><ol>{rows_pr}</ol></section>
<p class="foot">Daten: OpenStreetMap Mitwirkende, abgerufen über die OSM API. Kurze rote Stücke unter 300 m können Abgleichfehler sein, wenn ein calimoto Punkt neben der Straße liegt.</p>
</main>
"""


def main():
    src, out = sys.argv[1], sys.argv[2]
    title = sys.argv[3] if len(sys.argv) > 3 else "Etappen Check"
    r = json.load(open(src))
    k = r["km_je_klasse"]
    stats = "".join(f'<div class="stat {c}"><b>{v}</b><span>{lab}</span></div>' for c, v, lab in [
        ("", f'{r["laenge_km"]:.0f} km', "Etappe laut Abgleich"),
        ("stop", f'{k["raus"]:.1f} km'.replace(".", ","), "darf nicht eingeplant werden"),
        ("warn", f'{k["pruefen"]:.1f} km'.replace(".", ","), "prüfen"),
        ("", f'{k["ok"]:.0f} km', "passt"),
    ])
    raus = merge_rows(r["abschnitte"], "raus")
    big = max(raus, key=lambda s: s["laenge_km"])
    # Detailbox um den größten Problemabschnitt
    cs = [c for s in r["abschnitte"] if s["klasse"] == "raus" and big["start_km"] <= s["start_km"] <= big["start_km"] + big["laenge_km"] for c in s["coords"]]
    la0, la1 = min(c[0] for c in cs), max(c[0] for c in cs)
    lo0, lo1 = min(c[1] for c in cs), max(c[1] for c in cs)
    m = 0.02
    box = (la0 - m, la1 + m, lo0 - m, lo1 + m)
    labels_detail = [(c, s["ort"].split(" (")[0], "start") for s, c in
                     [(s, s["mitte"]) for s in merge_rows(r["abschnitte"], "raus") if box[0] <= s["mitte"][0] <= box[1] and box[2] <= s["mitte"][1] <= box[3]]]
    seen, labels_d = set(), []
    for c, t, a in labels_detail:
        if t not in seen:
            seen.add(t)
            labels_d.append((c, t, a))
    lin = r["linie"]
    labels_all = [(lin[0]["a"], "Start", "start"), (lin[-1]["b"], "Ziel", "end"), (big["mitte"], big["ort"].split(" (")[0], "start")]
    reasons = []
    for s in r["abschnitte"]:
        if s["klasse"] == "raus" and big["start_km"] <= s["start_km"] <= big["start_km"] + big["laenge_km"]:
            for g in s["gruende"]:
                if not g.startswith("Teil eines") and g not in reasons:
                    reasons.append(g)
    page = PAGE.format(
        title=html.escape(title),
        stats=stats,
        f_title=f'km {big["start_km"]:.0f} bis {big["start_km"] + big["laenge_km"]:.0f}: ' + f'{big["laenge_km"]:.1f}'.replace(".", ",") + ' km raus',
        f_sub=html.escape(f'{big["name"] or "Nebenstraße"} bei {big["ort"]}. Diese Signale stecken in den OSM Daten:'),
        f_items="".join(f"<li>{html.escape(x)}</li>" for x in reasons[:8]),
        f_where=html.escape(big["ort"].split(" (")[0]),
        svg_detail=svg(lin, 900, 460, labels_d, box),
        svg_all=svg(lin, 900, 520, labels_all),
        laenge=f'{r["laenge_km"]:.0f}',
        rows_raus="".join(row(s) for s in raus) or '<li class="why">keine</li>',
        rows_pr="".join(row(s) for s in merge_rows(r["abschnitte"], "pruefen", 0.5)) or '<li class="why">keine</li>',
    )
    with open(out, "w") as f:
        f.write(page)


if __name__ == "__main__":
    main()
