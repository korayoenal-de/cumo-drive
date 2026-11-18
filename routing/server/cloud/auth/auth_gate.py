#!/usr/bin/env python3
"""
Anmeldung an den eigenen Servern (Koray 16.11.: Schutz vor Kopierern), seit 17.11. mit Mengengrenzen je Konto
(Sicherheitskonzept Maßnahme 6).

Caddy fragt vor jeder Anfrage an Routing, Ortssuche, Valhalla und POI Kacheln hier nach (forward_auth).
Gültig ist ein Supabase Token des Projekts CUMO DRIVE (ES256, Schlüssel aus dem öffentlichen JWKS, kein Geheimnis
auf dem Server). Läuft nur lokal auf 127.0.0.1:9180.

ENFORCE=0 (Start): jede Anfrage geht durch, gezählt wird nur, wie viele ein gültiges Token tragen und wie oft ein
  Konto über einer Grenze läge. So lassen sich die Grenzen an echtem Fahren eichen, bevor sie greifen.
ENFORCE=1: ohne gültiges Token Status 401, über der Grenze Status 429 mit Retry-After.

Grenzen je Konto (Minute und Stunde) nach Art der Anfrage, großzügig für echtes Planen und Fahren, eng für ein
Skript, das die Daten abgreift. Dazu je IP Adresse das Dreifache, gegen viele Konten von einem Rechner.
Zählerstand: curl -s localhost:9180/stats (Spitzenwerte je Art und die fünf aktivsten Konten der letzten Stunde,
Konten nur als kurzer Hash).
"""
import hashlib
import json
import os
import threading
import time
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import jwt  # python3-jwt (PyJWT) mit python3-cryptography

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://onfxnfkhajxvjmmvmzda.supabase.co')
ENFORCE = os.environ.get('ENFORCE', '0') == '1'
JWKS = jwt.PyJWKClient(f'{SUPABASE_URL}/auth/v1/.well-known/jwks.json', cache_keys=True, lifespan=3600)
ISSUER = f'{SUPABASE_URL}/auth/v1'

# Art der Anfrage: (je Minute, je Stunde). Eine Rundtour plant mehrere Varianten parallel, daher route großzügig.
LIMITS = {
    'route': (60, 600),
    'suche': (120, 1500),
    'valhalla': (120, 1500),
    'poi': (300, 5000),
}
IP_FACTOR = 3


def kind_of(uri: str) -> str:
    if uri.startswith('/poi/'):
        return 'poi'
    if uri.startswith('/photon'):
        return 'suche'
    if uri.startswith('/valhalla'):
        return 'valhalla'
    return 'route'


lock = threading.Lock()
stats = {'mit_token': 0, 'ohne_token': 0, 'ungueltig': 0, 'ueber_grenze': 0, 'seit': int(time.time())}
# Wer kommt ohne Token (18.11.: 35.618 ohne gegen 333 mit Token, Herkunft unklar): je Art der Anfrage und je Art des
# Absenders, dazu die Zahl verschiedener IP Adressen. Erst damit lässt sich sagen, wen das Scharfschalten aussperrt.
ohne_art: dict[str, int] = defaultdict(int)
ohne_wer: dict[str, int] = defaultdict(int)
ohne_ips: set[str] = set()
peak = {k: [0, 0] for k in LIMITS}  # höchster Stand je Konto: [Minute, Stunde]
# gültige Tokens kurz merken, damit nicht jede Anfrage neu rechnet: Token -> (Ablauf, Konto)
seen: dict[str, tuple[float, str]] = {}
# Zeitstempel der letzten Stunde je (Konto oder IP, Art)
hits: dict[tuple[str, str], deque] = defaultdict(deque)


def sender_of(agent: str, origin: str) -> str:
    a = agent.lower()
    if origin:
        return 'web ' + origin.split('//')[-1][:40]
    if 'cfnetwork' in a or 'darwin' in a or 'expo' in a or 'cumo' in a:
        return 'app'
    if a.startswith('node') or 'undici' in a:
        return 'testlauf (node)'
    if 'mozilla' in a:
        return 'browser ohne origin'
    if not a:
        return 'ohne kennung'
    return 'sonst: ' + a[:30]


def count_without(kind: str, sender: str, ip: str) -> None:
    with lock:
        ohne_art[kind] += 1
        if len(ohne_wer) < 40 or sender in ohne_wer:
            ohne_wer[sender] += 1
        if ip and len(ohne_ips) < 5000:
            ohne_ips.add(ip)


def count(key: str) -> None:
    with lock:
        stats[key] += 1


