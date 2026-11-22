#!/usr/bin/env bash
# Called after PAXX has copied all source overlays into the extracted ARM64 rootfs.
# Install runtime requirements before mksquashfs, never on the printer's first boot.
# Service-local --target dirs keep the Spoolman 15.x websocket dependency separate
# from Enhanced Web's 11..13 constraint.
set -euo pipefail
[[ -n "${CREATE_FIRMWARE:-}" && -n "${ROOTFS_DIR:-}" ]] || {
  echo "Must run inside the PAXX firmware builder" >&2
  exit 1
}

WEB=/home/lava/multiace_web
SPOOL=/home/lava/spoolman
test -f "$ROOTFS_DIR$WEB/backend/requirements.txt"
test -f "$ROOTFS_DIR$SPOOL/requirements.txt"
test -f "$ROOTFS_DIR$SPOOL/client_v2/build/200.html"
test -s "$ROOTFS_DIR/etc/init.d/S99spoolman"
test -f "$ROOTFS_DIR/usr/local/share/firmware-config/extended/klipper/90_multiace.cfg"

echo ">> Installing Enhanced Web isolated ARM64 dependencies"
chroot_firmware.sh "$ROOTFS_DIR" /usr/bin/python3 -m pip install \
  --disable-pip-version-check --no-compile --target "$WEB/.vendor" \
  -r "$WEB/backend/requirements.txt"

echo ">> Installing Spoolman v0.27.1 isolated ARM64 dependencies"
chroot_firmware.sh "$ROOTFS_DIR" /usr/bin/python3 -m pip install \
  --disable-pip-version-check --no-compile --target "$SPOOL/.vendor" \
  -r "$SPOOL/requirements.txt"

echo ">> Verifying Enhanced backend imports from private directory"
chroot_firmware.sh "$ROOTFS_DIR" /bin/sh -c \
  "PYTHONPATH=$WEB/.vendor /usr/bin/python3 -c 'import fastapi,uvicorn,httpx,pydantic,websockets,multipart,serial;print(fastapi.__file__,websockets.__file__)'"

echo ">> Verifying bundled Spoolman app imports with its built Svelte client"
chroot_firmware.sh "$ROOTFS_DIR" /bin/sh -c \
  "cd $SPOOL && PYTHONPATH=$SPOOL/.vendor SPOOLMAN_DIR_DATA=/tmp/spoolman-build-import \
    /usr/bin/python3 -c 'from spoolman.main import app; import fastapi,websockets;print(app.title,fastapi.__file__,websockets.__file__)'"

# Rootfs code may run as lava after boot; the vendor trees must be readable.
chmod 755 "$ROOTFS_DIR/etc/init.d/S99spoolman"
find "$ROOTFS_DIR$WEB/.vendor" "$ROOTFS_DIR$SPOOL/.vendor" -type d -exec chmod a+rx {} +
echo ">> Python dependency isolation and Spoolman import checks: OK"
