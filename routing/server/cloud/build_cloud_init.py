"""Erzeugt cloud-init.yaml aus ../config.yml, ../custom_models/*.json und setup-server.sh.

Aufruf: python3 routing/server/cloud/build_cloud_init.py
Die Datei cloud-init.yaml fügt man beim Anlegen des Servers bei Hetzner unter "Cloud config" ein.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent


def block(s: str, n: int = 6) -> str:
    return "\n".join((" " * n + line) if line else "" for line in s.splitlines())


cfg = (SERVER / "config.yml").read_text()
cfg = cfg.replace(
    "# CUMO DRIVE Routing Server (GraphHopper) für die Entwicklung auf dem Mac.\n# Start über ./start.sh, nicht direkt. Pfade sind relativ zu diesem Ordner.",
    "# CUMO DRIVE Routing Server (GraphHopper) auf dem Linux Server, erzeugt aus routing/server/config.yml.",
)
cfg = cfg.replace(
    "      # 0.0.0.0, damit das iPhone im selben WLAN den Server erreicht\n      bind_host: 0.0.0.0",
    "      # nur lokal, nach außen geht es über Caddy mit HTTPS\n      bind_host: 127.0.0.1",
)
models = {f.name: f.read_text() for f in sorted((SERVER / "custom_models").glob("*.json"))}
setup = (HERE / "setup-server.sh").read_text()
model_files = "".join(f"  - path: /opt/cumo-routing/custom_models/{n}\n    content: |\n{block(b)}\n" for n, b in models.items())

unit = """[Unit]
Description=CUMO DRIVE Routing (GraphHopper)
After=network-online.target

[Service]
User=cumo
WorkingDirectory=/opt/cumo-routing
ExecStart=/usr/bin/java -Xmx22g -jar /opt/cumo-routing/bin/graphhopper-web-11.0.jar server config.yml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target"""

upd_service = """[Unit]
Description=CUMO DRIVE Kartendaten aktualisieren

[Service]
Type=oneshot
ExecStart=/opt/cumo-routing/setup-server.sh"""

upd_timer = """[Unit]
Description=CUMO DRIVE Kartendaten jeden Sonntag um 3 Uhr aktualisieren

