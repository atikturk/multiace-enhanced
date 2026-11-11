#!/bin/sh

set -eu

RECOVERY_ROOT="/userdata/recovery_packages"

MULTIACE_REPO="/home/lava/multiace"
MULTIACE_ROOT="/home/lava/multiace_web"

PRINTER_CONFIG="/home/lava/printer_data/config"
RUNTIME_ROOT="/home/lava/printer_data/config/extended/multiace"

# MULTIACE_FULL_RECOVERY_STANDARD_V3_1_PAXX20
PERSIST_ROOT="/oem/multiace_persist"
# The installed generator itself goes into every recovery package.
SELF_SCRIPT="$0"
[ -f "$SELF_SCRIPT" ] || SELF_SCRIPT="$PERSIST_ROOT/recovery/make_full_recovery.sh"

KLIPPER_ROOT="/home/lava/klipper/klippy"
KLIPPER_EXTRAS="$KLIPPER_ROOT/extras"

# PAXX 2.0 keeps the live, boot-persistent Spoolman copy under /oem.
# Legacy fallback is for older installations only; never mix old app with new DB.
if [ -d "$PERSIST_ROOT/state/spoolman_app" ] || \
   [ -d "$PERSIST_ROOT/state/spoolman_data" ]; then
    if [ ! -d "$PERSIST_ROOT/state/spoolman_app" ] || \
       [ ! -d "$PERSIST_ROOT/state/spoolman_data" ]; then
        echo 'FATAL: PAXX20 Spoolman application/data eksik; eski veriyle devam edilmiyor.'
        exit 1
    fi
    SPOOLMAN_APP="$PERSIST_ROOT/state/spoolman_app"
    SPOOLMAN_DATA="$PERSIST_ROOT/state/spoolman_data"
    SPOOLMAN_SOURCE="paxx20_oem_state"
else
    SPOOLMAN_APP="/home/lava/spoolman"
    SPOOLMAN_DATA="/home/lava/.local/share/spoolman"
    SPOOLMAN_SOURCE="legacy_home_lava"
fi

LOCK_DIR="/tmp/multiace_full_recovery.lock"

STAGE=""
TEMP_ARCHIVE=""

cleanup()
{
    if [ -n "${STAGE:-}" ] && [ -d "$STAGE" ]; then
        rm -rf "$STAGE"
    fi

    if [ -n "${TEMP_ARCHIVE:-}" ] && [ -f "$TEMP_ARCHIVE" ]; then
        rm -f "$TEMP_ARCHIVE"
    fi

    if [ -d "$LOCK_DIR" ]; then
        rmdir "$LOCK_DIR" 2>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "HATA: Baska bir recovery islemi zaten calisiyor olabilir."
    echo "Kontrol:"
    echo "  ps | grep make_full_recovery"
    exit 1
fi

mkdir -p "$RECOVERY_ROOT"

STAMP="$(date +%Y%m%d_%H%M%S)"

echo "Mevcut MultiACE surumu okunuyor..."

VERSION=""

if [ -f "$MULTIACE_REPO/VERSION" ]; then
    VERSION="$(cat "$MULTIACE_REPO/VERSION" 2>/dev/null || true)"
fi

if [ -z "$VERSION" ] && command -v curl >/dev/null 2>&1; then
    VERSION="$(
        curl -s --max-time 5 \
          http://127.0.0.1:7126/api/spoolman-usage/status 2>/dev/null |
        python3 -c '
import json
import sys
try:
    data=json.load(sys.stdin)
    print(data.get("version",""))
except Exception:
    pass
' 2>/dev/null || true
    )"
fi

if [ -z "$VERSION" ] && [ -f "$MULTIACE_ROOT/backend/spoolman_usage.py" ]; then
    VERSION="$(
        python3 - "$MULTIACE_ROOT/backend/spoolman_usage.py" <<'PY' 2>/dev/null || true
import re
import sys
from pathlib import Path

text=Path(sys.argv[1]).read_text(encoding="utf-8", errors="ignore")
m=re.search(r'VERSION\s*=\s*["'\'']([^"'\'']+)["'\'']', text)
if m:
    print(m.group(1))
PY
    )"
