# PAXX 2.1.2 + multiACE 1.94 — Enhanced migration

**Branch:** `migration/paxx212-multiace194`  
**Status:** WORK IN PROGRESS — **NOT FOR INSTALL / FLASH**  
**Base branch:** `release/paxx20-all-in-one`  
**Target package inspected:** `U1_paxx-rolling-8d8af0d_multiACE1.94.zip` (PAXX 2.1.2 / multiACE 1.94, profile `extended-decay71`).  
**Upstream source:** `decay71/multiACE` tag `v1.94`.

## Project decision

This project tracks upstream decay71 closely **without waiting for Enhanced-specific patches to be merged upstream**. We maintain Enhanced features as an independent downstream integration, credit upstream contributors, and port changes on a versioned migration branch.

## Migration rule

Do **not** overwrite new 1.94 modules with the old, monolithic 1.27b `ace.py`. Identify the new module owning each behavior, port the smallest safe change, and test. Do **not** flash either the raw upstream ZIP or a mixed-source development branch onto the working U1.

## Source ownership map

| Enhanced behavior | Current PAXX 2.0 branch | 1.94 integration target |
|---|---|---|
| RFID tag matching, spool bindings, consume/sync, `ACE_SPOOL_*` | `klipper/extras/ace.py` | `multiace/klipper/extras/ace_spool.py` |
| ACE Gen1 tag information | `klipper/extras/ace_gen1_tunnel.py`; `ace.py` | `ace_gen1_tunnel.py`; `ace.py`; `ace_spool.py` |
| Auto Replenish | `filament_feed.py`, `filament_switch_sensor.py` | `filament_feed_ace.py`, `filament_switch_sensor_ace.py` plus firmware integration |
| TTC/drip behavior | `klipper/toolhead.py` | Target PAXX `klippy/toolhead.py`; inspect base changes before setting `0.100 / 0.350` |
| Spoolman inventory & cards | `multiace_web/backend/main.py`; frontend patches | 1.94 `web/backend` and `web/frontend`, port inventory endpoints and menu |
| Turkish UI | `multiace_web/i18n/tr.json` | i18n in 1.94; check key compatibility |
| Camera & console | Enhanced backend/frontend fixes | 1.94 camera/console API contracts and UI |
| Spoolman startup & data | `S99spoolman`, live `/oem/printer_data/spoolman` | PAXX 2.1.2 service/overlay hooks; preserve live DB |
| Persistence/recovery | V3.2 backup on working U1 | New boot/overlay model; do not restore old `apply.sh` blindly |

## Physical reference state (last confirmed)

- Current U1 runs PAXX 2.0 + multiACE Enhanced 1.27b with RFID V1.6 and Spoolman Web V2.
- ACE1 slot1 → local #83 / Spoolman #27: `SM27,04ABCDEF123456`
- ACE1 slot2 → local #84 / Spoolman #10: `SM10,1D123456789ABC`
- ACE1 slot3 → local #85 / Spoolman #21: `SM21,1DABCDEF123456`
- ACE1 slot4 → local #86 / Spoolman #22: `SM22,04FEDCBA654321`
- 4/4 mappings survived `RESTART`; real print-based Spoolman consumption **has not been verified**.
- Unregistered RFID rolls must not be silently adopted into Spoolman, and their unregistered second line must stay empty.

## Gate 1 — source and data capture

- [x] Target 1.94 firmware ZIP supplied and static inspection performed.
- [x] Isolated migration branch created; current release branch unchanged.
- [ ] Import and compare **live V3.2 FULL RECOVERY** against upstream 1.94; use the actual installed V1.6 and Web V2, not an outdated GitHub snapshot.
- [ ] Confirm build and license/credits dependencies.

## Gate 2 — behavior ports

- [ ] RFID 4/4 bindings after Klipper RESTART and physical cold boot; swapped/unknown/duplicate tags never debit wrong spool.
- [ ] Spoolman stock, delayed-use sync, one-time registration consent, UID/SKU matching.
- [ ] Separate Enhanced inventory page and correct card second-line behavior.
- [ ] Auto Replenish/load/unload flow and TTC values/behavior.
- [ ] Camera snapshot/stream, Klipper console, Turkish UI, persisted web startup.
- [ ] Preserve Spoolman SQLite and `multiace_spools.json` on firmware upgrade.

