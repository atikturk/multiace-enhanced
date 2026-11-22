# PAXX 2.0 + MultiACE Enhanced — Stable v2.0.0-enhanced.1

**First public stable firmware release for Snapmaker U1.**

This is an independent community-built integration of PAXX Extended Firmware, decay71 multiACE and Donkie Spoolman. It is **not** an official Snapmaker, PAXX, decay71 or donkie release.

## Download

- Firmware: `U1_extended-enhanced_2.0.0-stable1_upgrade.bin` (332,806,912 bytes)
- Checksum file: `SHA256SUMS.txt`

**Firmware SHA256:** `b3fb88cea6a4c9480ec23ad734886ab2cd029ece04f1efb53af62f880358280a`

**Firmware code source:** [commit `9be7c886786a5c7249e1218beb90f3d0561351ea`](https://github.com/atikturk/multiace-enhanced/commit/9be7c886786a5c7249e1218beb90f3d0561351ea), built and QA-verified in [GitHub Actions #49](https://github.com/atikturk/multiace-enhanced/actions/runs/45058047153). The release branch adds updated docs and release workflows only; no firmware executable source files were changed since that accepted build.

## Included

- PAXX Extended Firmware **v2.0.0-paxx12-24** (stock base U1 2.0.0.205)
- MultiACE Enhanced based on **decay71/multiACE v1.27b**, with integrated Klipper/ACE and Enhanced Web
- Local **Spoolman v0.27.1** server and classic React UI as default (new Svelte UI also available)
- Fixed classical Spoolman client `/api/v1` configuration, no `Missing API URL`
- Read-only RFID Spoolman gram and progress-bar preview for uniquely matched reels while `spoolman_auto=False`; no automatic inventory binding/sync implied
- Correct Enhanced Web active inventory summary
- Four localized UI catalogs: Turkish, English, German, Chinese
- Included ACE loading/unloading, toolhead wiring for known ACE sources, and Enhanced TTC / Auto Replenish integrations

## What was physically tested

The exact #49 integrated binary was installed on a Snapmaker U1 starting from a cleaned PAXX **1.6** baseline. The operator confirmed the Enhanced Web, Spoolman, four RFID-matched slots (#34, #29, #35, #36; approx. 1000, 526, 1000, 1000 grams), normal T2 unload and reload, correctly saved ACE1 slot2 → T2 association, a visible black linking line and **two successful cold boots**.

During the transition, an already physically loaded T2 filament had lost its ACE source record because old configuration was deliberately cleared. Normal unloading and loading from a known slot restored both the live/persisted mapping and the connection line; that mapping survived the next cold boot. This was not reproduced as a new firmware source-persistence regression.

**Limits:** The field evidence is one U1/upgrade path, not every fresh first-boot, different ACE hardware or filament. Physical in-print runout, Auto Replenish/TTC stress and full recovery restore were **not independently demonstrated** by these results. PAXX 2.1 is **not supported by this verified build**.

## Install, rollback and source

- [Installation and SHA256 verification](INSTALLATION.md)
- [Recovery, full-recover caveats and firmware rollback](RECOVERY.md)
- [Actual #49 hardware test and evidence](VALIDATION_20261122_BUILD49.md)
- [Pinned upstream versions, copyright and license notices](THIRD_PARTY_NOTICES.md)
- [Public source and build recipes](../.github/workflows/paxx20-candidate.yml)
- [Credits — PAXX, decay71, donkie](../CREDITS.md)

**Important:** Back up printer configuration and any existing Spoolman SQLite data, retain a known-good checked firmware, verify compatibility and do not cut power while flashing. The public firmware does not include any personal user spool database, SSH keys, RFID identities or private printer settings.

## Community

Report bugs with firmware build version, non-sensitive log excerpts and reproduction steps via [GitHub Issues](https://github.com/atikturk/multiace-enhanced/issues). Preserve original component licenses and attribution when redistributing. Special thanks to **PAXX, decay71 and donkie** and their contributors.
