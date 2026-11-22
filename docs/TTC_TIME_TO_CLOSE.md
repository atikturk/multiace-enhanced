# TTC (Time To Close): MCU timer / homing reliability

> Terminology note: **TTC means Time To Close in this project's correspondence**. It was incorrectly expanded to “Tool Change” in earlier documentation. The printer log itself says **`Timer too close`**; that log message must not be confused with extruder or tool changes.

## Observed failure

Intermittent print-start failures occurred during Z homing / probing, sometimes after several successful starts. Observed log messages included:

```text
MCU 'mcu' shutdown: Timer too close
Unable to obtain 'trsync_state' response
```

The issue was investigated on the development Snapmaker U1 with PAXX and MultiACE Enhanced integrations. Treat these as device-level field observations, not evidence that decay71's upstream multiACE caused the Klipper timing fault.

## Tested development-side change

The working Enhanced snapshot presently contains these settings in [`klipper/toolhead.py`](../klipper/toolhead.py):

```python
DRIP_SEGMENT_TIME = 0.100
DRIP_TIME = 0.350
```

The development notes record the changes as:

| Constant | Previous development value | Enhanced snapshot |
| --- | ---: | ---: |
| `DRIP_SEGMENT_TIME` | 0.050 | 0.100 |
| `DRIP_TIME` | 0.100 | 0.350 |

**Verified PAXX 2.0 source comparison (2026-11-22):** In GitHub Actions run [#44983842996](https://github.com/atikturk/multiace-enhanced/actions/runs/44983842996), the pinned PAXX `v2.0.0-paxx12-24` firmware builder extracted its actual post-overlay `toolhead.py` from the stock U1 firmware rootfs *before* the Enhanced overlay. That baseline contains `DRIP_SEGMENT_TIME = 0.050` and `DRIP_TIME = 0.100`. The working Enhanced snapshot contains `0.100` and `0.350`, respectively. The complete comparison changes **exactly two lines** (13-line unified diff), with no unrelated differences in `toolhead.py`. See [the verified TTC patch](patches/TTC_PAXX20_toolhead.patch). Base SHA256: `e8db5208b790d6d87a14b728384a261209db029be289e52adbadf7befa4b7c30`; Enhanced SHA256: `0924216d1a7039ce72ef3ab9d9e4fd4fc3e500ee2989624fa8c4ae600a4c24c2`. These results establish the source difference but do **not** prove that it is universally safe or independently causal.

## Validation and limitations

After the timing changes, the operator initially confirmed **11 consecutive successful print starts**. The operator has since clarified that **none of the subsequent prints on the same development printer has produced another `Timer too close` error**. Therefore, **11 is the initial recorded test series, not the total number of successful prints since the fix**. The operator estimates **approximately 20 prints since 4 November 2026**, all without recurrence of the TTC error. This is an approximate user-reported print count, not a count extracted from printer logs, and should not automatically be added to the initial 11 starts because overlap has not been ruled out. No claim of a universal fix or proof of which setting is causally necessary is made. Cold-boot persistence checks were separately reported.

An earlier experiment using a dedicated MCU homing command queue in `mcu.py` did **not** solve the recurring TTC fault: the error recurred on a later print start. **Do not present that trial as the validated TTC fix.**

## How upstream maintainers can review this

1. Review the [verified 2-line TTC patch](patches/TTC_PAXX20_toolhead.patch) against the pinned PAXX 2.0 post-overlay `toolhead.py` baseline, not an unrelated upstream multiACE file.
2. Confirm whether both changed timing values are appropriate for the U1 and whether any PAXX/platform timing assumptions need adjustment.
3. Repeat Z homing/probing and actual prints on the target firmware/hardware; the 2026-11-22 comparison is source-level only.
4. Keep the TTC / MCU timing issue separate from Auto Replenish, tool-change behavior, and the decay71 `multiACE` code lineage.

**Status:** 2-line patch against the pinned PAXX 2.0 firmware baseline **source-verified**. Physical testing of any new combined firmware build, independent causality, and maintainer acceptance remain pending.
