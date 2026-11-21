# MultiACE Enhanced — Technical brief for PAXX and upstream maintainers

**Date:** 2026-11-11  
**Device:** Snapmaker U1 (ACE Gen1)  
**Tested firmware:** PAXX `2.0.0-paxx12-24-417e639`  
**Base engine:** decay71 MultiACE `1.27b`

## Purpose

Share field-tested integration changes and discuss which ones could be upstreamed as individual, reviewable patches. We do **not** request immediate inclusion of an unreviewed monolithic fork into a production image.

## Areas worth reviewing

**Auto Replenish / feeder control:** The working `filament_feed.py` reads an additional `REPLENISH` gcode argument and permits a narrow `PRELOAD_FINISH` exception to the in-print guard. Compare with upstream `filament_feed_ace.py` v1.27b; `print_task_config.py` supplies `RESUME REPLENISH=1`.

**Enhanced Web:** `multiace_web/backend/main.py`, frontend and translations add printer control, RFID/Spoolman display behavior and troubleshooting / preflight paths over the upstream Web API. This is a larger piece and should be reviewed feature by feature.

**Cold boot / persistence:** `recovery/apply.sh`, service scripts and the recovery/compatibility tools show the existing PAXX 2.0 approach, including hash-aware compatibility checks. They are not a drop-in solution for PAXX 2.1.0's managed bind-mount architecture.

**Time To Close (TTC), not Tool Change:** The observed MCU `Timer too close` shutdown during Z homing/probing led to a development-side Klipper [`toolhead.py`](../klipper/toolhead.py) DRIP timing change: `DRIP_SEGMENT_TIME` 0.050 → 0.100 and `DRIP_TIME` 0.100 → 0.350 (previous values from development notes; current values confirmed in this repository). The operator initially reported 11 consecutive successful print starts and has since confirmed **zero recurrences of the `Timer too close` error across all subsequent prints on the development printer** (approximately 20 prints reported since 4 November 2026; user estimate, not log-verified; the initial 11 starts should not be added to this count without confirming whether they overlap). This is stronger ongoing field evidence, **not a verified causal proof or an upstream-baseline diff**. See [TTC technical note](TTC_TIME_TO_CLOSE.md). Do not conflate this issue with tool changes or upstream multiACE ownership.

## Android RFID companion build (Gen1 ACE)

A separate [Android RFID NFC Writer v1.1.0-beta pre-release](https://github.com/atikturk/multiace-enhanced/releases/tag/android-rfid-20261106-preview) is included for review. The updated debug APK was uploaded on 2026-11-11, with Turkish and English UI localization, and is intended for the development printer's **single ACE Pro Gen1 / V1** setup.

The app is used to write custom filament RFID metadata (brand, material/type and color), supporting our Enhanced Web / Spoolman testing. **The Android source code is not included in this repository yet**; the APK is provided for functionality review, not as a reproducible Android build.

**Hardware-scope qualification:** Gen1 ACE firmware and the MultiACE Web UI do not necessarily expose identical RFID fields. The verified outcomes relate to the user's configured Gen1 setup and tag formats; no claim is made that every Gen1 firmware or stock U1 UI automatically exposes separate brand/type/color fields.

## Integration questions

1. Which changes should be submitted to decay71/multiACE first?
2. Which PAXX-specific start/persist helpers should be adapted to PAXX's managed package model?
3. Can we agree on small isolated PRs, beginning with the Auto Replenish guard change, rather than deploying the whole system at once?
4. What hardware test evidence is required for the Gen1 ACE path?

## Compatibility scope

This repository is an **auditable source snapshot**, not an installer. The existing PAXX 2.0 installation was physically tested. **PAXX 2.1.0 rolling managed MultiACE was not tested or installed** with these modifications, and compatibility must not be assumed.

## Credits and license

Built on the work of **PAXX**, **decay71**, and **donkie**. The repository's `CREDITS.md` preserves explicit acknowledgement. Upstream MultiACE and PAXX use GPL-3.0, subject to any component-specific notices; modifications are shared under compatible terms. Original notices remain in the included files.
