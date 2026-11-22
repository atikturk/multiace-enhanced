# MultiACE Enhanced stable firmware — Snapmaker U1 installation

**Publication status:** Stable candidate `v2.0.0-enhanced.1` passed physical acceptance but its complete `.bin` is **not yet public** pending proprietary Snapmaker component redistribution permission. These are installation instructions for the pending published image, not an active public download.

**Version:** `v2.0.0-enhanced.1` • **Base:** PAXX v2.0.0-paxx12-24 / Snapmaker U1 2.0.0.205 • **multiACE:** Enhanced based on decay71 v1.27b • **Spoolman:** v0.27.1.

This is an **independent community firmware** for **Snapmaker U1**, not an official release from Snapmaker, PAXX, decay71 or donkie. It does **not** target PAXX 2.1 or other Snapmaker printers.

## Download and verify

Download `U1_extended-enhanced_2.0.0-stable1_upgrade.bin` plus `SHA256SUMS.txt` from the [v2.0.0-enhanced.1 GitHub Release](https://github.com/atikturk/multiace-enhanced/releases/tag/v2.0.0-enhanced.1).

Image SHA256 for the first stable release:

```text
b3fb88cea6a4c9480ec23ad734886ab2cd029ece04f1efb53af62f880358280a
```

On Windows PowerShell:

```powershell
Get-FileHash "U1_extended-enhanced_2.0.0-stable1_upgrade.bin" -Algorithm SHA256
```

On Linux/macOS:

```sh
sha256sum U1_extended-enhanced_2.0.0-stable1_upgrade.bin
```

**Do not flash if the checksum differs.** Keep the verified working PAXX/Snapmaker firmware image for rollback.

## Before flashing

1. Confirm the printer is idle, no print is running, and any hot toolheads have cooled. Record the current firmware version and PAXX build profile.
2. Make an **off-printer** copy of the printer configuration, Klipper macros, existing Spoolman SQLite database, custom RFID/filament metadata and any recovery archives. Verify the copied files (SQLite integrity check and archive hash). Firmware installation and Full Recovery can affect persisted configuration.
3. Record which ACE slots and toolheads currently have filament physically loaded. Unload any filament as appropriate for a clean transition; **a filament physically remaining in the toolhead cannot automatically be assigned an ACE source after configuration reset**.
4. For an existing enhanced/multiACE development installation, **do not copy old `/oem/multiace_persist` recovery replay scripts or Web overlays** into the new build. Inspect the old `/oem/.debug` overlay and stale custom configs; save them outside the active config directory before the upgrade. Never bulk-delete the OEM or printer data volumes.
5. If upgrading from PAXX 1.6, remove/relocate only stale, independently confirmed MultiACE integration files such as `extended/klipper/90_multiace.cfg` and `extended/ace.cfg` **before** the baseline is evaluated. They are not present in a stock PAXX 1.6 `extended` installation and can prevent Klipper starting. Back up any files before moving them.
6. Make sure physical backup/restore options are available. The included firmware supports the standard PAXX local firmware update mechanism; the project does **not** guarantee recovery from a failed flash or a tested full backup restore.

## USB local update

Based on the [official PAXX U1 installation workflow](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/blob/v2.0.0-paxx12-24/docs/install.md):

1. Format a USB drive as FAT32.
2. Copy the **verified `.bin`** to the USB drive root directory (not the ZIP or `SHA256SUMS.txt`).
3. On the U1 touchscreen open **Settings → About → Firmware Version → Local Update**.
4. Select the image and confirm. Do not cut power during the update.
5. The printer restarts after successful installation. This should install the PAXX 2.0 + Enhanced firmware and required Web/Spoolman components **without an extra SSH script**.

The first stable build was physically installed on the project's U1 from a **cleaned PAXX 1.6 baseline**, and the operator confirmed working Web, RFID/Spoolman display, toolhead load/unload and successful cold boots; see [2026-11-22 validation](VALIDATION_20261122_BUILD49.md). **Do not infer that every possible upgrade path has been tested.**

## First-boot checks

1. Check the printer displays **Ready** rather than a Klipper failure. Open `http://PRINTER_IP/multiace/`.
2. Open the **classic Spoolman** UI at `http://PRINTER_IP:7912/`. It must load without `Missing API URL`; the bundled React app uses `/api/v1`. The newer Svelte UI is also bundled.
3. Check the locally hosted Spoolman API `http://PRINTER_IP:7912/api/v1/health`. **A new Spoolman installation may have an empty database**; the firmware does not bundle the developer's spool records.
4. Verify normal ACE RFID identification, material/brand/color, per-slot remaining grams for uniquely matching Spoolman records, and the dashboard inventory total. RFID preview can remain visible even with `spoolman_auto=False`; it does **not** automatically bind or change database records.
5. Verify the ACE → toolhead line only after a **normal successful load** from a known ACE slot. A physically occupied toolhead may display **Unknown source** if its mapping was cleared during the prior firmware cleanup. The correct fix is a controlled physical unload/reload, not guessing based on color or manually forging `ace__head_source`.
6. Verify required UI translations and basic load/unload. Do not activate an automatic print without confirming toolhead, sensors and filament routing.
7. Power off completely, restart, and verify Web/API/ACE/Spoolman again. Repeat once and confirm persistent source bindings and database state.

## Troubleshooting

| Symptom | First check |
|---|---|
| `Klipper failed to start` right after downgrade to PAXX 1.6 | Examine `klippy.log` and stale `extended/klipper/*.cfg` from older MultiACE; back up stale files before removing |
| `Missing API URL` | Confirm this version is actually installed and an old `/oem/overlay/upper` Web copy is not masking firmware's bundled client; restart the Spoolman service after verifying files |
| Old MultiACE UI appears | Check current BUILD_VERSION/BUILD_PROFILE and old persisted Web overlays/recovery replay |
| Spoolman DB empty | A clean install is expected to start with empty data; restore only a verified backup into the documented runtime location with service stopped |
| T2 physically loaded, source unknown | Old binding missing from `ace__head_source`; do not assign a guessed source, use supported unload/reload |
| Filament tag not recognized | Check physically seated spool and RFID state; never assign a wrong identity merely to fill a UI label |

## Recovery and rollback

See [RECOVERY.md](RECOVERY.md) before installing. Rollback means installing a **known-good, checksum-verified** PAXX or Snapmaker image via the standard USB local update, and restoring *matching* backed-up configuration only when its compatibility is known. Simply downgrading firmware without removing newer Klipper includes can prevent Klipper from starting.

The official PAXX `full-recover.txt` mechanism is a **destructive configuration/persistence reset**, **not a downgrade or restoration of firmware bits**. Do not use it as a substitute for a known-good rollback image.

## Project, sources and thanks

- [Corresponding sources and reproducible build](../.github/workflows/paxx20-candidate.yml) — combines pinned PAXX, decay71/multiACE and Spoolman with version-controlled Enhanced code; see [packaging README](../packaging/paxx20/README.md)
- [Release SHA256 and validation](VALIDATION_20261122_BUILD49.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Credits](../CREDITS.md): **PAXX, decay71, donkie**
