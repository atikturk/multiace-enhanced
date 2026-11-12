# PAXX 2.1 rolling `7f435c3`: offline inspection of the actual firmware image

**Date:** 2026-11-12  
**Source:** User-supplied `U1_extended-multiace_2.1.0-paxx12-develop-7f435c3_upgrade.bin`  
**Method:** read-only offline inspection of Rockchip firmware, extracted SquashFS root filesystem and selected files. **No printer-side changes were made.**

## Authenticity and image metadata

| Check | Verified observation |
|---|---|
| Firmware file size | 255,240,730 bytes |
| Firmware SHA256 | `da7f5408850a031b340e950a3e59bdff44a3d07a813e98aa11696b4dd6878583` |
| Official rolling asset checksum | Same SHA256, as published in PAXX GitHub release metadata |
| Embedded build file | `/etc/BUILD_VERSION`: `2.1.0-paxx12-develop-7f435c3` |
| Rockchip headers | `RKFW` and `RKAF` recognized |
| Root filesystem | SquashFS 4.0, Zstandard compression, 215,665,247 bytes |
| Root filesystem creation | 2026-11-07 14:36:26 UTC (embedded build time) |
| Firmware profile | `extended-multiace` **rolling/prerelease**, not stable PAXX 2.1 |

Package SHA256 equality validates transfer integrity relative to PAXX release metadata. It is not a physical hardware compatibility or rollback test.

## Native Snapmaker touchscreen: Turkish resources are present

- `/home/lava/resource/locales/tr-TR.json` exists inside this **specific** PAXX firmware.
- Its `language_name` value is `Türkçe`.
- Example UI strings: `cancel: İptal`, `confirm: Onayla`, `ok: Tamam`, `print: Yazdır`, `temperature: Sıcaklık`.
- Turkish and English locale files each contain 553 top-level keys; their sets of keys match exactly in this image.
- The stock touchscreen binary `/usr/bin/gui` is present (6,563,736 bytes); HelixScreen selection is optional and changes the running GUI.
- This establishes **packaged Turkish language resources for the stock Snapmaker screen**; it does not establish that the screen operates without glitches on physical hardware, or that the separately downloaded HelixScreen UI is localized in Turkish.

## PAXX-managed multiACE confirmed in firmware

The image includes:

- `/usr/local/share/extended-pkg/multiace`
- `/usr/local/share/multiace/common.sh`
- `/etc/init.d/S98multiace-web`
- `/etc/hooks/klipper.d/10-multiace.sh`
- `/usr/local/share/firmware-config/functions/27_settings_multiace.yaml`

Actual pin from `usr/local/share/extended-pkg/multiace`:

```text
PKG_URL=https://github.com/decay71/multiACE/releases/download/v1.27b/multiace-managed-1.27b.tar.gz
PKG_SHA256=aedc432f1ca56854ae3da98e28d6a947a9b4adc2bdb88e7feb760be472968556
PKG_APP_DIR=/oem/apps/multiace
```

The firmware's rootfs **does not contain** `/home/lava/klipper/klippy/extras/ace.py` as a standalone bundled ACE provider. On enablement, the pinned managed provider is downloaded and connected through PAXX-managed bind mounts. This provider package itself was **not uploaded/extracted/analyzed in this inspection**. Do not assume the stock file or any firmware-only inspection shows the complete running MultiACE behavior.

The firmware's `S98multiace-web` uses localhost port `7126` and exits when another listener occupies it. The component configuration explicitly tells users to remove standalone MultiACE installations before enabling managed integration. PAXX's `common.sh` binds provider modules read-only and may preserve an existing `ace.cfg`; it warns if a configuration merge helper is absent.

The default extracted `extended2.cfg` has no active `components ace: multiace` choice. It does not silently select managed ACE merely because the image is an `extended-multiace` profile.

## Key firmware-versus-validated-Enhanced source differences

| File/role | PAXX 2.1 firmware image (SHA256 prefix) | Last validated Enhanced live copy, 2026-11-12 | Assessment |
|---|---|---|---|
| Klipper `filament_feed.py` | 102,744 bytes; `0bce5efe` | 242,846 bytes; `15d71457` | Very different; firmware stock is not the managed provider, and neither should overwrite Enhanced blindly |
| Klipper `print_task_config.py` | 86,554 bytes; `7136fa5a` | 85,886 bytes; `4ffb067a` | Different; TTC/Auto Replenish interactions require rebase review |
| Klipper `toolhead.py` | 38,866 bytes; `e8db5208` | Previous exported Enhanced hash starts `0924216d` | Different; verify TTC behavior before claiming compatibility |
| `ace.py` | Absent as a standalone firmware file | 1,186,023 bytes; `b5060e1c` | Provider package must be separately assessed |
| Web init `S98multiace-web` | 3,046 bytes; `c854ac82` | Enhanced init script contains custom persistence and Spoolman hooks | PAXX owns the managed startup path; cannot transplant old hook unchanged |

Hashes for live Enhanced files come from the operator's printer verification outputs and/or the earlier source export. Not a complete 1:1 diff against the separately managed provider package.

Important: The image's stock `filament_feed.py` has no explicit `REPLENISH` argument in its `FEED_AUTO` command handling, unlike our Enhanced feature's narrow exception. The managed provider is a *separate* source; do not infer its content solely from the stock image.

## Offline structural/static checks

- Selected PAXX Klipper `filament_feed.py`, `print_task_config.py`, `toolhead.py`: Python syntax **PASS**.
- Selected shell scripts `S98multiace-web`, `10-multiace.sh`, `common.sh`, `30-helixscreen.sh`: `sh -n` **PASS**.
- Turkish/English JSON parse: **PASS**; 553 keys each, key sets equal.

No Klipper process, actual ACE hardware, touchscreen or display driver was run in this offline inspection. No installation or restoration was attempted.

## Decision and next steps

**Verdict: REVIEW / NO FLASH YET** on the main Enhanced printer. This is a verified PAXX 2.1 rolling firmware file, not a verified Enhanced migration.

Before migration, preserve the existing SHA256-verified Enhanced V3.1 recovery archive **off-printer**, finish the remaining current-firmware cold-boot acceptance check, review a specific released PAXX 2.1 build's screen regressions, obtain/review the **actual pinned managed multiACE provider package**, and decide between a standalone Enhanced adaptation and a PAXX-managed Enhanced provider. Avoid double Web listeners and legacy boot restore hooks overwriting PAXX-managed modules.

Previous analysis of an earlier rolling `52fa677` build is not interchangeable with this `7f435c3` image. See [PAXX21_MIGRATION_READINESS.md](PAXX21_MIGRATION_READINESS.md), [VALIDATION_20261112.md](VALIDATION_20261112.md), and [UPGRADE_POLICY.md](UPGRADE_POLICY.md).

Acknowledgments: PAXX, decay71, donkie.
