#!/bin/sh

P=/oem/multiace_persist
PAY=$P/payload/auto_replenish_paxx16
LOG=$P/state/boot.log

hash_of() {
    [ -f "$1" ] || {
        echo ""
        return
    }
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
}

log_ar() {
    echo "$1" >> "$LOG"
    logger -t multiace-ar-persist "$1" 2>/dev/null || true
}

check_one() {
    T="$1"
    A="$2"
    B="$3"
    NAME="$4"

    if [ ! -f "$A" ] || [ ! -f "$B" ]; then
        log_ar "AR_PAYLOAD_MISSING $NAME"
        return 1
    fi

    TH=$(hash_of "$T")
    AH=$(hash_of "$A")
    BH=$(hash_of "$B")

    if [ "$TH" = "$AH" ]; then
        log_ar "AR_COMPAT_VALIDATED $NAME hash=$TH"
        return 0
    fi

    if [ "$TH" = "$BH" ]; then
        log_ar "AR_COMPAT_BASELINE $NAME hash=$TH"
        return 0
    fi

    log_ar "AR_INCOMPATIBLE $NAME hash=$TH"
    return 1
}

needs_restore() {
    T="$1"
    A="$2"

    [ "$(hash_of "$T")" != "$(hash_of "$A")" ]
}

restore_one() {
    T="$1"
    A="$2"
    NAME="$3"

    if [ "$(hash_of "$T")" = "$(hash_of "$A")" ]; then
        return 0
    fi

    cp -a "$A" "$T" || {
        log_ar "AR_COPY_FAILED $NAME"
        return 1
    }

    if [ "$(hash_of "$T")" != "$(hash_of "$A")" ]; then
        log_ar "AR_VERIFY_FAILED $NAME"
        return 1
    fi

    log_ar "AR_RESTORED $NAME"
    return 0
}

main() {
    A_ACE=$PAY/active/ace.py
    B_ACE=$PAY/baseline/ace.py
    T_ACE=/home/lava/klipper/klippy/extras/ace.py

    A_FEED=$PAY/active/filament_feed.py
    B_FEED=$PAY/baseline/filament_feed.py
    T_FEED=/home/lava/klipper/klippy/extras/filament_feed.py

    A_PTC=$PAY/active/print_task_config.py
    B_PTC=$PAY/baseline/print_task_config.py
    T_PTC=/home/lava/klipper/klippy/extras/print_task_config.py

    A_CFG=$PAY/active/ace.cfg
    B_CFG=$PAY/baseline/ace.cfg
    T_CFG=/home/lava/printer_data/config/extended/ace.cfg

    COMPAT=1

    check_one "$T_ACE"  "$A_ACE"  "$B_ACE"  "ace.py" ||
        COMPAT=0

    check_one "$T_FEED" "$A_FEED" "$B_FEED" "filament_feed.py" ||
        COMPAT=0

    check_one "$T_PTC"  "$A_PTC"  "$B_PTC"  "print_task_config.py" ||
        COMPAT=0

    check_one "$T_CFG"  "$A_CFG"  "$B_CFG"  "extended/ace.cfg" ||
        COMPAT=0

    if [ "$COMPAT" -ne 1 ]; then
        log_ar "AR_SET_SKIPPED_INCOMPATIBLE"
        return 0
    fi

    NEED=0

    needs_restore "$T_ACE"  "$A_ACE"  && NEED=1
    needs_restore "$T_FEED" "$A_FEED" && NEED=1
    needs_restore "$T_PTC"  "$A_PTC"  && NEED=1
    needs_restore "$T_CFG"  "$A_CFG"  && NEED=1

    if [ "$NEED" -eq 0 ]; then
        log_ar "AR_SET_ALREADY_VALIDATED"
        return 0
    fi

    RB=/tmp/multiace-ar-rollback.$$

    rm -rf "$RB"
    mkdir -p "$RB" || {
        log_ar "AR_ROLLBACK_DIR_FAILED"
        return 0
    }

    cp -a "$T_ACE"  "$RB/ace.py" ||
        { log_ar "AR_BACKUP_FAILED ace.py"; rm -rf "$RB"; return 0; }

    cp -a "$T_FEED" "$RB/filament_feed.py" ||
        { log_ar "AR_BACKUP_FAILED filament_feed.py"; rm -rf "$RB"; return 0; }

    cp -a "$T_PTC" "$RB/print_task_config.py" ||
        { log_ar "AR_BACKUP_FAILED print_task_config.py"; rm -rf "$RB"; return 0; }

    cp -a "$T_CFG" "$RB/ace.cfg" ||
        { log_ar "AR_BACKUP_FAILED extended/ace.cfg"; rm -rf "$RB"; return 0; }

    APPLY_OK=1

    restore_one "$T_ACE"  "$A_ACE"  "ace.py" ||
        APPLY_OK=0

    restore_one "$T_FEED" "$A_FEED" "filament_feed.py" ||
        APPLY_OK=0

    restore_one "$T_PTC" "$A_PTC" "print_task_config.py" ||
        APPLY_OK=0

    restore_one "$T_CFG" "$A_CFG" "extended/ace.cfg" ||
        APPLY_OK=0

    if [ "$APPLY_OK" -eq 1 ] &&
       [ "$(hash_of "$T_ACE")"  = "$(hash_of "$A_ACE")" ] &&
       [ "$(hash_of "$T_FEED")" = "$(hash_of "$A_FEED")" ] &&
       [ "$(hash_of "$T_PTC")"  = "$(hash_of "$A_PTC")" ] &&
       [ "$(hash_of "$T_CFG")"  = "$(hash_of "$A_CFG")" ]; then

        log_ar "AR_SET_RESTORE_SUCCESS"
        rm -rf "$RB"
        return 0
    fi

    log_ar "AR_SET_RESTORE_FAILED_ROLLBACK"

    cp -a "$RB/ace.py" "$T_ACE" 2>/dev/null || true
    cp -a "$RB/filament_feed.py" "$T_FEED" 2>/dev/null || true
    cp -a "$RB/print_task_config.py" "$T_PTC" 2>/dev/null || true
    cp -a "$RB/ace.cfg" "$T_CFG" 2>/dev/null || true

    log_ar "AR_SET_ROLLBACK_DONE"
    rm -rf "$RB"
    return 0
}

main
