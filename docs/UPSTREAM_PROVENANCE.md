# Upstream provenance and changes relative to decay71 multiACE

**Status:** review guide, 22 November 2026. This is a source comparison, **not** a reconstructed Git history or a claim that every file differs from upstream.

## How this repository began

This repository was initialized on 11 November 2026 by exporting selected files from a working **Snapmaker U1** with **PAXX Extended Firmware 2.0.0-paxx12-24-417e639** and a **decay71 multiACE 1.27b** engine. The resulting Git repository was created from a *device snapshot*, not by forking the upstream Git repository. Consequently, the original upstream commit history and Git ancestry are missing from our own `main` branch. **That was a presentation/provenance mistake, not an assertion that the underlying code was written independently.**

- **Original upstream:** [decay71/multiACE](https://github.com/decay71/multiACE)
- **Reference release:** [multiACE v1.27b](https://github.com/decay71/multiACE/releases/tag/v1.27b), commit `a1a7b91b1fd297c1486a13ea22c61e01499a196d`
- **Firmware:** [PAXX Extended Firmware v2.0.0-paxx12-24](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/releases/tag/v2.0.0-paxx12-24)
- **Source export:** [SOURCE_MANIFEST.md](SOURCE_MANIFEST.md)
- **Printer test evidence:** [VALIDATION_20261112.md](VALIDATION_20261112.md)
- **Existing handoff:** [PAXX_TECHNICAL_BRIEF.md](PAXX_TECHNICAL_BRIEF.md)

## A verified, isolated code difference: in-print replenishment

Comparing **upstream** [`multiace/klipper/extras/filament_feed_ace.py` (v1.27b)](https://github.com/decay71/multiACE/blob/v1.27b/multiace/klipper/extras/filament_feed_ace.py) with **our** [`klipper/extras/filament_feed_ace.py`](../klipper/extras/filament_feed_ace.py), the Enhanced snapshot adds:

1. Parsing `is_replenish = gcmd.get_int('REPLENISH', 0, minval=0, maxval=1)` near the existing `PRINTING` argument.
2. Changing the in-print load restriction from unconditional `if is_printing == 1` to a check that **also** permits the specific case `is_replenish == 1 and self.channel_state[channel] == FEED_STA_PRELOAD_FINISH`.

This is a narrow candidate for an upstream patch. **The complete print-time flow also involves `filament_feed.py`, `print_task_config.py` and an `ace.cfg` setup; their exact upstream/stock baselines and compatibility need separate review before proposing a complete feature.** A source difference alone does not prove correctness or upstream acceptance.

## What we have checked is unchanged

The files below were compared against the same `v1.27b` sources and were **byte-for-byte identical** in the inspected revision:

| Upstream v1.27b | Enhanced snapshot | Result |
|---|---|---|
| `multiace/klipper/extras/ace_gen1_tunnel.py` | [`klipper/extras/ace_gen1_tunnel.py`](../klipper/extras/ace_gen1_tunnel.py) | Identical |
| `multiace/klipper/extras/ace_rc522.py` | [`klipper/extras/ace_rc522.py`](../klipper/extras/ace_rc522.py) | Identical |

These upstream decoders are foundational components we use. **We do not claim to have invented their decoding algorithms.**

## Larger changes that still need isolated review

| Area | What the snapshot shows | Review status |
|---|---|---|
| Web backend | [Enhanced `main.py`](../multiace_web/backend/main.py) differs from [upstream `main.py`](https://github.com/decay71/multiACE/blob/v1.27b/multiace/web/backend/main.py); an extra telemetry path is present among other changes | **Changed**, but not yet isolated into reviewable upstream patches |
| Web frontend | [Enhanced `app.js`](../multiace_web/frontend/app.js) differs from [upstream `app.js`](https://github.com/decay71/multiACE/blob/v1.27b/multiace/web/frontend/app.js) | **Changed**, requires per-feature classification and regression tests |
| Translations | Upstream v1.27b already includes **English, German, Chinese**. Enhanced adds a [Turkish catalog](../multiace_web/i18n/tr.json) and makes other catalog edits | Do **not** claim English/German/Chinese languages were newly invented by Enhanced |
| PAXX 2.0 persistence and boot handling | [`recovery/apply.sh`](../recovery/apply.sh) and [`firmware/init.d/`](../firmware/init.d) reflect local boot and guarded-restore work | PAXX-specific integration; not necessarily applicable to PAXX 2.1 managed profile |
| Full recovery | [`make_full_recovery.sh`](../recovery/make_full_recovery.sh) and [validation evidence](VALIDATION_20261112.md) | Archive creation and integrity checks were observed, **restore rehearsal not yet demonstrated** |
| Time To Close (TTC) | Earlier notes mistakenly called TTC “Tool Change”; **TTC means Time To Close** here | Exact Time To Close code change and its original firmware baseline **not yet identified**; no upstream patch claimed |
| Printer toolhead / print-task integration (separate topic) | [`klipper/toolhead.py`](../klipper/toolhead.py) and [`print_task_config.py`](../klipper/extras/print_task_config.py) | Upstream/stock baseline and causal differences remain **unverified** |
| Android RFID writer | An Android **debug APK** is available in Releases; its source is **not** in this repository | Companion test tool, not evidence of a source patch to decay71 |

## Git history and next maintenance steps

We will **not fabricate old commits or retroactively attribute commits to upstream authors**. To make review straightforward, the next work is:

1. Preserve the exact `v1.27b` upstream commit as an explicit Git baseline/ref in a dedicated development branch, with its genuine history obtained from upstream.
2. Produce targeted diffs against that baseline for the **feeder replenishment**, **Web telemetry/UI**, **RFID-Spoolman display behavior**, **translations**, and **PAXX-specific boot/recovery** areas.
3. Publish minimal topic branches/patches and tests, so upstream maintainers can review each contribution without diffing a large device export.
4. Retain all upstream license/copyright headers and explicit acknowledgements to **decay71, PAXX and donkie**.

The present `main` history **does not** by itself provide a useful `git diff decay71..enhanced`. Reviewers should begin with the verified example and file links above.

**Please tell us which isolated topic you would prefer to review first.** We propose the in-print replenish guard as the smallest starting point.
