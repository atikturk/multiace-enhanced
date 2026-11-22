#!/usr/bin/env bash
# Capture the post-PAXX, pre-Enhanced Klipper timing source.
# This runs BEFORE our root/ tree replaces toolhead.py.
set -euo pipefail
[[ -n "${CREATE_FIRMWARE:-}" && -n "${ROOTFS_DIR:-}" && -n "${BUILD_DIR:-}" ]] || exit 1
BASE="$ROOTFS_DIR/home/lava/klipper/klippy/toolhead.py"
ENHANCED="overlays/mods/enhanced/95-enhanced-source/root/home/lava/klipper/klippy/toolhead.py"
test -f "$BASE" && test -f "$ENHANCED"
python3 - "$BASE" "$ENHANCED" "$BUILD_DIR" <<'PY'
from pathlib import Path
import difflib, hashlib, json, re, sys
old, new, output = map(Path, sys.argv[1:])
old_text, new_text = old.read_text(), new.read_text()
def values(s):
    result = {}
    for name in ("DRIP_SEGMENT_TIME", "DRIP_TIME"):
        matches = re.findall(r"(?m)^\s*" + name + r"\s*=\s*([0-9.]+)\s*$", s)
        if len(matches) != 1:
            raise SystemExit("Expected exactly one " + name + " in toolhead.py")
        result[name] = matches[0]
    return result
old_vals, new_vals = values(old_text), values(new_text)
if new_vals != {"DRIP_SEGMENT_TIME":"0.100","DRIP_TIME":"0.350"}:
    raise SystemExit("Enhanced TTC DRIP values changed unexpectedly")
diff = "".join(difflib.unified_diff(old_text.splitlines(keepends=True), new_text.splitlines(keepends=True),
                                    fromfile="paxx-v2.0-post-overlays/toolhead.py",
                                    tofile="enhanced-snapshot/toolhead.py"))
(output / "TTC_DIFF.patch").write_text(diff)
meta = {"paxx_base":old_vals, "enhanced":new_vals,
        "paxx_base_sha256":hashlib.sha256(old_text.encode()).hexdigest(),
        "enhanced_sha256":hashlib.sha256(new_text.encode()).hexdigest(),
        "patch_lines":len(diff.splitlines()),"full_file_identical":old_text==new_text,
        "warning":"DRIP values are observed on the PAXX build rootfs; this diff does not prove causality or hardware safety."}
(output / "TTC_COMPARISON.json").write_text(json.dumps(meta,indent=2)+"\n")
print("TTC: stock/PAXX baseline",old_vals,"Enhanced",new_vals,"diff lines",meta["patch_lines"])
PY