fi

[ -n "$VERSION" ] || VERSION="unknown"

SAFE_VERSION="$(
    printf '%s' "$VERSION" |
    sed 's/[^A-Za-z0-9._-]/_/g'
)"

PACKAGE_NAME="MultiACE_Enhanced_v${SAFE_VERSION}_${STAMP}_FULL_RECOVERY"

# MULTIACE_FULL_RECOVERY_USERDATA_STAGING_V1
STAGE_PARENT="${RECOVERY_ROOT}/.staging"
STAGE="${STAGE_PARENT}/${PACKAGE_NAME}"

TEMP_ARCHIVE="${RECOVERY_ROOT}/.${PACKAGE_NAME}.tar.gz.partial"
ARCHIVE="${RECOVERY_ROOT}/${PACKAGE_NAME}.tar.gz"
CHECKSUM="${ARCHIVE}.sha256"

LOG_COPY="$STAGE/system_info"

rm -rf "$STAGE" "$TEMP_ARCHIVE"

mkdir -p "$STAGE_PARENT"

mkdir -p \
    "$STAGE/multiace/repo" \
    "$STAGE/multiace/multiace_web" \
    "$STAGE/persistence/multiace_persist" \
    "$STAGE/klipper/extras" \
    "$STAGE/klipper/core" \
    "$STAGE/klipper/klippy_full" \
    "$STAGE/printer_data" \
    "$STAGE/services" \
    "$STAGE/user_profiles" \
    "$STAGE/spoolman/application" \
    "$STAGE/spoolman/data" \
    "$STAGE/recovery_tools" \
    "$STAGE/system_info"

echo
echo "=================================================="
echo " MultiACE Enhanced FULL RECOVERY"
echo "=================================================="
echo "Surum      : $VERSION"
echo "Paket      : $PACKAGE_NAME"
echo "Baslangic  : $(date)"
echo

# ------------------------------------------------------------
# REQUIRED CRITICAL FILE CHECK
# ------------------------------------------------------------

echo "=== PRECHECK: KRITIK CANLI DOSYALAR ==="

CRITICAL_EXTRAS="
ace.py
ace_protocol.py
ace_protocol_v1.py
ace_protocol_v2.py
filament_feed.py
filament_feed_ace.py
filament_switch_sensor.py
filament_switch_sensor_ace.py
print_task_config.py
"

for FILE in $CRITICAL_EXTRAS
do
    if [ ! -f "$KLIPPER_EXTRAS/$FILE" ]; then
        echo "FATAL: Kritik Klipper dosyasi eksik:"
        echo "$KLIPPER_EXTRAS/$FILE"
        exit 1
    fi

    echo "OK: $FILE"
done

for FILE in toolhead.py mcu.py
do
    if [ ! -f "$KLIPPER_ROOT/$FILE" ]; then
        echo "FATAL: Kritik Klipper core dosyasi eksik:"
        echo "$KLIPPER_ROOT/$FILE"
        exit 1
    fi

    echo "OK: $FILE"
done

if [ ! -d "$MULTIACE_REPO" ]; then
    echo "FATAL: $MULTIACE_REPO bulunamadi."
    exit 1
fi

if [ ! -d "$MULTIACE_ROOT" ]; then
    echo "FATAL: $MULTIACE_ROOT bulunamadi."
    exit 1
fi

if [ ! -d "$PRINTER_CONFIG" ]; then
    echo "FATAL: $PRINTER_CONFIG bulunamadi."
    exit 1
fi

if [ ! -d "$SPOOLMAN_APP" ]; then
    echo "FATAL: Spoolman uygulamasi bulunamadi:"
    echo "$SPOOLMAN_APP"
    exit 1
fi

if [ ! -d "$SPOOLMAN_DATA" ]; then
    echo "FATAL: Spoolman veri klasoru bulunamadi:"
    echo "$SPOOLMAN_DATA"
    exit 1
fi

if [ ! -f "$MULTIACE_ROOT/backend/main.py" ] || \
   [ ! -f "$PERSIST_ROOT/apply.sh" ] || \
   [ ! -f /etc/init.d/S60klipper ] || \
   [ ! -f /etc/init.d/S98multiace-web ]; then
    echo 'FATAL: MultiACE backend, boot apply veya kritik servis dosyalarindan biri eksik.'
    exit 1
