# MultiACE Enhanced — backup, rollback and recovery (stable v2.0.0-enhanced.1)

**Scope:** Snapmaker U1 running the standalone PAXX 2.0 + MultiACE Enhanced firmware. These instructions distinguish **firmware rollback**, **configuration recovery** and **Spoolman database restore**. They are not interchangeable.

## Prepare a real fallback before installing

1. Download and SHA256-check a known-good PAXX or Snapmaker U1 firmware binary. Save it **outside the printer** alongside the Enhanced `.bin`.
2. Back up `/home/lava/printer_data/config/` and any selected printer history or macros to your PC. When using a custom PAXX `extended/klipper/` include, record the exact firmware version it requires.
3. Make a verified, separate copy of `/home/lava/printer_data/spoolman/spoolman.db` (if present). Stop Spoolman or use a consistent SQLite backup to avoid copying a live, partially written database; check the backup with `PRAGMA integrity_check`. Always preserve the original copy when restoring.
4. Keep any existing full recovery archives and manifests on your PC, not only in `/oem/` or `/userdata/`. **SHA256 verification of a recovery archive is not the same thing as testing the restore.**
5. Note physical filament in toolheads. If a reset removes its source record, the toolhead sensor may still be occupied; identify or safely unload the filament before reloading.

## Roll back the firmware image

Use the official PAXX/Snapmaker method: FAT32 USB, a **verified known-good** `.bin` in the USB root, then **Settings → About → Firmware Version → Local Update**.

If reverting to a firmware without multiACE (e.g. PAXX 1.6 `extended`), the old Enhanced includes can **prevent Klipper startup**. After preserving a backup, inspect the *active* files under:

```text
/home/lava/printer_data/config/extended/ace.cfg
/home/lava/printer_data/config/extended/klipper/90_multiace.cfg
```

On the project's U1, these stale configuration files remained after downgrading to PAXX 1.6 and caused an incorrect ACE expectation. The user moved the two files to a backup location outside active config. Klipper then returned `"state":"ready"`. Do **not** remove `00_keep.cfg` or other stock `extended/klipper/` files.

Also ensure old `/oem/overlay/upper` overrides and `/oem/multiace_persist/apply.sh` boot replays are **not** shadowing the active image. Verify the actual mounted overlay and firmware build version before changing anything. Do not delete the whole `/oem` tree or any Spoolman backup.

A rollback can change file formats/API expectations. Restore **only** those saved configuration components compatible with the firmware you actually installed.

## PAXX recovery flags are not firmware rollback

PAXX supports two documented reset mechanisms:

- `extended-recover.txt` on a USB drive: backs up and resets the **extended configuration** at boot.
- `full-recover.txt` on a USB drive (equivalent flag `/oem/.full-recover`): removes `/oem/.printer_data` and `/oem/.debug`, resets the extended config and reboots. This **can remove printer configurations and data**, but it **does not replace the firmware image** with an older version.

See [PAXX firmware config recovery](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/blob/v2.0.0-paxx12-24/docs/firmware_config.md#recovery--reset). Avoid destructive full recovery merely to switch firmware versions.

Because recovery resets PAXX extended settings, **SSH may be disabled afterwards**. Re-enable via **Settings → Maintenance → Root Access** on the touchscreen or `http://PRINTER_IP/firmware-config/` if available. PAXX documents the default login as root/snapmaker; change credentials on trusted networks.

## Restore Spoolman data

The integrated firmware uses the local Spoolman service, normally at `http://PRINTER_IP:7912/`, with its persistent database in:

```text
/home/lava/printer_data/spoolman/spoolman.db
```

Only restore user data after confirming the service is working with a fresh, empty database. A backup may be version-sensitive.

1. Stop the Spoolman service using its installed init script (`/etc/init.d/S99spoolman stop`) and verify it has stopped before touching the live DB.
2. Back up the existing target `spoolman.db` with a new dated filename on **persistent storage**.
3. Copy the verified replacement SQLite database to the exact configured data path, preserving ownership and permissions. If the installed Spoolman version or DB schema differs, review the migration path first; never blindly overwrite across major versions.
4. Start `/etc/init.d/S99spoolman start` and inspect API health and total spool counts. Test the classic Web UI separately from API responses.
5. Confirm RFID mappings and uniquely matched Spoolman preview. `spoolman_auto=False` is permitted; it means read-only matching without automatic adoption/sync.

**Never bundle a user's spool database in a public firmware release.**

## MultiACE Enhanced full recovery archive (development operator)

The project also tracks `recovery/make_full_recovery.sh` (standard `MULTIACE_FULL_RECOVERY_STANDARD_V3_1_PAXX20`) for development backup collection. A 2026-11-12 archive was created and its manifest/hash verified. On 2026-11-22, the owner separately verified a **35-spool** SQLite backup and the hash of their complete recovery archive.

These are **operator-specific**, do not ship as public artifacts, and **do not constitute a full restore rehearsal**. The `recovery/apply.sh` script from the old live-patched installation is **not the recommended restore method for the integrated stable firmware** because its legacy persistence replayer may overwrite files baked into the firmware.

## Diagnostic commands (read-only)

```sh
cat /etc/BUILD_VERSION /etc/BUILD_PROFILE
curl -fsS http://127.0.0.1:7125/printer/info
curl -fsS http://127.0.0.1:7912/api/v1/health
mount | grep -E 'overlay|printer_data'
```

For Klipper startup issues, inspect the **actual log path** from `/printer/info` (some configurations use `/oem/klippylogs/klippy.log` instead of `/home/lava/printer_data/logs/klippy.log`). Do not rely on an unrelated old logfile.

## Support and limitations

Firmware installation or recovery can damage the printer or its data. Keep a verified fallback, confirm the device is idle and physically safe, and do not use guessed commands to manually modify ACE head sources. This independent community firmware comes without a guarantee that every third-party hardware configuration has been tested. Report a reproducible problem at [GitHub Issues](https://github.com/atikturk/multiace-enhanced/issues).
