#!/usr/bin/env bash
# Execute AFTER UPFILE repack; all state written during this QA is outside
# the already-generated .bin. ARM64 runs under the runner's QEMU binfmt.
set -euo pipefail
[[ $# -eq 1 ]] || { echo "Usage: qa_spoolman_smoke.sh <extracted-rootfs>" >&2; exit 2; }
ROOTFS="$(realpath "$1")"
test -f "$ROOTFS/etc/init.d/S99spoolman"
test -f "$ROOTFS/home/lava/spoolman/client_v2/build/200.html"

stop_spoolman() {
  sudo chroot "$ROOTFS" /etc/init.d/S99spoolman stop >/dev/null 2>&1 || true
}
trap stop_spoolman EXIT

check_health() {
  local count=0
  while [[ "$count" -lt 50 ]]; do
    if curl -fsS --max-time 3 http://127.0.0.1:7912/api/v1/health \
       | grep -q '"healthy"'; then
      curl -fsS --max-time 5 http://127.0.0.1:7912/api/v1/info \
        | python3 -c 'import json,sys; a=json.load(sys.stdin); assert "data_dir" in a and a["db_type"] in ("sqlite", "DatabaseType.SQLITE"), a; print("Spoolman API:", a["version"], a["data_dir"])'
      curl -fsS --max-time 5 http://127.0.0.1:7912/api/v1/spool \
        | python3 -c 'import json,sys; v=json.load(sys.stdin); assert (v==[] if isinstance(v,list) else v.get("items")==[]), v; print("Empty spool inventory confirmed")'
      return 0
    fi
    count=$((count+1))
    sleep 1
  done
  echo "Spoolman did not become healthy on port 7912" >&2
  return 1
}
echo "QA: first-boot Spoolman service launch under ARM64 chroot"
sudo chroot "$ROOTFS" /etc/init.d/S99spoolman start
if ! check_health; then
  echo "==== Embedded Spoolman startup logs ====" >&2
  sudo chroot "$ROOTFS" /bin/sh -c \
    'cat /home/lava/printer_data/logs/spoolman-enhanced.log 2>/dev/null || true;
     cat /home/lava/printer_data/spoolman/spoolman.log 2>/dev/null || true' >&2
  sudo chroot "$ROOTFS" /etc/init.d/S99spoolman status >&2 || true
  exit 1
fi
sudo chroot "$ROOTFS" /usr/bin/python3 -c '
from pathlib import Path
p=Path("/home/lava/printer_data/spoolman/spoolman.db")
assert p.is_file() and p.stat().st_size > 0, p
print("Persistent first-run SQLite database:",p)
'
echo "QA: service restart and persisted inventory"
sudo chroot "$ROOTFS" /etc/init.d/S99spoolman stop
sudo chroot "$ROOTFS" /etc/init.d/S99spoolman start
if ! check_health; then
  echo "==== Spoolman post-restart logs ====" >&2
  sudo chroot "$ROOTFS" /bin/sh -c \
    'cat /home/lava/printer_data/logs/spoolman-enhanced.log 2>/dev/null || true' >&2
  exit 1
fi
echo "QA: Spoolman standalone service, API, empty inventory and restart passed."