fi

if [ ! -f "$KLIPPER_EXTRAS/ace_rc522.py" ]; then
    echo 'FATAL: ace_rc522.py eksik; tam Klipper modulleri yedeklenemiyor.'
    exit 1
fi

echo "Spoolman source: $SPOOLMAN_SOURCE ($SPOOLMAN_DATA)"

echo
echo "[1/11] MultiACE gelistirme reposu kopyalaniyor..."

cp -a "$MULTIACE_REPO/." "$STAGE/multiace/repo/"

echo "[2/11] MultiACE live web uygulamasi kopyalaniyor..."

cp -a "$MULTIACE_ROOT/." "$STAGE/multiace/multiace_web/"

echo "[3/11] Printer config tam kopyasi aliniyor..."

cp -a "$PRINTER_CONFIG/." "$STAGE/printer_data/config/"

echo "[4/11] MultiACE runtime verileri kopyalaniyor..."

if [ -d "$RUNTIME_ROOT" ]; then
    mkdir -p "$STAGE/multiace/runtime"
    cp -a "$RUNTIME_ROOT/." "$STAGE/multiace/runtime/"
else
    echo "UYARI: Runtime klasoru bulunamadi: $RUNTIME_ROOT"
fi

echo "[4P/11] Kalici MultiACE persistence sistemi kopyalaniyor..."

if [ ! -d "$PERSIST_ROOT" ]; then
    echo "FATAL: Persistence klasoru bulunamadi:"
    echo "$PERSIST_ROOT"
    exit 1
fi

cp -a "$PERSIST_ROOT/." "$STAGE/persistence/multiace_persist/"

echo "[5/11] Canli Klipper dosyalari kopyalaniyor..."

# Preserve ALL Klipper modules, including ace_rc522.py and PAXX modifications,
# not only the 11 historically critical files.
cp -a "$KLIPPER_ROOT/." "$STAGE/klipper/klippy_full/"

for FILE in $CRITICAL_EXTRAS
do
    cp -a \
        "$KLIPPER_EXTRAS/$FILE" \
        "$STAGE/klipper/extras/$FILE"
done

cp -a \
    "$KLIPPER_ROOT/toolhead.py" \
    "$STAGE/klipper/core/toolhead.py"

cp -a \
    "$KLIPPER_ROOT/mcu.py" \
    "$STAGE/klipper/core/mcu.py"

echo "Klipper kritik dosya sayisi: 11"

echo
echo "Python compile kontrolu..."

python3 -m py_compile \
    "$KLIPPER_EXTRAS/ace.py" \
    "$KLIPPER_EXTRAS/ace_protocol.py" \
    "$KLIPPER_EXTRAS/ace_protocol_v1.py" \
    "$KLIPPER_EXTRAS/ace_protocol_v2.py" \
    "$KLIPPER_EXTRAS/filament_feed.py" \
    "$KLIPPER_EXTRAS/filament_feed_ace.py" \
    "$KLIPPER_EXTRAS/filament_switch_sensor.py" \
    "$KLIPPER_EXTRAS/filament_switch_sensor_ace.py" \
    "$KLIPPER_EXTRAS/print_task_config.py" \
    "$KLIPPER_ROOT/toolhead.py" \
    "$KLIPPER_ROOT/mcu.py"

echo "Python compile: OK"

echo
echo "[6/11] Servis ve recovery araclari kopyalaniyor..."

for SERVICE in \
    /etc/init.d/S57multiace-tools \
    /etc/init.d/S58multiace-mode \
    /etc/init.d/S60klipper \
    /etc/init.d/S61moonraker \
    /etc/init.d/S98multiace-web \
    /etc/init.d/S99spoolman
do
    if [ -f "$SERVICE" ]; then
        cp -a "$SERVICE" "$STAGE/services/"
        echo "OK: $SERVICE"
    else
        echo "UYARI: Servis dosyasi bulunamadi: $SERVICE"
    fi
done

