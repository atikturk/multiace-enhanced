# Enhanced 2.0 — 1.94 integration baseline

Prepared: 2026-11-28. Status: source audit started; **no printer changes**.

## Exact sources

- Target: `decay71/multiACE`, tag `v1.94` (pre-release). Pin its immutable commit SHA before code import.
- Preserved snapshot: `atikturk/multiace-enhanced` `main`, originally exported 2026-11-11 from PAXX 2.0 + multiACE 1.27b. This repo is **not** a fork and does not contain the complete runtime or old upstream history.
- This working branch: `enhanced-2.0-integration`. Never replace `main` or flash the printer during source classification.
- Development printer state and its pending uncommitted changes may differ from the GitHub snapshot. Take a fresh printer-side source snapshot before claiming a final patch is equivalent.

## First code audit: feeder path

1. The existing provenance document identifies a narrow `REPLENISH` / `FEED_STA_PRELOAD_FINISH` exception in `klipper/extras/filament_feed_ace.py` relative to v1.27b. Its complete flow also touches `filament_feed.py`, `print_task_config.py` and `ace.cfg`. Do **not** copy the historic 5-line patch straight into 1.94.
2. The 1.94 `multiace/klipper/extras/filament_feed_ace.py` source has added unit-motion handling, including `FEED_UNIT_RUNNING_MAX_EXTRA_S = 120.0` not visible at the same location in the Enhanced snapshot. A direct file overwrite would discard local changes; a wholesale Enhanced overwrite would discard upstream behavior.
3. Compare entry points, states and command flags across the feeder chain; check whether 1.94 already implements replenishment; port only the missing behavior as an isolated patch with tests.
4. Gate changes behind a controlled, idle-device deployment after offline tests. Preserve original files and exact hashes.

## Integration order and acceptance gates

| Stage | Work | Gate |
|---|---|---|
| A | Pin target SHA; inventory file-level differences and ownership | Upstream version confirmed, no mixed release refs |
| B | Feeder/Auto Replenish and driver capability adaptation | Unit tests and state-transition review |
| C | RFID/Spoolman semantics, no-match secondary line, data persistence | Non-matched spool stays visually distinct; no unexpected records |
| D | Web backend, frontend, camera, Klipper console, print status | Validate existing print telemetry and camera routes |
| E | Config, preflight, OrcaSlicer, device cards and calibration decisions | Explicit confirmations and safe defaults preserved |
| F | TTC/PAXX integration, startup hooks, update/recovery | Firmware-specific patch review, single backend ownership |
| G | Cold boot, backup and rollback rehearsal, ACE Pro physical acceptance | No release until evidence is recorded |

## Decisions already fixed

- Reuse 1.94 driver architecture and Preflight estimation; preserve Enhanced elapsed/remaining/finish-time fields and smooth dynamic estimates.
- Spoolman unmatched RFID: second line blank. Do not silently auto-adopt.
- Remember Filament defaults off; Air-Print Detection defaults on in Enhanced 2.0.
- Background Swaps only enables for compatible MMU/firmware/mode.
- Bowden calibration compares current and measured values, persists only on confirmation.
- Updates come from `atikturk/multiace-enhanced`; upstream changes are advisory, not auto-installed. Backup and tested rollback are prerequisites.
- Preserve TTC adjustments as a separate PAXX-specific diff, not as part of generic multiACE code.

## Evidence still required

- Immutable commit SHA for upstream `v1.94` tag.
- Fresh printer-side snapshot including the later camera/console/print-status pending fixes.
- Complete per-module diff (this document is **not** that diff).
- Tests, restore rehearsal, and runtime compatibility validation.

Sources: `README.md`, `docs/UPSTREAM_PROVENANCE.md`, `docs/SOURCE_MANIFEST.md`, `docs/PAXX21_MIGRATION_READINESS.md` from this repository; upstream `multiace/klipper/extras/filament_feed_ace.py` and `multiace/docs/ENGINE_API.md` at `v1.94`.
