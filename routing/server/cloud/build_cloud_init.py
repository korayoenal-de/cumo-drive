"""Erzeugt cloud-init.yaml aus ../config.yml, ../custom_models/sportwagen.json und setup-server.sh.

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
model = (SERVER / "custom_models" / "sportwagen.json").read_text()
setup = (HERE / "setup-server.sh").read_text()

unit = """[Unit]
Description=CUMO DRIVE Routing (GraphHopper)
After=network-online.target

[Service]
User=cumo
WorkingDirectory=/opt/cumo-routing
ExecStart=/usr/bin/java -Xmx18g -jar /opt/cumo-routing/bin/graphhopper-web-11.0.jar server config.yml
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

caddy_cmd = (
    "IP=$(curl -4 -s https://ifconfig.me || hostname -I | cut -d\\  -f1); "
    "printf 'routing.rallycumo.de, %s.sslip.io {\\n  encode gzip\\n  reverse_proxy 127.0.0.1:8989\\n}\\n' "
    '\\"${IP//./-}\\" > /etc/caddy/Caddyfile && systemctl restart caddy'
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
  - path: /opt/cumo-routing/custom_models/sportwagen.json
    content: |
{block(model)}
  - path: /opt/cumo-routing/setup-server.sh
    permissions: '0755'
    content: |
{block(setup)}
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

caddy_sh = caddy_cmd.replace('\\"', '"')
inst = "#!/bin/bash\n# CUMO DRIVE Routing Server einrichten (Ubuntu 24.04), erzeugt aus build_cloud_init.py.\n"
inst += "# Aufruf vom Mac: ssh root@IP 'bash -s' < install.sh\nset -euo pipefail\nexport DEBIAN_FRONTEND=noninteractive\n"
inst += "apt-get update && apt-get -y upgrade\napt-get install -y openjdk-21-jre-headless osmium-tool caddy curl ufw\n"
inst += "id cumo >/dev/null 2>&1 || useradd --system --shell /usr/sbin/nologin cumo\n"
inst += heredoc("/opt/cumo-routing/config.yml", cfg)
inst += heredoc("/opt/cumo-routing/custom_models/sportwagen.json", model)
inst += heredoc("/opt/cumo-routing/setup-server.sh", setup, "0755")
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
