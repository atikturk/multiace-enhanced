# MultiACE Enhanced — Snapmaker U1

Community-maintained source snapshot and integration work for **Snapmaker U1**, based on **decay71 multiACE** and the **PAXX Extended Firmware** ecosystem.

## Project status

**Source-review / development snapshot — not a one-click installer or an official PAXX package.**

The development printer runs **PAXX 2.0.0-paxx12-24-417e639** with a **multiACE 1.27b** engine. The project documents verified local improvements and aims to contribute reviewable changes upstream.

**PAXX 2.1.0 managed multiACE has not been validated with this Enhanced installation.** Do not apply these files directly to a different firmware version.

## Work areas

- **Auto Replenish:** a narrow feeder-state exception to support replenishment during a print.
- **Tool changes / TTC:** investigated printer-side timing and tool-change reliability.
- **RFID and Spoolman:** Gen1 ACE tag handling, inventory integration and Web display behavior.
- **Enhanced Web:** backend API additions, frontend changes and translations.
- **Persistence and recovery:** hash-aware startup restoration, compatibility checks and a PAXX 2.0 recovery standard.
- **Field evidence:** prior 11/11 print-start testing and cold-boot persistence checks on the development device.

## Source layout

| Directory | Contents |
|---|---|
| `klipper/` | Selected live MultiACE/Klipper modules and printer integration |
| `multiace_web/` | Enhanced backend, frontend and translations |
| `firmware/` | PAXX 2.0 build identification and selected service scripts |
| `recovery/` | Existing persistence and recovery scripts for code review |
| `scripts/` | Compatibility helper |
| `tests/` | Offline snapshot syntax and SHA256 verification |
| `docs/` | Provenance, test evidence, compatibility notes and technical handoff |

Source files are snapshots from an already configured device. They are **not** sufficient to rebuild or install a fully configured system on another printer. See `docs/SOURCE_MANIFEST.md`, `docs/VALIDATION_20261111.md`, and `docs/PAXX_TECHNICAL_BRIEF.md` when those files are present.

## Contributing upstream

The intended workflow is to isolate and review individual improvements for **decay71/multiACE** and PAXX, with particular attention to the small Auto Replenish behavior change. A monolithic merge is not assumed.

## Acknowledgements

Special thanks to **PAXX**, **decay71**, and **donkie** for their contributions to the open-source U1 and filament-management ecosystem.

- [PAXX Extended Firmware](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware)
- [decay71/multiACE](https://github.com/decay71/multiACE)
- [Spoolman](https://github.com/Donkie/Spoolman)

See [CREDITS.md](CREDITS.md) for full acknowledgement. This is an independent community effort, not an official or endorsed PAXX/decay71 release.

## License

This repository contains the **GNU General Public License v3.0** in [LICENSE](LICENSE). Preserve applicable upstream copyright notices and any component-specific licensing terms when reusing or distributing modifications.

## Safety of this snapshot

Avoid executing the recovery and initialization scripts on an unverified target. Hardware-dependent behavior, dependencies and rollback on a clean installation have **not** been independently verified.
