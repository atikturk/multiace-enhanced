# Source snapshot — 2026-11-11

**Project:** MultiACE Enhanced on Snapmaker U1  
**Device firmware:** `2.0.0-paxx12-24-417e639` (from `firmware/BUILD_VERSION`)  
**MultiACE engine:** `1.27b` (from `klipper/extras/ace.py`)  
**Snapshot origin:** live selected source files exported from the user's own working printer on 2026-11-11.  
**Status:** source review snapshot; **not** a standalone installer or a verified PAXX 2.1.0 migration package.

## Directory mapping

| Repo path | Printer path |
|---|---|
| `klipper/extras/` | `/home/lava/klipper/klippy/extras/` (selected files) |
| `klipper/kinematics/` | `/home/lava/klipper/klippy/kinematics/` |
| `klipper/toolhead.py` | `/home/lava/klipper/klippy/toolhead.py` |
| `multiace_web/backend/` | `/home/lava/multiace_web/backend/` |
| `multiace_web/frontend/` | `/home/lava/multiace_web/frontend/` |
| `multiace_web/i18n/` | `/home/lava/multiace_web/i18n/` |
| `firmware/init.d/` | `/etc/init.d/` (selected service scripts) |
| `recovery/make_full_recovery.sh` | `/oem/multiace_persist/recovery/make_full_recovery.sh` |
| `recovery/apply.sh` | `/oem/multiace_persist/apply.sh` |
| `scripts/paxx_multiace_compat.py` | `/oem/multiace_persist/tools/paxx_multiace_compat.py` |

All copied source files are unmodified bytes. See `SOURCE_SHA256.txt` for per-file SHA256 hashes; the original printer source path is preserved in each manifest row.

## Deliberately omitted

* `/oem/multiace_persist/snapshots/` historical copies and `/patch_backups/` backups.
* Superseded recovery scripts (`make_full_recovery_eski.sh`, `make_full_recovery_v3_PAXX20.sh`).
* Duplicate `paxx_multiace_compat_v2.1.py` (byte-identical to included file).
* Unmodified / historical general Klipper modules `gcode_move.py` and `virtual_sdcard.py` (not established as Enhanced-specific changes).
* Printer configuration, runtime state, logs, RFID identifiers, SQLite databases, spool inventory, secret keys, the full recovery archive and firmware binary images.

## Functionality still needing review

* `recovery/apply.sh` refers to persistent payload directories **not** included here. It is published for review, not to run on another printer.
* `recovery/make_full_recovery.sh` is the active V3.1 PAXX20 script; syntax checks and markers are reported, but successful end-to-end execution of this precise V3.1 script is **not independently evidenced**.
* The Web frontend, backend and selected Klipper files are a code snapshot, not a packaging/dependency-complete distribution.
* PAXX 2.1.0 managed MultiACE integration has not been validated with this snapshot; different services, bind mounts and ports require design review.
