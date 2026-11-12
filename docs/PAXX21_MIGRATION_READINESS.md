# PAXX 2.1 migration readiness — MultiACE Enhanced

**Prepared:** 2026-11-12 · **Status:** PREPARED FOR REVIEW; **NOT CLEARED FOR FLASHING OR AUTOMATED MIGRATION**

## Offline verification of the uploaded 7f435c3 firmware binary

On 2026-11-12 the actual PAXX `extended-multiace` rolling `7f435c3` firmware image was uploaded and its official SHA256 verified. The extracted native Snapmaker touchscreen resources **include Turkish** (`tr-TR.json`, 553 translation keys matching English key set). PAXX-managed MultiACE is **pinned separately** to decay71 `v1.27b`; its provider package is downloaded at enablement rather than bundled in the rootfs. Klipper stock files and boot service differ materially from the current Enhanced live system. These findings do **not** authorize flashing or establish touchscreen runtime stability. See [the actual firmware binary audit](PAXX21_FIRMWARE_BIN_AUDIT_20261112.md) for hashes and evidence.

## Verified upstream state (2026-11-12)

- Public PAXX repository: https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware
- Most recent stable PAXX release observed: `v2.0.0-paxx12-24` (2026-10-25).
- Rolling `develop` build: `v2.1.0-paxx12-develop-7f435c3`, updated 2026-11-07. This is a **prerelease moving build**, not stable 2.1.0.
- Rolling build has **three separate firmware profiles**: default `extended`, `extended-afc`, and `extended-multiace`. Do not confuse them.
- Official Snapmaker **stock** 2.1.0 was published 2026-11-04; this is not the same as a released stable **PAXX 2.1**.
- Reports to recheck before selecting a build:
  - Stock 2.1.0 physical touchscreen black screen during printing: https://forum.snapmaker.com/t/bug-snapmaker-u1-firmware-2-1-0-touchscreen-goes-black-during-printing-and-wont-wake-up/44076
  - PAXX remote-screen touch event device: https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/issues/857
  - PAXX Web interface unavailable: https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/issues/877
  - PAXX 2.1 develop `config` inotify issue: https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/issues/860
  - HelixScreen spool display: https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/issues/880
- Do not assume these distinct issues share one cause or are all fixed by an upstream release.

## Verified *source of truth* before migration

- Printer: Snapmaker U1, PAXX 2.0 lineage, one Anycubic ACE Pro Gen1.
- Last validated Enhanced Web, i18n and boot-hook state: see [VALIDATION_20261112.md](VALIDATION_20261112.md).
- Verified full recovery archive, **stored on printer, not in GitHub**:
  - File: `/userdata/recovery_packages/MultiACE_Enhanced_v1.7.0_20261112_055900_FULL_RECOVERY.tar.gz`
  - Bytes: `230288451`
  - SHA256: `ab22434dace0244918095e35f5b2e69f30a3df81998bf575c6c3771f48564481`
  - Reported 9,517 regular files with validated manifest, Spoolman application/data included.
- Preserve the matching `.sha256` file and independently verify copies made **outside the printer**.
- This archive has been **created and verified**, not actually restored on a separate installation.
- Last Auto Replenish `active` promotion (four files) was made **after** the successful cold boot. A **second cold boot** still needs to demonstrate `AR_SET_ALREADY_VALIDATED` and normal Klipper/Web startup. Do not claim it already happened.

## Architectural conflict: PAXX-managed multiACE vs our standalone Enhanced

PAXX docs: https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/blob/develop/docs/multiace.md

Its **experimental, rolling-only** `extended-multiace` profile is not an in-place upgrade of our standalone installation:

