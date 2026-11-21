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

The current source values above are verifiable in this repository. **The previous values come from development notes; a canonical stock/PAXX baseline diff has not yet been published.** Do not assume these values differ from any specific later PAXX or Snapmaker firmware without checking that firmware's source.

## Validation and limitations

After the timing changes, the operator initially confirmed **11 consecutive successful print starts**. The operator has since clarified that **none of the subsequent prints on the same development printer has produced another `Timer too close` error**. Therefore, **11 is the initial recorded test series, not the total number of successful prints since the fix**. The full post-fix print count and observation duration have not been quantified; no claim of a universal fix or proof of which setting is causally necessary is made. Cold-boot persistence checks were separately reported.

An earlier experiment using a dedicated MCU homing command queue in `mcu.py` did **not** solve the recurring TTC fault: the error recurred on a later print start. **Do not present that trial as the validated TTC fix.**

## How upstream maintainers can review this

1. Determine the exact Klipper `toolhead.py` shipped with the relevant stock Snapmaker / PAXX firmware baseline.
2. Compare its DRIP timing values and homing/probing logic against the Enhanced snapshot, not against an unrelated upstream multiACE file.
3. Review whether the timing adjustment is suitable for that platform, and test repeatability on hardware.
4. Keep the TTC / MCU timing issue separate from Auto Replenish, tool-change behavior, and the decay71 `multiACE` code lineage.

**Status:** documented field-tested Enhanced change; upstream-specific source diff and physical validation for any newly built firmware remain pending.
