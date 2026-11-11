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

**Tool-change reliability:** `klipper/toolhead.py` and `klipper/extras/print_task_config.py` are included for comparison. The user reported 11/11 successful consecutive starts after TTC fixes on the existing hardware; the precise causal patch requires an upstream baseline diff before proposing a merge.

## Integration questions

1. Which changes should be submitted to decay71/multiACE first?
2. Which PAXX-specific start/persist helpers should be adapted to PAXX's managed package model?
3. Can we agree on small isolated PRs, beginning with the Auto Replenish guard change, rather than deploying the whole system at once?
4. What hardware test evidence is required for the Gen1 ACE path?

## Compatibility scope

This repository is an **auditable source snapshot**, not an installer. The existing PAXX 2.0 installation was physically tested. **PAXX 2.1.0 rolling managed MultiACE was not tested or installed** with these modifications, and compatibility must not be assumed.

## Credits and license

Built on the work of **PAXX**, **decay71**, and **donkie**. The repository's `CREDITS.md` preserves explicit acknowledgement. Upstream MultiACE and PAXX use GPL-3.0, subject to any component-specific notices; modifications are shared under compatible terms. Original notices remain in the included files.
