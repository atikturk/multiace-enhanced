#!/bin/sh
P=/oem/multiace_persist
LOG=$P/state/boot.log

restore() {
    T="$1"
    A="$2"
    B="$3"

    [ -f "$A" ] || return 0

    AH=$(sha256sum "$A" | awk '{print $1}')
    BH=$(sha256sum "$B" | awk '{print $1}')
    TH=$(sha256sum "$T" 2>/dev/null | awk '{print $1}')

    if [ "$TH" = "$AH" ]; then
        echo "OK $T" >> "$LOG"
    elif [ "$TH" = "$BH" ]; then
        cp -a "$A" "$T"
        echo "RESTORED $T" >> "$LOG"
    else
        echo "SKIP_INCOMPATIBLE $T hash=$TH" >> "$LOG"
    fi
}

: > "$LOG"

O=$P/payload/orca_autoload
restore /home/lava/moonraker/moonraker/components/file_manager/file_manager.py "$O/active/file_manager.py" "$O/baseline/file_manager.py"
restore /home/lava/printer_data/config/tools/post_process_virtual_toolheads.py "$O/active/post_process_virtual_toolheads.py" "$O/baseline/post_process_virtual_toolheads.py"

T=/usr/local/bin/multiace-fw

A=$P/payload/multiace_fw/active/multiace-fw

AH=$(sha256sum "$A" | awk '{print $1}')

TH=$(sha256sum "$T" 2>/dev/null | awk '{print $1}')

if [ -z "$TH" ]; then

    cp -a "$A" "$T" && chmod 755 "$T"

    echo "RESTORED $T" >> "$LOG"

elif [ "$TH" = "$AH" ]; then

    echo "OK $T" >> "$LOG"

else

    echo "SKIP_INCOMPATIBLE $T hash=$TH" >> "$LOG"

fi
W=$P/payload/multiace_web

restore_web_tree() {
    # MULTIACE_FILEWISE_WEB_RESTORE_V1
    # Never replace an entire tree based on a single representative hash.
    T="$1"; A="$2"; B="$3"; REP="$4"
    [ -d "$A" ] || return 0
    mkdir -p "$T"
    find "$A" -type f ! -path '*/__pycache__/*' ! -name '*.pyc' ! -name '*.pyo' | while IFS= read -r SRC; do
        REL="${SRC#"$A"/}"
        DST="$T/$REL"
        BASE="$B/$REL"
        AH=$(sha256sum "$SRC" | awk '{print $1}')
        TH=$(sha256sum "$DST" 2>/dev/null | awk '{print $1}')
        BH=$(sha256sum "$BASE" 2>/dev/null | awk '{print $1}')
        if [ -L "$DST" ]; then
            echo "SKIP_SYMLINK_WEB $DST" >> "$LOG"
        elif [ "$TH" = "$AH" ]; then
            :
        elif [ ! -e "$DST" ] || { [ -n "$BH" ] && [ "$TH" = "$BH" ]; }; then
            mkdir -p "$(dirname "$DST")"
            cp -a "$SRC" "$DST"
            echo "RESTORED_WEB_FILE $DST" >> "$LOG"
        else
            echo "SKIP_INCOMPATIBLE_WEB_FILE $DST hash=$TH" >> "$LOG"
        fi
    done
}
restore_web_tree /home/lava/multiace_web/frontend "$W/active/frontend" "$W/baseline/frontend" app.js

restore_web_tree /home/lava/multiace_web/backend "$W/active/backend" "$W/baseline/backend" main.py
restore /home/lava/multiace_web/i18n/en.json "$W/active/i18n/en.json" "$W/baseline/i18n/en.json"
TR_A="$P/payload/multiace_web/active/i18n/tr.json"

TR_T="/home/lava/multiace_web/i18n/tr.json"

TR_AH=$(sha256sum "$TR_A" 2>/dev/null | awk '{print $1}')

TR_TH=$(sha256sum "$TR_T" 2>/dev/null | awk '{print $1}')

if [ ! -f "$TR_T" ]; then

    mkdir -p /home/lava/multiace_web/i18n

    cp -a "$TR_A" "$TR_T"

    echo "RESTORED_WEB_TR $TR_T" >> "$LOG"

elif [ "$TR_TH" = "$TR_AH" ]; then

    echo "OK_WEB_TR $TR_T" >> "$LOG"

else

    echo "SKIP_INCOMPATIBLE_WEB_TR $TR_T hash=$TR_TH" >> "$LOG"

fi

# MULTIACE_KLIPPER_I18N_BOOT_PERSIST_V1
restore_active_only() {
    T="$1"; A="$2"
    [ -f "$A" ] || return 0
    AH=$(sha256sum "$A" | awk '{print $1}')
    TH=$(sha256sum "$T" 2>/dev/null | awk '{print $1}')
    if [ ! -f "$T" ]; then
        mkdir -p "$(dirname "$T")"
        cp -a "$A" "$T"
        echo "RESTORED_ACTIVE_ONLY $T" >> "$LOG"
    elif [ "$TH" = "$AH" ]; then
        echo "OK_ACTIVE_ONLY $T" >> "$LOG"
    else
        echo "SKIP_INCOMPATIBLE_ACTIVE_ONLY $T hash=$TH" >> "$LOG"
    fi
}
KI="$P/payload/klipper_i18n/active"
restore_active_only /home/lava/printer_data/config/extended/multiace/i18n/en.json "$KI/en.json"
restore_active_only /home/lava/printer_data/config/extended/multiace/i18n/tr.json "$KI/tr.json"
RI="$P/payload/release_identity/active"
restore_active_only /home/lava/multiace/VERSION "$RI/VERSION"

SP_APP=/oem/multiace_persist/state/spoolman_app

SP_DATA=/oem/multiace_persist/state/spoolman_data

mkdir -p /home/lava/.local/share

if [ ! -e /home/lava/spoolman ]; then

    ln -s "$SP_APP" /home/lava/spoolman

    echo "RESTORED_SPOOLMAN_APP_LINK" >> "$LOG"

fi

if [ ! -e /home/lava/.local/share/spoolman ]; then

    ln -s "$SP_DATA" /home/lava/.local/share/spoolman

    echo "RESTORED_SPOOLMAN_DATA_LINK" >> "$LOG"

fi

if pgrep -f "uvicorn.*7912" >/dev/null 2>&1; then

    echo "SPOOLMAN_RUNNING" >> "$LOG"

else

    su lava -s /bin/sh -c 'cd /home/lava/spoolman && HOME=/home/lava nohup bash scripts/start.sh >/dev/null 2>&1 &'

    echo "SPOOLMAN_STARTED" >> "$LOG"

fi

# MULTIACE_S58_MODE_BOOT_PERSIST_V1
S58P="$P/payload/s58_mode"
restore /etc/init.d/S58multiace-mode \
    "$S58P/active/S58multiace-mode" \
    "$S58P/baseline/S58multiace-mode"
chmod 755 /etc/init.d/S58multiace-mode 2>/dev/null || true

# MULTIACE_AUTO_REPLENISH_BOOT_PERSIST_V1
AR_RESTORE="$P/restore_auto_replenish_paxx16.sh"
if [ -x "$AR_RESTORE" ]; then
    "$AR_RESTORE"
fi

# MULTIACE_DOCS_PERSIST_V1
mkdir -p /home/lava/multiace /oem/multiace_persist/docs
if [ ! -e /home/lava/multiace/docs ] && [ ! -L /home/lava/multiace/docs ]; then ln -s /oem/multiace_persist/docs /home/lava/multiace/docs; fi

exit 0
