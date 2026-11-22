# Changelog — MultiACE Enhanced (PAXX 2.0)

This file records the hardware-validated stable firmware candidate v2.0.0-enhanced.1 for Snapmaker U1. Its full binary is not publicly distributed pending confirmation of redistribution rights for Snapmaker proprietary components; open-source project files remain public.

## Pending public release — v2.0.0-enhanced.1 PAXX 2.0 + MultiACE Enhanced (2026-11-22)

Build evidence: [GitHub Actions #49](https://github.com/atikturk/multiace-enhanced/actions/runs/45058047153)

Commit: `9be7c886786a5c7249e1218beb90f3d0561351ea`

Firmware SHA256: `b3fb88cea6a4c9480ec23ad734886ab2cd029ece04f1efb53af62f880358280a`

### Included in the candidate

- Combined PAXX 2.0 firmware, MultiACE Enhanced v1.27b-based modules,
  Enhanced Web and separately bundled local Spoolman v0.27.1 server.
- First-boot default multiACE mode initialization and migration for an
  existing `ace.cfg` with an empty local Spoolman URL.
- Offline Vue runtime in both Enhanced frontend paths.
- Offline Spoolman **classic React and modern Svelte** interfaces; classic
  selected by default, with React `VITE_APIURL=/api/v1` embedded at build.
- Read-only Spoolman active inventory totals in Enhanced Web independent of
  `spoolman_auto`, including reactive frontend state update.
- Display-only RFID-to-Spoolman slot weight/remaining-gram preview with
  `spoolman_auto=False` and safeguards for unique identities, ambiguous
  records, explicit bindings, and unregistered tags.
- Firmware QA guardrails for source-validated Auto Replenish snapshots,
  TTC comparison, emulated first boot and ARM64 Spoolman startup/restart.
- No user-specific Spoolman database, spool metadata or printer credentials
  included in the firmware build.

### Hardware evidence and limitations

- Earlier candidate **#47** was flashed to the development Snapmaker U1 and
  cold-booted. Its web problems required in-place fixes; those fixes are now
  incorporated into candidate **#49**.
- On #47 plus hotfixes, 30 active and five archived Spoolman rows were
  preserved; 17,460.9 g active inventory and four RFID-matched slot weights
  were displayed correctly with `spoolman_auto=False`.
- **#49 was physically installed on the development Snapmaker U1 after a
  cleaned PAXX 1.6 baseline.** The operator reported full functionality and
  two successful cold boots. A stale T2 physical filament initially had no
  source mapping after the deliberate baseline cleanup; physical unload/reload
  from ACE 1 slot 2 restored both the source association and the SVG link,
  and the new association survived the subsequent reported cold boot.
  Four RFID slot weights and Spoolman IDs are verified by UI screenshot.
  See the [field record](docs/VALIDATION_20261122_BUILD49.md).
- The public stable release follows reviewed source/license notices, firmware
  checksum verification, physical installation and two operator-reported cold
  boots. These do not independently establish physical runout/TTC-under-load
  stress performance or a full archive-restore rehearsal.
- In-print runout, TTC under load, fresh-device installation and rollback
  acceptance require separate truthful evidence. Do not label them as passed
  merely because code hashes or emulated QA checks passed.

Release checklist: [Public release gate](docs/PAXX20_PUBLIC_RELEASE_GATE.md).

## Credits

Independent community integration building upon contributions from **PAXX,
decay71, donkie**, and their upstream projects. See [CREDITS.md](CREDITS.md).