if [ -f /usr/local/bin/multiace-fw ]; then
    cp -a \
        /usr/local/bin/multiace-fw \
        "$STAGE/recovery_tools/multiace-fw"
fi

if [ -f "$SELF_SCRIPT" ]; then
    cp -a \
        "$SELF_SCRIPT" \
        "$STAGE/recovery_tools/make_full_recovery.sh"
else
    echo "FATAL: Kalici recovery generator bulunamadi: $SELF_SCRIPT"
    exit 1
fi

for PROFILE in /home/lava/.profile /root/.profile; do
    if [ -f "$PROFILE" ]; then
        cp -a "$PROFILE" "$STAGE/user_profiles/$(echo "$PROFILE" | tr / _ )"
    fi
done

echo "[7/11] Spoolman uygulamasi kopyalaniyor..."

cp -a "$SPOOLMAN_APP/." "$STAGE/spoolman/application/"

echo "[8/11] Spoolman verileri kopyalaniyor..."

cp -a "$SPOOLMAN_DATA/." "$STAGE/spoolman/data/"

# Python sqlite3 is already a required system dependency. Unlike plain cp,
# SQLite backup() gives a transactionally consistent snapshot of a live DB.
# Fail the FULL_RECOVERY instead of silently shipping an unreliable database.
python3 - "$SPOOLMAN_DATA" "$STAGE/spoolman/data" <<'PY_SQLITE'
import sqlite3
import sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(sys.argv[2])
found = sorted(p for p in source.rglob('*') if p.is_file() and p.suffix.lower() in ('.db', '.sqlite', '.sqlite3'))
if not found:
    raise SystemExit('FATAL: Spoolman DB bulunamadi; veri kopyasi dogrulanamiyor')
for db in found:
    relative = db.relative_to(source)
    snapshot = target / relative.parent / (relative.name + '.consistent_backup')
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    print('SQLite snapshot:', relative, flush=True)
    try:
        src = sqlite3.connect(f'file:{db}?mode=ro', uri=True, timeout=15)
        dest = sqlite3.connect(str(snapshot), timeout=15)
        try:
            src.backup(dest, pages=256, sleep=0.1)
        finally:
            dest.close()
            src.close()
        check = sqlite3.connect(f'file:{snapshot}?mode=ro', uri=True)
        try:
            result = check.execute('PRAGMA integrity_check').fetchone()[0]
        finally:
            check.close()
        if result != 'ok':
            raise RuntimeError('integrity_check: ' + str(result))
        print('SQLITE BACKUP: OK', snapshot, flush=True)
    except Exception as exc:
        raise SystemExit('FATAL: Tutarlı Spoolman yedegi alinamadi: ' + str(exc))
PY_SQLITE

echo "[9/11] Sistem bilgileri ve SHA256 kayitlari hazirlaniyor..."

date > "$LOG_COPY/backup_date.txt"
printf '%s\n' "$VERSION" > "$LOG_COPY/multiace_version.txt"
printf '%s\n' "$SPOOLMAN_APP" > "$LOG_COPY/spoolman_application_source.txt"
printf '%s\n' "$SPOOLMAN_DATA" > "$LOG_COPY/spoolman_data_source.txt"
printf '%s\n' "$SPOOLMAN_SOURCE" > "$LOG_COPY/spoolman_layout.txt"
printf '%s\n' "STANDARD_V3_1_PAXX20" > "$LOG_COPY/backup_standard.txt"

uname -a > "$LOG_COPY/uname.txt" 2>&1 || true
df -h > "$LOG_COPY/disk_usage.txt" 2>&1 || true
ps > "$LOG_COPY/processes.txt" 2>&1 || true
python3 --version > "$LOG_COPY/python_version.txt" 2>&1 || true

curl -s --max-time 10 \
    http://127.0.0.1:7126/api/spoolman-usage/status \
    > "$LOG_COPY/spoolman_usage_status.json" 2>/dev/null || true

curl -s --max-time 10 \
    http://127.0.0.1:7912/api/v1/info \
    > "$LOG_COPY/spoolman_info.json" 2>/dev/null || true