[Timer]
OnCalendar=Sun *-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target"""

poi_sh = (HERE / "poi-tiles.sh").read_text()
poi_py = (HERE / "poi_tiles.py").read_text()

# Caddy: /poi/* als statische Dateien (POI Kacheln, fehlende Kachel = leere Liste), alles andere an GraphHopper.
# SSLIP_HOST wird beim Einrichten durch die öffentliche IP mit Bindestrichen ersetzt.
caddyfile = """routing.rallycumo.de, SSLIP_HOST.sslip.io {
\tencode gzip
\thandle /poi/* {
\t\troot * /opt/cumo-routing
\t\theader Access-Control-Allow-Origin *
\t\theader Cache-Control "public, max-age=86400"
\t\ttry_files {path} /poi/empty.json
\t\tfile_server
\t}
\thandle {
\t\treverse_proxy 127.0.0.1:8989
\t}
}"""
CADDY_TPL = "/opt/cumo-routing/Caddyfile.template"

caddy_cmd = (
    "IP=$(curl -4 -s https://ifconfig.me || hostname -I | awk '{print $1}'); "
    f'sed \\"s/SSLIP_HOST/${{IP//./-}}/\\" {CADDY_TPL} > /etc/caddy/Caddyfile && systemctl restart caddy'
)

ci = f"""#cloud-config
# CUMO DRIVE Routing Server. Beim Anlegen des Servers bei Hetzner unter "Cloud config" einfügen.
# Erzeugt aus routing/server/cloud/build_cloud_init.py, nicht von Hand ändern.
package_update: true
package_upgrade: true
packages:
  - openjdk-21-jre-headless
  - osmium-tool
  - caddy
  - curl
users:
  - default
  - name: cumo
    system: true
    shell: /usr/sbin/nologin
write_files:
  - path: /opt/cumo-routing/config.yml
    content: |
{block(cfg)}
{model_files}  - path: /opt/cumo-routing/setup-server.sh
    permissions: '0755'
    content: |
{block(setup)}
  - path: /opt/cumo-routing/poi-tiles.sh
    permissions: '0755'
    content: |
{block(poi_sh)}
  - path: /opt/cumo-routing/poi_tiles.py
    content: |
{block(poi_py)}
  - path: {CADDY_TPL}
    content: |
{block(caddyfile)}
  - path: /etc/systemd/system/cumo-routing.service
    content: |
{block(unit)}
  - path: /etc/systemd/system/cumo-routing-update.service
    content: |
{block(upd_service)}
  - path: /etc/systemd/system/cumo-routing-update.timer
    content: |
{block(upd_timer)}
runcmd:
  - [bash, -c, "fallocate -l 8G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab"]
  - [bash, -c, "{caddy_cmd}"]
  - [bash, -c, "ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable"]
  - [systemctl, daemon-reload]
  - [systemctl, enable, cumo-routing.service]
  - [systemctl, enable, --now, cumo-routing-update.timer]
  - [bash, -c, "/opt/cumo-routing/setup-server.sh"]
"""
(HERE / "cloud-init.yaml").write_text(ci)
print(f"cloud-init.yaml geschrieben ({len(ci)} Zeichen)")

# Dasselbe als Skript für Anbieter ohne Cloud config (zum Beispiel Contabo): per SSH als root ausführen.
def heredoc(path: str, body: str, mode: str = "0644") -> str:
    d = path.rsplit("/", 1)[0]
    return f"mkdir -p {d}\ncat > {path} <<'CUMO_EOF'\n{body}\nCUMO_EOF\nchmod {mode} {path}\n"

model_docs = "".join(heredoc(f"/opt/cumo-routing/custom_models/{n}", b) for n, b in models.items())
caddy_sh = caddy_cmd.replace('\\"', '"')
inst = "#!/bin/bash\n# CUMO DRIVE Routing Server einrichten (Ubuntu 24.04), erzeugt aus build_cloud_init.py.\n"
inst += "# Aufruf vom Mac: ssh root@IP 'bash -s' < install.sh\nset -euo pipefail\nexport DEBIAN_FRONTEND=noninteractive\n"
inst += "apt-get update && apt-get -y upgrade\napt-get install -y openjdk-21-jre-headless osmium-tool caddy curl ufw\n"
inst += "id cumo >/dev/null 2>&1 || useradd --system --shell /usr/sbin/nologin cumo\n"
inst += heredoc("/opt/cumo-routing/config.yml", cfg)
inst += model_docs
inst += heredoc("/opt/cumo-routing/setup-server.sh", setup, "0755")
inst += heredoc("/opt/cumo-routing/poi-tiles.sh", poi_sh, "0755")
inst += heredoc("/opt/cumo-routing/poi_tiles.py", poi_py)
inst += heredoc(CADDY_TPL, caddyfile)
inst += heredoc("/etc/systemd/system/cumo-routing.service", unit)
inst += heredoc("/etc/systemd/system/cumo-routing-update.service", upd_service)
inst += heredoc("/etc/systemd/system/cumo-routing-update.timer", upd_timer)
inst += "[ -f /swapfile ] || { fallocate -l 8G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; }\n"
inst += caddy_sh + "\n"
inst += "ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable\n"
inst += "systemctl daemon-reload\nsystemctl enable cumo-routing.service\nsystemctl enable --now cumo-routing-update.timer\n"
inst += "echo 'Einrichtung fertig. Der Graph wird jetzt im Hintergrund gebaut (etwa eine Stunde).'\n"
inst += "nohup /opt/cumo-routing/setup-server.sh > /opt/cumo-routing/first-run.log 2>&1 &\n"
(HERE / "install.sh").write_text(inst)
(HERE / "install.sh").chmod(0o755)
print(f"install.sh geschrieben ({len(inst)} Zeichen)")

# Einmalige Aktualisierung des laufenden Servers für die POI Kacheln, vom Mac aus:
# ssh root@13.140.213.164 'bash -s' < routing/server/cloud/poi-update.sh
# Alles steckt in main(), damit bash das ganze Skript liest, bevor etwas läuft (stdin ist das Skript).
upd = "#!/bin/bash\n# CUMO DRIVE: POI Kacheln auf dem laufenden Server einrichten, erzeugt aus build_cloud_init.py.\n"
upd += "# Aufruf vom Mac: ssh root@13.140.213.164 'bash -s' < poi-update.sh\n"
upd += "# Schreibt poi-tiles.sh, poi_tiles.py, setup-server.sh und die Caddy Konfiguration, lädt Caddy neu\n"
upd += "# und baut die Kacheln einmal im Vordergrund (etwa 10 bis 20 Minuten).\nset -euo pipefail\nmain() {\n"
upd += heredoc("/opt/cumo-routing/poi-tiles.sh", poi_sh, "0755")
upd += heredoc("/opt/cumo-routing/poi_tiles.py", poi_py)
upd += heredoc("/opt/cumo-routing/setup-server.sh", setup, "0755")
upd += heredoc(CADDY_TPL, caddyfile)
upd += """IP=$(curl -4 -s --max-time 10 https://ifconfig.me || true)
[ -n "$IP" ] || IP=$(hostname -I | awk '{print $1}')
HOST="${IP//./-}.sslip.io"
echo "Caddy: routing.rallycumo.de und $HOST"
mkdir -p /opt/cumo-routing/poi
[ -f /opt/cumo-routing/poi/empty.json ] || echo '[]' > /opt/cumo-routing/poi/empty.json
sed "s/SSLIP_HOST/${IP//./-}/" /opt/cumo-routing/Caddyfile.template > /etc/caddy/Caddyfile.new
caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile.new
[ -f /etc/caddy/Caddyfile ] && cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy
echo "Caddy neu geladen, POI Kacheln bauen"
/opt/cumo-routing/poi-tiles.sh
echo "Prüfen: https://$HOST/poi/v1/meta.json"
curl -fsS "https://$HOST/poi/v1/meta.json" && echo || echo "meta.json noch nicht erreichbar, Caddy prüfen: journalctl -u caddy"
}
main < /dev/null
"""
(HERE / "poi-update.sh").write_text(upd)
(HERE / "poi-update.sh").chmod(0o755)
print(f"poi-update.sh geschrieben ({len(upd)} Zeichen)")

# Neue Einstellungen für den Graphen (config.yml, Sportwagen Profil) auf den laufenden Server bringen und
# den Graphen im Hintergrund neu bauen. Aufruf vom Mac: ssh root@IP 'bash -s' < routing-rebuild.sh
# Alles, was der Neuaufbau braucht, steht in rebuild-now.sh auf dem Server. Sofort starten oder zu einer Zeit planen:
#   ssh root@IP 'bash -s' < routing-rebuild.sh
#   ssh root@IP 'AT="2026-11-06 18:00:00 Europe/Berlin" bash -s' < routing-rebuild.sh
# Geplant werden die neuen Dateien erst zur Startzeit geschrieben, der laufende Server bleibt bis dahin unberührt.
body = "#!/bin/bash\n# CUMO DRIVE: Dateien für den Neuaufbau schreiben und den Graphen neu bauen (aus routing-rebuild.sh).\nset -euo pipefail\n"
body += heredoc("/opt/cumo-routing/config.yml", cfg)
body += model_docs
body += heredoc("/opt/cumo-routing/setup-server.sh", setup, "0755")
# Dienst mit dem Heap für die zusätzlichen Landmarken; setup-server.sh startet ihn nach dem Import neu
body += heredoc("/etc/systemd/system/cumo-routing.service", unit)
body += "systemctl daemon-reload\n"
body += "chown -R cumo:cumo /opt/cumo-routing/config.yml /opt/cumo-routing/custom_models\n"
body += "/opt/cumo-routing/setup-server.sh\n"
reb = "#!/bin/bash\n# CUMO DRIVE: Routing Profile aktualisieren und Graph neu bauen, erzeugt aus build_cloud_init.py.\n"
reb += "# Sofort: ssh root@IP 'bash -s' < routing-rebuild.sh\n"
reb += "# Geplant: ssh root@IP 'AT=\"2026-11-06 18:00:00 Europe/Berlin\" bash -s' < routing-rebuild.sh\n"
reb += "set -euo pipefail\nmain() {\n"
reb += "cat > /opt/cumo-routing/rebuild-now.sh <<'CUMO_OUTER'\n" + body + "CUMO_OUTER\nchmod 0755 /opt/cumo-routing/rebuild-now.sh\n"
reb += """if [ -n "${AT:-}" ]; then
  systemctl stop cumo-rebuild-once.timer 2>/dev/null || true
  systemctl reset-failed cumo-rebuild-once.service cumo-rebuild-once.timer 2>/dev/null || true
  systemd-run --unit=cumo-rebuild-once --on-calendar="$AT" --timer-property=AccuracySec=1min \\
    /bin/bash -c '/opt/cumo-routing/rebuild-now.sh > /opt/cumo-routing/rebuild.log 2>&1'
  echo "Neuaufbau geplant für $AT. Der Server läuft bis dahin unverändert weiter."
  systemctl list-timers cumo-rebuild-once.timer --no-pager || true
else
  nohup /opt/cumo-routing/rebuild-now.sh > /opt/cumo-routing/rebuild.log 2>&1 &
  echo "Neuaufbau läuft im Hintergrund (etwa zwei Stunden). Fortschritt: tail -f /opt/cumo-routing/rebuild.log"
fi
}
main < /dev/null
"""
(HERE / "routing-rebuild.sh").write_text(reb)
(HERE / "routing-rebuild.sh").chmod(0o755)
print(f"routing-rebuild.sh geschrieben ({len(reb)} Zeichen)")
