#!/usr/bin/env python3
"""Convert reviewed source staging into a firmware QA overlay.

Still NOT authorized for physical installation: build validation and clean
device/hardware acceptance must pass separately.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path


def add(src: Path, dest: Path, executable: bool = False) -> None:
    if not src.is_file():
        raise SystemExit("Missing packaging component: " + str(src))
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    if executable:
        dest.chmod(0o755)


def replace_exact(s: str, old: str, new: str, label: str) -> str:
    if s.count(old) != 1:
        raise SystemExit("Unexpected " + label + ": matches=" + str(s.count(old)))
    return s.replace(old, new, 1)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--repo", required=True, type=Path)
    args = p.parse_args()
    out = args.out.resolve()
    repo = args.repo.resolve()
    stage = out / "overlays/mods/enhanced/95-enhanced-source"
    root = stage / "root"
    web = root / "etc/init.d/S98multiace-web"
    if not web.is_file():
        raise SystemExit("Run stage_overlay.py first")

    # Baked services already take part in the first boot's rcS glob.
    # Don't also launch S99 from the older development printer S98 hook.
    text = web.read_text()
    begin = "# BEGIN SPOOLMAN_PAXX20_BOOT_HOOK"
    end = "# END SPOOLMAN_PAXX20_BOOT_HOOK"
    if text.count(begin) != 1 or text.count(end) != 1:
        raise SystemExit("Cannot safely remove legacy delayed Spoolman hook")
    before, remainder = text.split(begin, 1)
    _, after = remainder.split(end, 1)
    text = before + after

    # The working printer used an OEM persistence replay hook to revive
    # overlay-installed MultiACE after boot. An integrated firmware image has
    # its complete sources/services baked into squashfs. Replaying that old
    # apply.sh can restore incompatible code, run legacy Auto Replenish
    # patches and independently spawn an older Spoolman process. Remove the
    # hook from the baked S98; never erase the OEM recovery data.
    persist_begin = "# MULTIACE_ENHANCED_PERSIST_BOOT_HOOK_V1"
    persist_end = "# END MULTIACE_ENHANCED_PERSIST_BOOT_HOOK_V1"
    if text.count(persist_begin) != 1 or text.count(persist_end) != 1:
        raise SystemExit("Cannot safely remove legacy OEM MultiACE persistence replay")
    before, remainder = text.split(persist_begin, 1)
    _, after = remainder.split(persist_end, 1)
    text = before + after
    if "PERSIST_SCRIPT=/oem/multiace_persist/apply.sh" in text:
        raise SystemExit("Baked firmware still invokes legacy persistence replay")
    original = "export HOME='$HOME_LAVA' USER='$USER' PATH='$PATH_LAVA';"
    updated = "export HOME='$HOME_LAVA' USER='$USER' PATH='$PATH_LAVA' PYTHONPATH='/home/lava/multiace_web/.vendor';"
    web.write_text(replace_exact(text, original, updated, "Enhanced Web dependency environment"))
    web.chmod(0o755)

    # Persist a visible marker in the immutable image. When upgrading a
    # personalized U1, the operator can use this marker to make the old
    # /oem/multiace_persist/apply.sh skip replay on integrated firmware
    # without disabling recovery on the previous working PAXX image.
    marker = root / "usr/local/share/multiace-enhanced/PAXX20_INTEGRATED_FW"
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text("PAXX20_INTEGRATED_FW=1\n")

    # The PAXX 2.0 printer.cfg includes extended/klipper/*.cfg.
    # S49 copies these default templates to persistent printer_data on first boot.
    add(repo / "packaging/paxx20/90_multiace.cfg",
        root / "usr/local/share/firmware-config/extended/klipper/90_multiace.cfg")
    ace = root / "usr/local/share/firmware-config/extended/ace.cfg"
    s = ace.read_text()
    ace.write_text(replace_exact(s, "spoolman_url:\n",
                                 "spoolman_url: http://127.0.0.1:7912\n",
                                 "upstream ACE Spoolman URL template"))

    add(repo / "packaging/paxx20/S99spoolman",
        root / "etc/init.d/S99spoolman", executable=True)
    add(repo / "packaging/paxx20/00-record-ttc.sh",
        stage / "pre-scripts/00-record-ttc.sh", executable=True)
    add(repo / "packaging/paxx20/99-install-embedded-deps.sh",
        stage / "scripts/99-install-embedded-deps.sh", executable=True)

    # Preserve the PAXX baseline for normal-mode/rollback. The working
    # printer snapshot has ACE mode's copies in these un-suffixed paths;
    # including them would corrupt the S58 first-boot stock backups.
    for active, ace_name in (
        ("filament_feed.py", "filament_feed_ace.py"),
        ("filament_switch_sensor.py", "filament_switch_sensor_ace.py"),
    ):
        klippy = root / "home/lava/klipper/klippy/extras"
        live, ace = klippy / active, klippy / ace_name
        if not live.is_file() or not ace.is_file():
            raise SystemExit("Missing ACE/normal mode pair: " + active)
        if live.read_bytes() != ace.read_bytes():
            raise SystemExit("Cannot safely drop live snapshot copy: " + active)
        live.unlink()

    # These are imported by uvicorn at startup. No npm or pip on the printer.
    client = root / "home/lava/spoolman/client_v2/build/200.html"
    if not client.is_file():
        raise SystemExit("Spoolman Svelte Web bundle missing (npm run build first)")
    legacy = root / "home/lava/spoolman/client/dist/index.html"
    if not legacy.is_file():
        raise SystemExit("Spoolman legacy React Web bundle missing (npm run build in client/ first)")
    manifest = out / "STAGING_MANIFEST.json"
    data = json.loads(manifest.read_text())
    data["status"] = "OFFLINE INTEGRATION QA - NOT FOR INSTALL"
    data["blockers"] = [
        "Isolated Python packages need ARM64 import testing in extracted rootfs",
        "ACE first boot, Web port 7126, Spoolman :7912, and restart/cold-boot not hardware tested",
        "PAXX component precedence, service ownership and rollback require real printer acceptance",
        "TTC and RFID/Auto Replenish physical acceptance not complete",
    ]
    files = sorted(f for f in out.rglob("*") if f.is_file() and f != manifest)
    data["file_count"] = len(files)
    data["sha256"] = {
        str(f.relative_to(out)): hashlib.sha256(f.read_bytes()).hexdigest()
        for f in files
    }
    manifest.write_text(json.dumps(data, indent=2) + "\n")
    print("Prepared first-boot integration QA overlay; physical flashing remains gated.")


if __name__ == "__main__":
    main()