if command -v multiace-fw >/dev/null 2>&1; then

    multiace-fw check \
        > "$LOG_COPY/multiace_fw_check.txt" 2>&1 || true

    multiace-fw selftest \
        > "$LOG_COPY/multiace_fw_selftest.txt" 2>&1 || true

fi

# Record each available diagnostic source without failing on retired paths.
# Mandatory runtime artifacts were checked before staging.
python3 - "$LOG_COPY/critical_live_sha256.txt" <<'PY_HASHES'
import hashlib
from pathlib import Path
import sys
items = [
    '/home/lava/klipper/klippy/extras/ace.py',
    '/home/lava/klipper/klippy/extras/ace_protocol.py',
    '/home/lava/klipper/klippy/extras/ace_protocol_v1.py',
    '/home/lava/klipper/klippy/extras/ace_protocol_v2.py',
    '/home/lava/klipper/klippy/extras/filament_feed.py',
    '/home/lava/klipper/klippy/extras/filament_feed_ace.py',
    '/home/lava/klipper/klippy/extras/filament_switch_sensor.py',
    '/home/lava/klipper/klippy/extras/filament_switch_sensor_ace.py',
    '/home/lava/klipper/klippy/extras/print_task_config.py',
    '/home/lava/klipper/klippy/toolhead.py',
    '/home/lava/klipper/klippy/mcu.py',
    '/home/lava/multiace_web/backend/main.py',
    '/usr/local/bin/multiace-fw',
    '/etc/init.d/S57multiace-tools',
    '/etc/init.d/S58multiace-mode',
    '/etc/init.d/S60klipper',
    '/etc/init.d/S98multiace-web',
    '/etc/init.d/S99spoolman',
    '/oem/multiace_persist/payload/s58_mode/active/S58multiace-mode',
    '/oem/multiace_persist/payload/s58_mode/baseline/S58multiace-mode',
    '/oem/multiace_persist/apply.sh',
    '/oem/multiace_persist/restore_auto_replenish_paxx16.sh',
    '/oem/multiace_persist/payload/multiace_fw/active/multiace-fw',
    '/oem/multiace_persist/payload/multiace_web/active/backend/main.py',
    '/oem/multiace_persist/payload/multiace_web/baseline/backend/main.py',
    '/oem/multiace_persist/docs/HANDOFF.md',
    '/oem/multiace_persist/docs/SESSION_NOTES.md',
    '/oem/multiace_persist/docs/TODO.md',
    '/oem/multiace_persist/docs/FW_UPDATE_REPLENISH_RUNBOOK.md',
    '/oem/multiace_persist/docs/AUTO_REPLENISH_VALIDATED_20260926.md',
]
with open(sys.argv[1], 'w') as out:
    for name in items:
        p = Path(name)
        if not p.is_file():
            out.write('NOT_PRESENT  ' + name + '\n')
            continue
        h = hashlib.sha256()
        with p.open('rb') as f:
            for part in iter(lambda: f.read(1048576), b''):
                h.update(part)
        out.write(h.hexdigest() + '  ' + name + '\n')
PY_HASHES

cat > "$STAGE/README_RECOVERY.txt" <<EOF
MULTIACE ENHANCED FULL RECOVERY
===============================

Backup version:
  $VERSION

Backup date:
  $(date)

CONTENTS
--------

MultiACE development repository:
  multiace/repo/

MultiACE live web application:
  multiace/multiace_web/

Complete printer configuration:
  printer_data/config/

MultiACE runtime data:
  multiace/runtime/

Persistent MultiACE boot / recovery system:
  persistence/multiace_persist/

This includes:
  apply.sh
  restore_auto_replenish_paxx16.sh
  Auto Replenish active/baseline payloads
  MultiACE web active/baseline payloads
  multiace-fw persistent payload
  HANDOFF / SESSION_NOTES / TODO
  FW_UPDATE_REPLENISH_RUNBOOK
  AUTO_REPLENISH_VALIDATED documentation

Live Klipper extras:
  klipper/extras/

Complete live Klipper source (PAXX modifications included):
  klipper/klippy_full/

Klipper core modified files:
  klipper/core/toolhead.py
  klipper/core/mcu.py

