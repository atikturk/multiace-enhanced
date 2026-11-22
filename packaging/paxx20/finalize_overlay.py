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
    original = "export HOME='$HOME_LAVA' USER='$USER' PATH='$PATH_LAVA';"
    updated = "export HOME='$HOME_LAVA' USER='$USER' PATH='$PATH_LAVA' PYTHONPATH='/home/lava/multiace_web/.vendor';"
    web.write_text(replace_exact(text, original, updated, "Enhanced Web dependency environment"))
    web.chmod(0o755)

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

    # These are imported by uvicorn at startup. No npm or pip on the printer.
    client = root / "home/lava/spoolman/client_v2/build/200.html"
    if not client.is_file():
        raise SystemExit("Spoolman Svelte Web bundle missing (npm run build first)")
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
