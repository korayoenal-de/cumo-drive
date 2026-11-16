#!/usr/bin/env python3
"""
Anmeldung an den eigenen Servern (Koray 16.11.: Schutz vor Kopierern).

Caddy fragt vor jeder Anfrage an Routing, Ortssuche, Valhalla und POI Kacheln hier nach (forward_auth).
Gültig ist ein Supabase Token des Projekts CUMO DRIVE (ES256, Schlüssel aus dem öffentlichen JWKS, kein Geheimnis
auf dem Server). Läuft nur lokal auf 127.0.0.1:9180.

ENFORCE=0 (Start): jede Anfrage geht durch, gezählt wird nur, wie viele ein gültiges Token tragen.
ENFORCE=1: ohne gültiges Token Status 401.
Zählerstand: curl -s localhost:9180/stats
"""
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import jwt  # python3-jwt (PyJWT) mit python3-cryptography

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://onfxnfkhajxvjmmvmzda.supabase.co')
ENFORCE = os.environ.get('ENFORCE', '0') == '1'
JWKS = jwt.PyJWKClient(f'{SUPABASE_URL}/auth/v1/.well-known/jwks.json', cache_keys=True, lifespan=3600)
ISSUER = f'{SUPABASE_URL}/auth/v1'

lock = threading.Lock()
stats = {'mit_token': 0, 'ohne_token': 0, 'ungueltig': 0, 'seit': int(time.time())}
# gültige Tokens kurz merken, damit nicht jede Anfrage neu rechnet
seen: dict[str, float] = {}


def count(key: str) -> None:
    with lock:
        stats[key] += 1


def valid(token: str) -> bool:
    now = time.time()
    exp = seen.get(token)
    if exp and exp > now:
        return True
    try:
        key = JWKS.get_signing_key_from_jwt(token)
        claims = jwt.decode(token, key.key, algorithms=['ES256', 'RS256'], audience='authenticated', issuer=ISSUER)
    except Exception:
        return False
    if len(seen) > 5000:
        seen.clear()
    seen[token] = min(float(claims.get('exp', now + 60)), now + 600)
    return True


class Gate(BaseHTTPRequestHandler):
    def log_message(self, *args):  # ruhig, Caddy protokolliert schon
        pass

    def reply(self, code: int, body: bytes = b'') -> None:
        self.send_response(code)
        if code == 401:
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/stats'):
            with lock:
                body = json.dumps({**stats, 'enforce': ENFORCE}).encode()
            return self.reply(200, body)
        auth = self.headers.get('Authorization', '')
        token = auth[7:].strip() if auth.lower().startswith('bearer ') else ''
        if not token:
            count('ohne_token')
            return self.reply(401, b'{"error":"Bitte anmelden."}') if ENFORCE else self.reply(200)
        if valid(token):
            count('mit_token')
            return self.reply(200)
        count('ungueltig')
        return self.reply(401, b'{"error":"Anmeldung abgelaufen."}') if ENFORCE else self.reply(200)

    do_POST = do_GET
    do_HEAD = do_GET


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 9180), Gate).serve_forever()
