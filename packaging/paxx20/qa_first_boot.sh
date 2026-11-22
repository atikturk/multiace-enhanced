#!/usr/bin/env bash
# Offline simulation of two first-boot hooks on an extracted PAXX 2.0
# ARM64 rootfs. Execute only AFTER the output .bin has already been packed.
set -euo pipefail
[[ $# -eq 1 ]] || { echo "Usage: qa_first_boot.sh <rootfs>" >&2; exit 2; }
ROOTFS="$(realpath "$1")"
test -x "$ROOTFS/etc/init.d/S49extended-config"
test -x "$ROOTFS/etc/init.d/S58multiace-mode"
test -x "$ROOTFS/etc/init.d/S98multiace-web"
test -x "$ROOTFS/etc/init.d/S99spoolman"
VUE="$ROOTFS/home/lava/multiace_web/frontend/vendor/vue.global.prod.js"
VUE_MIRROR="$ROOTFS/home/lava/multiace/web/frontend/vendor/vue.global.prod.js"
test -s "$VUE"
test -s "$VUE_MIRROR"
cmp -s "$VUE" "$VUE_MIRROR"
grep -q 'vue v3.4.21' "$VUE"
echo "QA: offline Vue runtime is bundled in both Enhanced frontend paths"
test -f "$ROOTFS/usr/local/share/multiace-enhanced/PAXX20_INTEGRATED_FW"
# The old printer OEM replay must not run from the baked Web service.
if grep -q -e "MULTIACE_ENHANCED_PERSIST_BOOT_HOOK_V1" \
           -e "PERSIST_SCRIPT=/oem/multiace_persist/apply.sh" \
           -e "SPOOLMAN_PAXX20_BOOT_HOOK" \
           "$ROOTFS/etc/init.d/S98multiace-web"; then
    echo "FAIL: legacy OEM persistence or double-Spoolman boot hook survived" >&2
    exit 1
fi
echo "QA: legacy persistence replay removed from baked Web service"
test -s "$ROOTFS/usr/local/share/firmware-config/extended/ace.cfg"
test -s "$ROOTFS/usr/local/share/firmware-config/extended/klipper/90_multiace.cfg"

# On real firmware, S48 mounts the persistent printer-data layer first.
# The QA rootfs has no device mount; mimic its empty mountpoint for S49.
sudo chroot "$ROOTFS" /bin/mkdir -p /oem/printer_data /home/lava/printer_data/config
STOCK="$ROOTFS/home/lava/klipper/klippy/extras/filament_feed.py"
ACE="$ROOTFS/home/lava/klipper/klippy/extras/filament_feed_ace.py"
test -s "$STOCK" && test -s "$ACE"
baseline="$(sha256sum "$STOCK" | cut -d ' ' -f1)"
echo "QA: running PAXX S49 defaults seeding"
sudo chroot "$ROOTFS" /etc/init.d/S49extended-config start
sudo chroot "$ROOTFS" /bin/test -s /home/lava/printer_data/config/extended/ace.cfg
sudo chroot "$ROOTFS" /bin/test -s /home/lava/printer_data/config/extended/klipper/90_multiace.cfg
sudo chroot "$ROOTFS" /bin/test -x /home/lava/printer_data/config/extended/multiace/ace_mode_switch.sh
sudo chroot "$ROOTFS" /bin/grep -qx '\[include ../ace.cfg\]' /home/lava/printer_data/config/extended/klipper/90_multiace.cfg
sudo chroot "$ROOTFS" /bin/grep -q 'spoolman_url: http://127.0.0.1:7912' /home/lava/printer_data/config/extended/ace.cfg

# A PAXX 1.6 -> Enhanced upgrade can retain a save_variables file
# with no ace__mode. Simulate that exact condition before S58.
VARS="/home/lava/printer_data/config/extended/multiace/ace_vars.cfg"
if [ -e "$ROOTFS$VARS" ]; then
    sudo chroot "$ROOTFS" /bin/sed -i '/^ace__mode *=/d' "$VARS"
fi
echo "QA: running S58 with missing mode record"
sudo chroot "$ROOTFS" /etc/init.d/S58multiace-mode start
sudo chroot "$ROOTFS" /bin/grep -qx "ace__mode = 'multi'" "$VARS"
echo "QA: missing ace__mode seeded successfully"
backup="$ROOTFS/home/lava/klipper/klippy/extras/filament_feed_pre_multiace.py"
test -s "$backup"
test "$(sha256sum "$backup" | cut -d ' ' -f1)" = "$baseline"
cmp -s "$STOCK" "$ACE"
test -s "$ROOTFS/home/lava/klipper/klippy/kinematics/extruder_pre_multiace.py"
echo "QA: original PAXX normal-mode backup verified, ACE active, config persisted."