- A reviewed/pinned decay71 multiACE release is installed under `/oem/apps/multiace/` with `latest`.
- Selected provider Klipper modules are **read-only bind-mounted** over stock paths. PAXX switches between stock and managed modules without overwriting original files.
- The persistent provider config is under `/home/lava/printer_data/config/extended/multiace/`; Web exposed at `/multiace/` with localhost backend.
- PAXX controls installation, enable/disable and upgrades; provider self-update/standalone file copying is disabled in managed mode.
- **Never enable two independently launched multiACE copies or competing Web port 7126 listeners.**
- Our PAXX 2.0 `/etc/init.d/S98multiace-web` hook, `/oem/multiace_persist/apply.sh`, `S58multiace-mode`, spoolman boot hook and Auto Replenish restoration must be reviewed and migrated together; they are not implicitly compatible with read-only mounts.
- The managed `v1.27b` provider package documents an outstanding configuration merge helper gap (`tools/merge_ace_cfg.py` absent from published archive): verify before any automatic config migration.
- Existing Enhanced improvements (TTC, Auto Replenish, RFID/Spoolman, unmatched-spool UI semantics, four language catalogs, Web backend/frontend, preflight and recovery) must be selectively ported or kept intentionally isolated. Do not overwrite the managed package with printer-local Enhanced files.

## Migration decision points (NO destructive commands until approved)

1. **Choose actual firmware build and exact checksum** when a stable/reviewed 2.1 package appears; record the release's tag, commit SHA, dated changelog, firmware profile, artifact name and SHA256. Verify touchscreen/HelixScreen/Remote Screen known issues against *that build*.
2. **Finish today's baseline acceptance:** only when the device is idle, cold boot the existing Enhanced installation and verify Klipper, Web, Spoolman, UI all four locales, ACE ready state, persistent hashes and `AR_SET_ALREADY_VALIDATED`. Record results in a new validation note.
3. **Safeguard off-printer** the V3.1 full recovery `.tar.gz` and `.sha256`; verify SHA256 *on the computer*. Keep the currently working PAXX 2.0 firmware `.bin` and a documented independent return-to-PAXX-2.0 path.
4. **Compare released integration architecture** against experimental `develop` documentation. Confirm whether the **stable** 2.1 firmware actually includes a managed multiACE profile; a stable `extended` image and a rolling `extended-multiace` image are not equivalent.
5. **Choose exactly one integration owner** before enabling ACE: (A) retain standalone Enhanced on a compatible 2.1 environment with validated persistence changes, or (B) develop a version-pinned PAXX-managed Enhanced provider with its own package digest, adapted runtime config and reviewed hooks. Do not operate both.
6. **Produce change set and dry-run review** from our frozen Enhanced reference to the exact upstream target; start with `scripts/paxx_multiace_compat.py` on extracted **combined/provider** sources, inspect its report, and perform manual diff review. Do **not** supply a bare firmware `.bin` to this analyzer or treat `SAFE` as permission to flash.
7. **Only then plan a change window**, document reversible service/boot-hook handover, config backup, rollback and failure thresholds. No uncontrolled `cp -a` into managed mounts, no package manager updates that silently replace Enhanced, and no `full-recover.txt` on a production printer without understanding that it wipes data.
8. **Acceptance after migration:** screen stays responsive (stock and chosen third-party UI); Klipper and MultiACE start with one Web listener; ACE Gen1 device ready; 4 UI languages; RFID present/absent and no-match secondary-line behavior; Spoolman records/inventory intact; preload/unload and TTC; Auto Replenish including a physical test when safe; cold boot with file hash confirmation; verify rollback works for the matching snapshot.

## Release gate

**GO** for migration only if the exact build is known, high-impact screen regressions resolved or an appropriate workaround verified, backup off-device verified, provider ownership and file-mount conflict resolved, dry-run diff reviewed, rollback planned, and an idle-printer test window is available.

**NO-GO** if current PAXX build is a moving rolling binary on the main working printer, screen remains broken for the intended configuration, manual standalone hooks conflict with the managed provider, update would automatically overwrite Enhanced, or the only backup remains on-device.

## Sources and scope

This document is a migration **plan**. It does not claim PAXX 2.1 support, hardware validation, that the private source repository and printer are byte-for-byte identical, or a fully tested automatic 2.1 installer. PAXX/develop features, releases and issue status must be rechecked at flash time.

Project attribution: PAXX, decay71 and donkie. See [CREDITS.md](../CREDITS.md).
