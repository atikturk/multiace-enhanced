#!/usr/bin/env python3
"""Stage a *non-installable* PAXX 2.0 Enhanced overlay for source review.

Does not modify a printer, build firmware, or provide first-boot installation.
Requires local checkouts; fetch with git separately.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

def require_file(root, relative):
    f = root / relative
    if not f.is_file():
        raise SystemExit("Missing required source: " + str(f))
    return f

def copy_file(src, out, target):
    target = out / target
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, target)

def copy_dir(src, out, target):
    if not src.is_dir():
        raise SystemExit("Missing required source directory: " + str(src))
    target = out / target
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(src, target, ignore=shutil.ignore_patterns(".git", "__pycache__", "*.pyc", ".env", "node_modules", ".venv", "venv", "*.sqlite", "*.sqlite3", "*.log"))

def commit(root):
    try:
        return subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"

def main():
    p = argparse.ArgumentParser(description=__doc__)
    for key in ("paxx", "enhanced", "multiace", "spoolman", "out"):
        p.add_argument("--" + key, required=True, type=Path)
    a = p.parse_args()
    sources = {k: getattr(a, k).resolve() for k in ("paxx", "enhanced", "multiace", "spoolman")}
    out = a.out.resolve()
    if out.exists():
        raise SystemExit("Output already exists; choose a new empty path: " + str(out))
    for label, source in sources.items():
        if not source.is_dir():
            raise SystemExit("Missing " + label + " source: " + str(source))
        if out == source or source in out.parents or out in source.parents:
            raise SystemExit("Output and sources must be separate directory trees")
    require_file(sources["paxx"], "Makefile")
    require_file(sources["paxx"], "scripts/create_firmware.sh")
    require_file(sources["enhanced"], "klipper/extras/ace.py")
    require_file(sources["enhanced"], "multiace_web/backend/main.py")
    require_file(sources["enhanced"], "multiace_web/frontend/index.html")
    require_file(sources["enhanced"], "firmware/init.d/S98multiace-web")
    require_file(sources["multiace"], "multiace/install_multiace.sh")
    require_file(sources["multiace"], "multiace/config/extended/ace.cfg")
    require_file(sources["multiace"], "multiace/config/extended/multiace/ace_mode_switch.sh")
    require_file(sources["multiace"], "multiace/web/deploy/multiace-web.nginx.conf")
    require_file(sources["spoolman"], "scripts/start.sh")
    require_file(sources["spoolman"], "spoolman/main.py")

    # Review-only overlay compatible with the PAXX source overlay layout.
    root = Path("overlays/mods/enhanced/95-enhanced-source/root")
    out.mkdir(parents=True)
    copy_dir(sources["multiace"] / "multiace", out, root / "home/lava/multiace")
    copy_dir(sources["enhanced"] / "multiace_web", out, root / "home/lava/multiace_web")
    copy_dir(sources["spoolman"], out, root / "home/lava/spoolman")
    copy_dir(sources["enhanced"] / "klipper/extras", out, root / "home/lava/klipper/klippy/extras")
    copy_dir(sources["enhanced"] / "klipper/kinematics", out, root / "home/lava/klipper/klippy/kinematics")
    copy_file(sources["enhanced"] / "klipper/toolhead.py", out, root / "home/lava/klipper/klippy/toolhead.py")

    # Keep the packaged upstream application's future installer sources aligned
    # with the enhanced snapshot; runtime deployment must be validated separately.
    for f in (sources["enhanced"] / "klipper/extras").glob("*.py"):
        copy_file(f, out, root / "home/lava/multiace/klipper/extras" / f.name)
    for f in (sources["enhanced"] / "klipper/kinematics").glob("*.py"):
        copy_file(f, out, root / "home/lava/multiace/klipper/kinematics" / f.name)
    copy_dir(sources["enhanced"] / "multiace_web/backend", out, root / "home/lava/multiace/web/backend")
    copy_dir(sources["enhanced"] / "multiace_web/frontend", out, root / "home/lava/multiace/web/frontend")
    copy_dir(sources["enhanced"] / "multiace_web/i18n", out, root / "home/lava/multiace/i18n")

    for name in ("S57multiace-tools", "S58multiace-mode", "S98multiace-web"):
        dst = root / "etc/init.d" / name
        copy_file(sources["enhanced"] / "firmware/init.d" / name, out, dst)
        (out / dst).chmod(0o755)  # BusyBox rcS skips non-executable init scripts.
    copy_file(sources["multiace"] / "multiace/web/deploy/multiace-web.nginx.conf", out, root / "etc/nginx/fluidd.d/multiace-web.conf")
    for rel in ("ace.cfg", "multiace/ace_vars.cfg", "multiace/ace_mode_switch.sh"):
        dst = root / "usr/local/share/firmware-config/extended" / rel
        copy_file(sources["multiace"] / "multiace/config/extended" / rel, out, dst)
        if rel.endswith(".sh"):
            (out / dst).chmod(0o755)

    manifest = {
        "status": "SOURCE STAGING ONLY - DO NOT FLASH",
        "target": "PAXX v2.0.0-paxx12-24",
        "sources": {label: {"path": str(path), "commit": commit(path)} for label, path in sources.items()},
        "blockers": [
            "Rootfs Klipper include and ACE mode activation not verified on a clean device",
            "Bundled backend Python dependencies not installed or tested",
            "Spoolman startup service, database persistence and blank initial state not implemented",
            "First-boot initialization, service ordering and rollback unverified",
            "End-to-end physical U1/ACE testing and firmware image SHA256 missing"
        ],
    }
    files = sorted(f for f in out.rglob("*") if f.is_file())
    manifest["file_count"] = len(files)
    manifest["sha256"] = {
        str(f.relative_to(out)): hashlib.sha256(f.read_bytes()).hexdigest()
        for f in files
    }
    (out / "STAGING_MANIFEST.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (out / "NOT_FLASHABLE.txt").write_text(
        "SOURCE STAGING ONLY. This is NOT a ready firmware image.\n"
        "Do not flash any firmware built from this overlay until all release blockers are fixed and tested.\n",
        encoding="utf-8"
    )
    print("Prepared source-only PAXX overlay:", out)
    print("Files staged:", len(files))
    print("NOT FLASHABLE. First-boot setup, Spoolman service and hardware validation still missing.")

if __name__ == "__main__":
    main()
