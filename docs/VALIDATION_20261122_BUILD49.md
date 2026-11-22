# Firmware #49 — on-device acceptance record (2026-11-22)

## Verified provenance

- Target: Snapmaker U1, upgrading from PAXX `1.6.0-paxx12-22-31c5a38` with profile `extended`.
- Integrated firmware: PAXX 2.0 + MultiACE Enhanced + Spoolman, candidate built in [Actions #49](https://github.com/atikturk/multiace-enhanced/actions/runs/45058047153).
- Source commit used to build image: `9be7c886786a5c7249e1218beb90f3d0561351ea`.
- Released-candidate image SHA256: `b3fb88cea6a4c9480ec23ad734886ab2cd029ece04f1efb53af62f880358280a`.
- GitHub stable release **draft**: `v2.0.0-enhanced.1` (not yet publicly published).

## Clean-baseline preparation and outcome

The developer first installed PAXX 1.6 to test a prior-version upgrade
rather than an in-place update of the already patched Enhanced firmware.

- The previous Enhanced frontend/backend/Spoolman file overlays were absent
  in `/oem/overlay/upper/` after recovery.
- The prior persistent `extended/ace.cfg` and
  `extended/klipper/90_multiace.cfg` conflicted with the PAXX 1.6 baseline;
  they were moved to a separate `/oem` backup instead of deleted.
- A stale `extended.backup.4` directory (139 MiB) was moved out of the
  watched printer configuration tree and preserved as a backup.
- Before the new Enhanced firmware installation, Klipper on PAXX 1.6 returned
  `{"state":"ready","state_message":"Printer is ready"}` and the normal
  `extended/klipper` directory contained only PAXX configuration files.

The developer then installed the **#49 integrated firmware** and reported:
**"kararlı sürüm tamam herşy yerli yerinde"** (stable firmware installed;
everything is in place). This is evidence of a successful physical
installation and a functioning post-install system **as reported by the
device operator**, not solely CI/emulation.

## What is not individually documented yet

- [x] **Two reported cold-boot checks** of #49 on 2026-11-22: the first after installation preserved ACE RFID/Spoolman gram displays; the second after physically re-establishing T2's source mapping was reported by the operator as **everything working perfectly**. The second result was user-reported without an additional API transcript; this is not evidence of extended print/runout stress testing.
- [x] Post-cold-boot Enhanced Web screenshot confirms Spoolman slot IDs #34, #29, #35, #36 and remaining gram values 1000 g, 526 g, 1000 g, 1000 g, respectively. The screenshot does not confirm total active/archive counts.
- [x] **T2 missing source resolved through normal physical unload/reload**: after cleaned migration, T2 retained physical filament but had no persisted ACE source (`head_source` all `None`, `ace__head_source` all `None`); an unloaded/reinserted Creality PETG from ACE 1 / slot 2 restored the correct `head_source` and matching saved `ace__head_source` (`ace_index:0`, `slot:1`, PETG Siyah), as well as the black SVG connector. Operator reported the subsequent cold boot as working perfectly. This is consistent with source metadata wiped during deliberate baseline cleaning rather than evidence of a broken SVG or source persistence bug. See [Issue #6](https://github.com/atikturk/multiace-enhanced/issues/6).
- [ ] Verification that all previously used hotfix overlay paths remain absent
  on installed #49, demonstrating the image is running its own files.
- [ ] Fresh installation with completely empty persistent printer data on a
  second device (the recorded path was a PAXX 1.6 **upgrade** after config cleanup).
- [ ] Full physical TTC/runout/Auto Replenish test record and verified rollback.
- [ ] Release audit for source redistributability, firmware binary provenance
  and sensitive files/history.

## Publishing interpretation

The project targets **public stable**, not a beta release. Public stable
publication requires recording the remaining critical acceptance items and
license/source audit. User-reported success is meaningful hardware evidence,
but it must not be silently equated with every test case above having passed.
