#!/usr/bin/env python3
"""Offline checks for the exported MultiACE Enhanced source tree.

The historical 2026-11-11 source hash manifest is not the current-branch
manifest after subsequent fixes. Opt in to testing that original snapshot
only when checking an unchanged extraction of the original source.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--check-original-hashes", action="store_true",
    help="Check the original 2026-11-11 extraction SHA256 manifest; expected to fail for modified current-branch source files.",
)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
errors = []
checked = 0

for f in sorted(root.rglob("*")):
    if not f.is_file() or ".git" in f.parts:
        continue
    try:
        if f.suffix == ".py":
            compile(f.read_bytes(), str(f), "exec")
            checked += 1
        elif f.suffix == ".json":
            json.loads(f.read_text(encoding="utf-8"))
            checked += 1
        elif f.suffix == ".sh" or f.name in {
            "S57multiace-tools", "S58multiace-mode", "S98multiace-web"
        }:
            p = subprocess.run(
                ["sh", "-n", str(f)], capture_output=True, text=True
            )
            if p.returncode:
                errors.append(f"{f.relative_to(root)}: {p.stderr.strip()}")
            else:
                checked += 1
    except Exception as exc:
        errors.append(f"{f.relative_to(root)}: {exc}")

if args.check_original_hashes:
    manifest = root / "docs" / "SOURCE_SHA256.txt"
    for line in manifest.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        try:
            sha, rel, _orig = line.split("  ", 2)
            f = root / rel
            if not f.is_file():
                errors.append(f"original snapshot file absent: {rel}")
            elif hashlib.sha256(f.read_bytes()).hexdigest() != sha:
                errors.append(f"original snapshot hash differs: {rel}")
        except Exception as exc:
            errors.append(f"invalid original manifest line: {exc}")

if errors:
    for error in errors:
        print("FAIL", error)
    sys.exit(1)

print(f"PASS: {checked} source syntax/JSON checks")
if args.check_original_hashes:
    print("PASS: original 2026-11-11 SHA256 manifest")
else:
    print("NOTE: historical SHA256 manifest not checked; it predates source updates.")
