# MultiACE Enhanced — validated printer snapshot (2026-11-12)

## Recovery artifact

- Recovery standard: `MULTIACE_FULL_RECOVERY_STANDARD_V3_1_PAXX20`
- Generator: `/oem/multiace_persist/recovery/make_full_recovery.sh`
- Version string read by generator: `1.7.0` (**not** a new software release declaration)
- Package: `MultiACE_Enhanced_v1.7.0_20261112_055900_FULL_RECOVERY.tar.gz`
- Printer-local path: `/userdata/recovery_packages/MultiACE_Enhanced_v1.7.0_20261112_055900_FULL_RECOVERY.tar.gz`
- Archive bytes: `230288451` (reported as `220M`)
- SHA256: `ab22434dace0244918095e35f5b2e69f30a3df81998bf575c6c3771f48564481`
- Archive verification output: `/userdata/recovery_packages/MultiACE_Enhanced_v1.7.0_20261112_055900_FULL_RECOVERY.tar.gz: OK`
- Completion time in printer log: **2026-11-12 06:01:49 UTC**
- SHA256 manifest check: **PASS** — 9,517 regular files, 0 symlink entries
- Recovery critical content check: **PASS**
- Strict archive verification: **PASS**
- 11 critical Klipper files: **VERIFIED**
- `filament_feed.py`: **INCLUDED + VERIFIED**
- Spoolman application and data: **INCLUDED** (source `paxx20_oem_state`)

These results are from the device console supplied by the project operator. **The archive itself is stored only on the printer and has not been uploaded to this repository.** Its SHA256 above can be checked on a separate copied archive before use.

## Pre-archive validation and persistence fixes

- The live Enhanced frontend and persistent `active` frontend were synchronized, and the English, Turkish, German, and Chinese catalogs were checked.
- Post-cold-boot, `frontend/index.html`, `frontend/app.js`, and the four catalogs all matched persistent `active` copies.
- `/etc/init.d/S98multiace-web` boot hook executed persistent restore on boot:
  - `START Thu Nov 12 04:23:46 UTC 2026`
  - `APPLY_OK Thu Nov 12 04:23:47 UTC 2026`
- The Web persistence restore was changed from a single representative-file test that could replace an entire tree, to per-file guarded restore.
- Compiled Python `__pycache__`, `*.pyc`, and `*.pyo` were excluded from the Web persistence restore scan.
- Live backend and `multiace_web/active/backend` matched on 8 source files; `baseline` was not overwritten.
- Four Auto Replenish inputs (`ace.py`, `filament_feed.py`, `print_task_config.py`, `ace.cfg`) were promoted **together** from live to the persistent `active` set after source hash verification and snapshot backups. `baseline` and live Klipper were unchanged by promotion.

## Limitations and next acceptance checks

- **Archive creation and integrity verification do not prove recovery by extracting/applying it**. An actual restore/rollback rehearsal has not been reported.
- The boot-hook check happened **before** the final four-file Auto Replenish `active` promotion; a subsequent cold boot must still confirm the `AR_SET_ALREADY_VALIDATED` result for that updated set.
- No claim is made here about a new round of print-start, TTC, RFID or Auto Replenish functional print tests following this archive.
- The restore manager should be considered a printer-local tested state. Before future upgrades, compare installed recovery/boot scripts, live code and persistent payload with version-controlled files; capture their exact hashes.
- The filename's `v1.7.0` is the generator's installed version readout. The validated snapshot is uniquely identified by the dated archive name and SHA256, **not** by that version string alone.

## Preservation and upgrade policy

Preserve a copy of the `.tar.gz` and `.sha256` **outside the printer** before flashing, updating, or wiping storage; check the archive against the hash above after copying. Use the last printer-tested Enhanced snapshot as the upgrade base. Port decay71/PAXX upstream changes selectively rather than replacing validated Enhanced Web/firmware trees wholesale.

See [UPGRADE_POLICY.md](UPGRADE_POLICY.md) and [RECOVERY.md](RECOVERY.md).
