#!/bin/sh

P=/oem/multiace_persist
PAY=$P/payload/upload_pipeline_paxx16
LOG=$P/state/boot.log

hash_of() {
    [ -f "$1" ] || {
        echo ""
        return
    }
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
}

log_up() {
    echo "$1" >> "$LOG"
    logger -t multiace-upload-persist "$1" 2>/dev/null || true
}

compatible_hash() {
    NAME="$1"
    H="$2"

    case "$NAME:$H" in
        application.py:51f87afd846b3cc61c1eccf22dde9fddc172edb521a0d27b583376dcf71111eb|\
        application.py:fc455b4ffbd7f3e77458ca16c0a1ff13ceb0410effefcd883f43ecf237285046|\
        application.py:c9633c59b0fe15e52e0ad8896d2f128c4d8722b9cce94970b61dbb1378143597)
            return 0
            ;;

        post_process_virtual_toolheads.py:5a365a0c697d4061e4556f3079509b41322fff2311f176593a3e1531b2079174|\
        post_process_virtual_toolheads.py:6e360c550c149bad8c443ad4275e13063014ded63243bcd1771eb9311f18d490|\
        post_process_virtual_toolheads.py:aadbc9d57e8355ce205e1614e2ebd805a2d581394adddd836af35d1a84e08da9|\
        post_process_virtual_toolheads.py:88fdbf0cb4c8c82e093d49f575229afe3a3231d773349d69c446a782cc571053)
            return 0
            ;;

        # MULTIACE_AUTOLOAD_TIMEOUT_600_PERSIST_V1
        file_manager.py:f93c0d182367b6f51c996f22acf6db2794284a289c9c23909fc225a96f4a4c1e|\
        file_manager.py:b755f2d897d886dc1d37e27b2ad61b7d49cbe420bef2c8cbb5426dc3753cf001)
            return 0
            ;;

        tr.json:f0078e6e2a02d21459d83d9f8ee3aa8ab1faa806b02d02cb82350082fe1e50a2|\
        tr.json:053f8336f429bd820d6f35d9a572c9eda5a260c09c1d4561fd17c8448c8d58de|\
        tr.json:b631256ec19ae2fd0f57fce2cfbd6a6dd87eb262d07ee052076f1789582477ee)
            return 0
            ;;
    esac

    return 1
}

restore_one() {
    T="$1"
    A="$2"
    NAME="$3"
    EXPECTED="$4"

    AH="$(hash_of "$A")"

    if [ "$AH" != "$EXPECTED" ]; then
        log_up "UPLOAD_PIPELINE_PAYLOAD_INVALID $NAME hash=$AH"
        return 0
    fi

    TH="$(hash_of "$T")"

    if [ "$TH" = "$AH" ]; then
        log_up "UPLOAD_PIPELINE_ALREADY_ACTIVE $NAME hash=$TH"
        return 0
    fi

    if ! compatible_hash "$NAME" "$TH"; then
        log_up "UPLOAD_PIPELINE_SKIPPED_INCOMPATIBLE $NAME hash=$TH"
        return 0
    fi

    cp -a "$A" "$T" || {
        log_up "UPLOAD_PIPELINE_COPY_FAILED $NAME"
        return 0
    }

    NH="$(hash_of "$T")"

    if [ "$NH" = "$AH" ]; then
        log_up "UPLOAD_PIPELINE_RESTORED $NAME hash=$NH"
    else
        log_up "UPLOAD_PIPELINE_VERIFY_FAILED $NAME hash=$NH"
    fi
}

main() {
    log_up "UPLOAD_PIPELINE_BEGIN"

    restore_one \
        /home/lava/moonraker/moonraker/components/application.py \
        "$PAY/active/application.py" \
        application.py \
        51f87afd846b3cc61c1eccf22dde9fddc172edb521a0d27b583376dcf71111eb

    restore_one \
        /home/lava/printer_data/config/tools/post_process_virtual_toolheads.py \
        "$PAY/active/post_process_virtual_toolheads.py" \
        post_process_virtual_toolheads.py \
        5a365a0c697d4061e4556f3079509b41322fff2311f176593a3e1531b2079174

    restore_one \
        /home/lava/moonraker/moonraker/components/file_manager/file_manager.py \
        "$PAY/active/file_manager.py" \
        file_manager.py \
        f93c0d182367b6f51c996f22acf6db2794284a289c9c23909fc225a96f4a4c1e

    restore_one \
        /home/lava/multiace_web/i18n/tr.json \
        "$PAY/active/tr.json" \
        tr.json \
        f0078e6e2a02d21459d83d9f8ee3aa8ab1faa806b02d02cb82350082fe1e50a2

    LOCK=/home/lava/printer_data/.multiace_autoload_postprocess.lock

    touch "$LOCK" 2>/dev/null || true
    chown lava:lava "$LOCK" 2>/dev/null || true
    chmod 664 "$LOCK" 2>/dev/null || true

    log_up "UPLOAD_PIPELINE_DONE"
}

main