def user_of(token: str) -> str | None:
    now = time.time()
    s = seen.get(token)
    if s and s[0] > now:
        return s[1]
    try:
        key = JWKS.get_signing_key_from_jwt(token)
        claims = jwt.decode(token, key.key, algorithms=['ES256', 'RS256'], audience='authenticated', issuer=ISSUER)
    except Exception:
        return None
    with lock:
        if len(seen) > 5000:
            seen.clear()
        seen[token] = (min(float(claims.get('exp', now + 60)), now + 600), str(claims.get('sub', '')))
    return str(claims.get('sub', ''))


def take(who: str, kind: str, factor: int = 1) -> int:
    """Zählt die Anfrage; liefert 0 oder die Sekunden bis wieder Platz ist."""
    per_min, per_hour = (x * factor for x in LIMITS[kind])
    now = time.time()
    with lock:
        q = hits[(who, kind)]
        while q and q[0] < now - 3600:
            q.popleft()
        last_min = sum(1 for t in q if t > now - 60)
        wait = 60 if last_min >= per_min else (int(q[0] + 3600 - now) + 1 if len(q) >= per_hour else 0)
        # Im Zählmodus auch über der Grenze weiterzählen, sonst zeigt die Spitze nie mehr als die Grenze (18.11.:
        # route stand genau auf 60 bei 120 Überschreitungen, der echte Bedarf blieb unsichtbar)
        if wait and ENFORCE:
            return wait
        q.append(now)
        if factor == 1:
            p = peak[kind]
            p[0] = max(p[0], last_min + 1)
            p[1] = max(p[1], len(q))
        if wait:
            return wait
        if len(hits) > 50000:  # Speicher begrenzen: leere Einträge weg
            for k in [k for k, v in hits.items() if not v or v[-1] < now - 3600]:
                del hits[k]
    return 0


def top_users() -> list[dict]:
    now = time.time()
    per: dict[str, int] = defaultdict(int)
    with lock:
        for (who, _kind), q in hits.items():
            if who.startswith('u:'):
                per[who] += sum(1 for t in q if t > now - 3600)
    best = sorted(per.items(), key=lambda x: -x[1])[:5]
    return [{'konto': hashlib.sha256(w.encode()).hexdigest()[:8], 'anfragen_stunde': n} for w, n in best]


class Gate(BaseHTTPRequestHandler):
    def log_message(self, *args):  # ruhig, Caddy protokolliert schon
        pass

    def reply(self, code: int, body: bytes = b'', retry: int = 0) -> None:
        self.send_response(code)
        if code in (401, 429):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
        if retry:
            self.send_header('Retry-After', str(retry))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/stats'):
            with lock:
                body = {**stats, 'enforce': ENFORCE, 'spitze_je_konto': {k: {'minute': v[0], 'stunde': v[1]} for k, v in peak.items()}}
            body['grenzen'] = {k: {'minute': v[0], 'stunde': v[1]} for k, v in LIMITS.items()}
            body['aktivste_konten'] = top_users()
            with lock:
                body['ohne_token_nach_art'] = dict(ohne_art)
                body['ohne_token_nach_absender'] = dict(sorted(ohne_wer.items(), key=lambda x: -x[1])[:12])
                body['ohne_token_ip_adressen'] = len(ohne_ips)
            return self.reply(200, json.dumps(body).encode())
        auth = self.headers.get('Authorization', '')
        token = auth[7:].strip() if auth.lower().startswith('bearer ') else ''
        kind = kind_of(self.headers.get('X-Forwarded-Uri', '/'))
        ip = (self.headers.get('X-Forwarded-For', '') or '').split(',')[0].strip()
        if not token:
            count('ohne_token')
            count_without(kind, sender_of(self.headers.get('User-Agent', ''), self.headers.get('Origin', '')), ip)
            return self.reply(401, b'{"error":"Bitte anmelden."}') if ENFORCE else self.reply(200)
        user = user_of(token)
        if not user:
            count('ungueltig')
            return self.reply(401, b'{"error":"Anmeldung abgelaufen."}') if ENFORCE else self.reply(200)
        count('mit_token')
        wait = take('u:' + user, kind) or (take('ip:' + ip, kind, IP_FACTOR) if ip else 0)
        if wait:
            count('ueber_grenze')
            if ENFORCE:
                return self.reply(429, b'{"error":"Gerade zu viele Anfragen. Bitte warte einen Moment."}', wait)
        return self.reply(200)

    do_POST = do_GET
    do_HEAD = do_GET


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 9180), Gate).serve_forever()
