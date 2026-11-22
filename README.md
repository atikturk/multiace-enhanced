# MultiACE Enhanced — Snapmaker U1

**Hardware-validated stable release candidate:** v2.0.0-enhanced.1 — **full binary distribution not yet public**, pending proprietary firmware licensing clarification.  
**Target:** Snapmaker U1 • PAXX **2.0** (based on `v2.0.0-paxx12-24`) • multiACE Enhanced based on decay71 `v1.27b` • bundled Spoolman `v0.27.1`.

A self-contained, community-built **USB-upgrade firmware** integrating PAXX Extended Firmware, MultiACE Enhanced Web, RFID/Spoolman and additional print/filament features. The same integration is tracked in this open-source repository.

**Important:** Independent project. Not affiliated with or endorsed by Snapmaker, PAXX, decay71 or donkie. **Not tested for PAXX 2.1** or other Snapmaker models. Like any custom firmware, installation carries device and data risks; use the verified backup and rollback instructions.

## Download and install

The public release contains:

- `U1_extended-enhanced_2.0.0-stable1_upgrade.bin`
- `SHA256SUMS.txt`

SHA256 of the first stable firmware binary:

```text
b3fb88cea6a4c9480ec23ad734886ab2cd029ece04f1efb53af62f880358280a
```

After redistribution permission is resolved and a public binary is published: download, verify checksum, copy the `.bin` to a FAT32 USB drive and use the Snapmaker U1 touchscreen **Settings → About → Firmware Version → Local Update**. **No additional post-flash SSH installation is intended.**

- [Complete installation and preflight](docs/INSTALLATION.md)
- [Rollback, printer configuration and Spoolman database recovery](docs/RECOVERY.md)
- [2026-11-22 real-printer acceptance record](docs/VALIDATION_20261122_BUILD49.md)
- [Firmware changes](CHANGELOG.md)
- [Source/license notice](docs/THIRD_PARTY_NOTICES.md)

## Included features

- **MultiACE Enhanced** frontend/backend with Turkish, English, German and Chinese UI resources.
- One local **Spoolman 0.27.1** service on port `7912`; both the familiar **classic React** interface and the newer Svelte interface are packaged for offline use. Classic UI is default with same-origin `/api/v1`.
- RFID identification, per-slot material/vendor/colour, remaining grams and progress bars from uniquely matched Spoolman data, without requiring automatic adoption. `spoolman_auto=False` can remain enabled for **read-only previews**.
- One integrated Klipper/ACE installation and startup with ACE load/unload, state feedback and color-coded ACE → toolhead connections when an authoritative ACE source is known.
- Existing Enhanced work on **Auto Replenish**, tool-change/TTC code, local modes, Web and recovery. Individual print/runout corner cases should be validated for each machine; do not infer stress-tested hardware behavior from CI alone.
- Four UI locales, integrated setup/QA scripts and reproducible build using pinned open-source inputs. The released binary is **not preloaded with operator Spoolman records, private config, RFID UIDs or printer secrets**.

## Hardware acceptance

Built in [PAXX firmware Actions #49](https://github.com/atikturk/multiace-enhanced/actions/runs/45058047153) from source commit `9be7c886786a5c7249e1218beb90f3d0561351ea`; firmware checksum above.

The developer installed the **integrated firmware** on their Snapmaker U1 from a cleaned PAXX 1.6 baseline, with no follow-up frontend/backend/Spoolman hotfix. Verified: working MultiACE Web, classic Spoolman, four RFID-matched Spoolman progress bars (IDs #34, #29, #35, #36), normal unload/reload of T2, restored known-source wiring and two user-reported successful cold boots.

**Limits:** This is one operator/device and upgrade path, **not** a guarantee that every fresh/upgrade path, in-print runout, TTC under load, another ACE hardware revision or full backup restore has passed. Please report reproducible issues with firmware version and logs.

## Interface preview

![MultiACE Enhanced Web — ACE Pro Gen1 RFID and Spoolman](docs/screenshots/multiace-enhanced-web-ace-gen1.png)

*Photo from the project's development U1 in November 2026; may differ from other printers.*

## Corresponding source and rebuild

The following source directories are part of the firmware's corresponding integration source:

| Path | Description |
|---|---|
| [`klipper/`](klipper/) | MultiACE/Klipper modifications, including ACE modes |
| [`multiace_web/`](multiace_web/) | Enhanced backend, Vue frontend and four locale catalogs |
| [`firmware/`](firmware/) | init services and version metadata |
| [`packaging/paxx20/`](packaging/paxx20/) | Firmware overlay staging, first-boot setup, ARM64 dependencies and QA |
| [`.github/workflows/paxx20-candidate.yml`](.github/workflows/paxx20-candidate.yml) | Pinned complete PAXX+multiACE+Spoolman build |
| [`recovery/`](recovery/) | Historical, hardware-specific backup and recovery scripts; do not run blindly on another printer |
| [`docs/`](docs/) | Provenance, installation, hardware acceptance and recovery |

Build baseline: [PAXX v2.0.0-paxx12-24](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/releases/tag/v2.0.0-paxx12-24), [decay71/multiACE v1.27b](https://github.com/decay71/multiACE/releases/tag/v1.27b), [Donkie/Spoolman v0.27.1](https://github.com/Donkie/Spoolman/releases/tag/v0.27.1). PAXX's builder uses the stock U1 firmware input declared in its pinned `vars.mk`. Build work requires a compatible Linux/Docker/ARM64 emulation environment.

## Separate Android RFID writer

The earlier [Android RFID/NFC Writer v1.1.0-beta](https://github.com/atikturk/multiace-enhanced/releases/tag/android-rfid-20261106-preview) is **a different artifact** (development/debug APK) and must not be confused with this stable printer firmware.

## Contributors and licensing

Special thanks to **PAXX**, **decay71** and **donkie** for their foundational work. Full [credits](CREDITS.md), [GPL-3.0 repository license](LICENSE) and [component-specific notices](docs/THIRD_PARTY_NOTICES.md). Preserve original license/copyright notices when redistributing any upstream components.

Issues and feature feedback: [GitHub Issues](https://github.com/atikturk/multiace-enhanced/issues).