## Gate 3 — testing and release

- [ ] Python compile + focused unit/regression tests + upstream `pytest`.
- [ ] GitHub Actions compiles the combined candidate and verifies SHA256.
- [ ] Audit PAXX 2.1.2 overlay behavior, restart services, DB schema/migration and rollback.
- [ ] Verify V3.2 backup and known-good PAXX 2.0 return path.
- [ ] First on-device validation when idle, then cold boot, then controlled real-print consumption.

**Status language:** “branch created” does **not** mean any 1.94 Enhanced port has passed build or printer tests. Keep this branch clearly labeled non-installable until all gates pass.

## 28 November — audit of V3.2 backup (do not confuse snapshots)

- The uploaded `MultiACE_Enhanced_v1.27b_20261127_200924_FULL_RECOVERY.tar.gz` passes its internal SHA256 manifest (**6,721 regular files**, no missing/extra/mismatched entries). SQLite consistency check passes; `multiace_spools.json` preserves **4/4 slot bindings** and **35 total spool rows** are present in the SQLite database.
- **IMPORTANT:** archived `klipper/extras/ace.py` SHA256 is `b5060e1c1f0fb58e8078b108addf96738e26ec34979b066249ef333a2ad24caa`, not the separately verified V1.6 installer source SHA256 `dced42785d3d752e20a64ca0111ab0f9e6748bec426f3b8406e78b2b35f96512`. Thus do not assume the archive's Klipper source includes all V1.6 changes; verify the live printer before replacing anything.
- Archived web backend SHA256 is `93d7a5e4263f7a0e1c3403f6cc7d0e93a7b899db5eb211adc47fbae2314c2abe`, and does **not** contain Spoolman manager routes or marker `ENHANCED_SPOOLMAN_BOUND_CARD_PREVIEW_V2`. Reconstruct the reference from the separately retained Inventory V1 and Web V2 patch source, **not** from this snapshot alone.
- The actual backup and live database are **private** and should never be committed to this public repository. Use synthetic RFID codes in public tests.
- Migration source patch created: `scripts/migration/port_uid_retention_multiace194.py`, tests in `tests/migration/test_port_uid_retention_194.py`; GitHub Actions passed **18/18** migration tests, including **5 real-upstream 1.94 V1-status RFID binding tests**; separately generated `candidate-ace_spool.py` compiled successfully. This is NOT a firmware build.

## 28 November — first upstream 1.94 validation PASS

- GitHub Actions run [46142178843](https://github.com/atikturk/multiace-enhanced/actions/runs/46142178843): **18 tests passed** on real upstream tag `v1.94`.
- Five simulated-real-source acceptance checks: four distinct known RFID SKU codes bind; previous four bindings survive the first V1 status frame; unknown tag does not create a local row; different tag unbinds stale binding; duplicated code is refused.
- The guarded Enhanced UID-retention port applied only to `SpoolMixin._spool_drop_if_unbound_sm` and `py_compile` passed. Earlier CI found two additional unrelated `_spools.pop` sites and was intentionally aborted by the first safety guard; this was corrected without modifying upstream code.
- **Pending:** test the patched module's behavior under real spool removal and persistence, port Web V2 and other Enhanced features, build and inspect firmware, and hardware smoke tests. Never treat this test as an installation green light.

## 28 November — Web V2 approved-card port PASS

- [CI run 46144496527](https://github.com/atikturk/multiace-enhanced/actions/runs/46144496527) passed **32/32** tests.
- Added `migration/overlays/web/backend/enhanced_spool_preview.py`: read-only 1.94 card enrichment using an **approved live binding only**; no vendor/colour guesses, no automatic adoption, no DB mutation, and unknown RFID leaves the second line empty.
- Added guarded `scripts/migration/port_spoolman_cards_194.py` to adapt upstream 1.94 `/api/state` to use its **existing** Spoolman collection cache instead of duplicating network/consumption paths.
- Added guarded `scripts/migration/port_spoolman_frontend_194.py` to present a second line in both classic slot cards and the panel's card template. Backend and Vue candidates compile/pass source anchor validation on actual upstream tag `v1.94`.
- This is **not a full Web V2 deployment yet**: original separate Inventory V1 page and write operations (bind/unbind/weight/edit/create/archive) are still pending port and integration tests. Do not install this migration branch on the printer.