Service files:
  services/

Shell startup profile copies:
  user_profiles/

Spoolman application:
  spoolman/application/

Spoolman database and user data:
  spoolman/data/

Live Spoolman origin:
  $SPOOLMAN_SOURCE
  application: $SPOOLMAN_APP
  data: $SPOOLMAN_DATA

When restoring SQLite, use the .consistent_backup file rather
than the copied live .db. Stop Spoolman before any database restore.
The original stock firmware / PAXX 2.0 binary is NOT a disk image
inside this archive. Restore must check firmware compatibility.

Recovery tools:
  recovery_tools/

System / API / SHA256 information:
  system_info/

CRITICAL KLIPPER FILES
----------------------

ace.py
ace_protocol.py
ace_protocol_v1.py
ace_protocol_v2.py
filament_feed.py
filament_feed_ace.py
filament_switch_sensor.py
filament_switch_sensor_ace.py
print_task_config.py
toolhead.py
mcu.py

TOTAL CRITICAL KLIPPER FILES: 11
RECOVERY STANDARD: V3 (PAXX 2.0-aware)

ORIGINAL PATHS
--------------

MultiACE repo:
  /home/lava/multiace

MultiACE live web:
  /home/lava/multiace_web

Printer config:
  /home/lava/printer_data/config

MultiACE runtime:
  /home/lava/printer_data/config/extended/multiace

Klipper extras:
  /home/lava/klipper/klippy/extras

Klipper core:
  /home/lava/klipper/klippy

Spoolman (source at backup time):
  $SPOOLMAN_APP

Spoolman data (source at backup time):
  $SPOOLMAN_DATA

Ports:
  Moonraker: 7125
  MultiACE: 7126
  Spoolman: 7912

IMPORTANT
---------

This recovery contains the real live filament_feed.py.
It also captures the complete Klipper klippy tree and PAXX 2.0
Spoolman live state. No firmware flashing or service restart occurs.

Historical recovery packages did not include that runtime file.

The final archive verification compares all 11 critical Klipper
files in the archive against the live SHA256 values.

Do not restart Klipper or Moonraker during an active print.

Restore while preserving ownership and permissions.
EOF

find "$STAGE" -type f -print |
    sort > "$LOG_COPY/file_manifest.txt"

du -ah "$STAGE" 2>/dev/null |
    sort -h > "$LOG_COPY/directory_sizes.txt" || true

python3 - "$STAGE" <<'PY'
from pathlib import Path
import hashlib
import sys

root=Path(sys.argv[1])
rows=[]

for p in sorted(root.rglob("*")):
    if not p.is_file() or p.is_symlink():
        continue

    if p.name == "ARCHIVE_MANIFEST_SHA256.txt":
        continue

    h=hashlib.sha256()

    with p.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024), b""):
            h.update(chunk)

    rows.append(
        f"{h.hexdigest()}  {p.relative_to(root).as_posix()}"
    )

out=root/"system_info"/"ARCHIVE_MANIFEST_SHA256.txt"
out.write_text("\n".join(rows)+"\n")

print("Manifest dosya sayisi:",len(rows))
PY

STAGE_SIZE="$(du -sh "$STAGE" | awk '{print $1}')"

echo
echo "Hazirlanan verinin yaklasik boyutu: $STAGE_SIZE"
echo

echo "[10/11] Arsiv olusturuluyor..."
echo "Bu asama Spoolman nedeniyle birkac dakika surebilir."

tar -czpf "$TEMP_ARCHIVE" -C "$STAGE_PARENT" "$PACKAGE_NAME" &
TAR_PID=$!

while kill -0 "$TAR_PID" 2>/dev/null
do
    CURRENT_SIZE="$(
        du -h "$TEMP_ARCHIVE" 2>/dev/null |
        awk '{print $1}' || true
    )"

    [ -n "$CURRENT_SIZE" ] || CURRENT_SIZE="0"

    echo "Arsivleme devam ediyor... mevcut boyut: $CURRENT_SIZE"

    sleep 10
done

wait "$TAR_PID"

echo "[11/11] STRICT arsiv dogrulamasi (tek gecis)..."

python3 - "$TEMP_ARCHIVE" <<'PY_VERIFY_FAST'
"""Fast, single-pass verification for MultiACE Full Recovery v3 archives.

Reads the compressed tar ONCE, verifies every regular file against the
embedded SHA-256 manifest, and checks critical recovery components.
Usage: python3 verify_multiace_archive_fast.py /path/to/archive.tar.gz
"""
import hashlib
import posixpath
import sys
import tarfile
from pathlib import Path


def verify(filename):
    filename = Path(filename)
    if not filename.is_file():
        raise RuntimeError('Arsiv bulunamadi: ' + str(filename))

    hashes = {}
    paths = set()
    manifest = None
    manifest_path = None
    duplicate = []
    links = {}
    root = None
    with tarfile.open(str(filename), 'r|gz') as tf:
        for member in tf:
            paths.add(member.name)
            if member.issym() or member.islnk():
                links[member.name] = (member.linkname, member.issym())
                continue
            if not member.isfile():
                continue
            if member.name in hashes:
                duplicate.append(member.name)
            part = tf.extractfile(member)
            if part is None:
                raise RuntimeError('Arsiv uyyesi okunamiyor: ' + member.name)
            if member.name.endswith('/system_info/ARCHIVE_MANIFEST_SHA256.txt'):
                if manifest is not None:
                    raise RuntimeError('Birden fazla manifest var')
                manifest = part.read().decode('utf-8')
                manifest_path = member.name
                root = member.name.rsplit('/system_info/', 1)[0]
                continue
            h = hashlib.sha256()
            while True:
                chunk = part.read(1024 * 1024)
                if not chunk:
                    break
                h.update(chunk)
            hashes[member.name] = h.hexdigest()

    if duplicate:
        raise RuntimeError('Tekrarlanan dosyalar: ' + str(len(duplicate)))
    if manifest is None or root is None:
        raise RuntimeError('SHA256 manifest bulunamadi')
    required = {}
    for number, line in enumerate(manifest.splitlines(), 1):
        if not line.strip():
            continue
        digest, sep, relative = line.partition('  ')
        if not sep or len(digest) != 64:
            raise RuntimeError('Manifest satiri gecersiz: ' + str(number))
        member = root + '/' + relative
        if member in required:
            raise RuntimeError('Manifest tekrari: ' + member)
        required[member] = digest
    missing = required.keys() - hashes.keys() - links.keys()
    extra = hashes.keys() - required.keys()
    bad = [path for path, expected in required.items()
           if path in hashes and hashes[path] != expected]
    unresolved_links = []
    for member, expected in required.items():
        if member not in links:
            continue
        linkname, is_symlink = links[member]
        target = (posixpath.normpath(posixpath.join(posixpath.dirname(member), linkname))
                  if is_symlink else posixpath.normpath(linkname))
        # For links to other file entries inside the tar, also validate bytes.
        for _ in range(12):
            if target not in links:
                break
            dest, symbolic = links[target]
            target = (posixpath.normpath(posixpath.join(posixpath.dirname(target), dest))
                      if symbolic else posixpath.normpath(dest))
        if target in hashes:
            if hashes[target] != expected:
                bad.append(member)
        else:
            # Tar stores the link but not its external referent. Cannot verify
            # external referent bytes; explicitly report the limitation.
            unresolved_links.append(member)
    if missing or extra or bad:
        raise RuntimeError('DOGRULAMA BASARISIZ: eksik=%d fazladan=%d hash_hatasi=%d' %
                           (len(missing), len(extra), len(bad)))
    critical = [
        'klipper/extras/ace.py',
        'klipper/extras/filament_feed.py',
        'klipper/klippy_full/extras/ace_rc522.py',
        'multiace/multiace_web/backend/main.py',
        'persistence/multiace_persist/apply.sh',
        'printer_data/config/printer.cfg',
        'services/S60klipper',
        'services/S98multiace-web',
    ]
    for path in critical:
        if root + '/' + path not in hashes:
            raise RuntimeError('KRITIK DOSYA EKSIK: ' + path)
    if not any(s.startswith(root + '/spoolman/data/') and
               s.endswith('.consistent_backup') for s in hashes):
        raise RuntimeError('Spoolman tutarli SQLite kopyasi eksik')
    live_checks = [
        ('/home/lava/klipper/klippy/extras/ace.py', 'klipper/extras/ace.py'),
        ('/home/lava/klipper/klippy/extras/ace_protocol.py', 'klipper/extras/ace_protocol.py'),
        ('/home/lava/klipper/klippy/extras/ace_protocol_v1.py', 'klipper/extras/ace_protocol_v1.py'),
        ('/home/lava/klipper/klippy/extras/ace_protocol_v2.py', 'klipper/extras/ace_protocol_v2.py'),
        ('/home/lava/klipper/klippy/extras/filament_feed.py', 'klipper/extras/filament_feed.py'),
        ('/home/lava/klipper/klippy/extras/filament_feed_ace.py', 'klipper/extras/filament_feed_ace.py'),
        ('/home/lava/klipper/klippy/extras/filament_switch_sensor.py', 'klipper/extras/filament_switch_sensor.py'),
        ('/home/lava/klipper/klippy/extras/filament_switch_sensor_ace.py', 'klipper/extras/filament_switch_sensor_ace.py'),
        ('/home/lava/klipper/klippy/extras/print_task_config.py', 'klipper/extras/print_task_config.py'),
        ('/home/lava/klipper/klippy/toolhead.py', 'klipper/core/toolhead.py'),
        ('/home/lava/klipper/klippy/mcu.py', 'klipper/core/mcu.py'),
        ('/home/lava/multiace_web/backend/main.py', 'multiace/multiace_web/backend/main.py'),
        ('/oem/multiace_persist/apply.sh', 'persistence/multiace_persist/apply.sh'),
    ]
    for live, relative in live_checks:
        if not Path(live).is_file():
            raise RuntimeError('KRITIK CANLI DOSYA EKSIK: ' + live)
        h = hashlib.sha256()
        with open(live, 'rb') as f:
            for block in iter(lambda: f.read(1024 * 1024), b''):
                h.update(block)
        if hashes.get(root + '/' + relative) != h.hexdigest():
            raise RuntimeError('KRITIK CANLI HASH FARKI: ' + live)
    print('FULL SHA256 MANIFEST: PASS (%d regular files; %d symlink entries)' %
          (len(hashes), len(required.keys() & links.keys())))
    if unresolved_links:
        print('NOT: %d harici/hedefi arsivde olmayan symlink kaynagi dosya hash ile dogrulanamadi' %
              len(unresolved_links))
    print('RECOVERY CRITICAL CONTENT: PASS')
    print('STRICT ARCHIVE VERIFICATION: PASS')
    print('PACKAGE:', root)
    print('SIZE:', filename.stat().st_size, 'bytes')



try:
    verify(sys.argv[1])
except (OSError, tarfile.TarError, RuntimeError, UnicodeError) as exc:
    print('STRICT ARCHIVE VERIFICATION: FAIL:', exc, file=sys.stderr)
    sys.exit(1)
PY_VERIFY_FAST

mv "$TEMP_ARCHIVE" "$ARCHIVE"

sha256sum "$ARCHIVE" > "$CHECKSUM"
( cd "$RECOVERY_ROOT" && sha256sum -c "$(basename "$CHECKSUM")" )

ARCHIVE_SIZE="$(du -h "$ARCHIVE" | awk '{print $1}')"

echo
echo "=================================================="
echo " FULL RECOVERY BASARIYLA TAMAMLANDI"
echo "=================================================="
echo "Bitis       : $(date)"
echo "Surum       : $VERSION"
echo "Arsiv       : $ARCHIVE"
echo "Boyut       : $ARCHIVE_SIZE"
echo
echo "SHA256:"
cat "$CHECKSUM"
echo
echo "11 kritik Klipper dosyasi: VERIFIED"
echo "Spoolman application/data : INCLUDED ($SPOOLMAN_SOURCE)"
echo "filament_feed.py           : INCLUDED + VERIFIED"
echo
echo "WinSCP klasoru:"
echo "$RECOVERY_ROOT"
echo "=================================================="
