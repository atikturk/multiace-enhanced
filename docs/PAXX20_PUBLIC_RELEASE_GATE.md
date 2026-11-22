# PAXX 2.0 + MultiACE Enhanced — Public firmware release gate

**Release target:** Public GitHub Release of a single Snapmaker U1 PAXX 2.0 + MultiACE Enhanced + local Spoolman firmware `.bin`.  
**Release channel:** Public **stable** release after the integrated image passes hardware acceptance, reproducible checks, rollback documentation and the redistribution/license gate. No beta publication is planned.  
**Last updated:** 2026-11-22.  
**Current candidate:** [GitHub Actions #49](https://github.com/atikturk/multiace-enhanced/actions/runs/45058047153), commit `9be7c886786a5c7249e1218beb90f3d0561351ea`.  
**Candidate image SHA256:** `b3fb88cea6a4c9480ec23ad734886ab2cd029ece04f1efb53af62f880358280a`.  
**Status:** **Not yet published**. The `#49` image passed CI and emulated QA but has not been flashed and tested as an integrated binary on a physical printer. Do not confuse earlier `#47` hardware testing plus in-place hotfixes with testing `#49` itself.

## Goal and scope

The goal is **a public installable firmware**, not simply a fixed development printer. Keep the PAXX v2.0.0-paxx12-24 base, multiACE v1.27b, Enhanced Web, and local Spoolman v0.27.1 with classic React UI default. The new Svelte UI remains selectable. Do **not** bundle the operator's Spoolman database, spool/tag IDs, configurations, personal backups, or device secrets.

The tracked firmware builder remains [`paxx20-candidate.yml`](../.github/workflows/paxx20-candidate.yml), not yet a public release workflow. Its artifacts are intentionally marked `HARDWARE-UNTESTED`.

## What is already verified

- [x] Candidate #49 built; GitHub Actions reported success.
- [x] Offline ARM64 startup and restart of bundled Spoolman server, with blank test database, verified in QA.
- [x] First-boot ACE default mode and legacy blank Spoolman URL migrations verified in emulated QA.
- [x] Offline Vue, classic React and Svelte bundles included; classic React built with `VITE_APIURL=/api/v1`.
- [x] React UI was successfully repaired in-place on the development printer, as was the Vue inventory summary.
- [x] Development printer's API showed 30 active + 5 archived Spoolman records, 17,460.9 g active inventory, four ready ACE slots.
- [x] Unique RFID-to-Spoolman **display-only** matching on slots #34, #29, #35 and #36 verified on development hardware with `spoolman_auto=False`. Corresponding offline regression QA added in #49.
- [x] TTC code values and Auto Replenish source snapshot hashes compared against the validated hardware files.
- [x] A previous #47 image was physically installed; cold boot worked after in-place frontend fixes.
- [x] Upstream acknowledgements for PAXX, decay71 and donkie appear in README and CREDITS.md.

## Immediate acceptance: flash **the actual #49 binary** on the test U1

Before flashing, keep a **verified current recovery archive** (including operator-selected configuration and SQLite backup) in a location not replaced by firmware, and confirm the printer is idle. Keep the existing working firmware and rollback method available. Verify the downloaded `.bin` against the SHA256 above.

**Overlay caveat on the development printer:** prior hotfixes were written to
`/home/lava/multiace_web/backend/main.py`,
`/home/lava/multiace_web/frontend/app.js` and
`/home/lava/spoolman/client/dist/` while `/oem/overlay/upper` was active.
If PAXX preserves this upper layer across flash, these old files may **mask
the #49 squashfs versions** even after firmware installation. Before claiming
the integrated image was tested, inspect the matching paths in
`/oem/overlay/upper/`, preserve backups outside that upper layer, and only
then test the native #49 files. Do **not** delete the whole overlay or the
persistent Spoolman database; isolate only verified hotfix overrides as a
controlled procedure.

After flashing #49, **without applying prior hotfix commands**, inspect the following:

- [ ] Firmware boots into multiACE mode from current configuration; Klipper/Moonraker/Enhanced Web and local Spoolman are all up.
- [ ] **Fresh #49 build itself** serves the **classic** Spoolman UI at `:7912/`, without “Missing API URL”. Check UI and API, not API alone.
- [ ] Spoolman retains existing DB on this upgrade: 30 active and 5 archived rows. A *clean* first boot must start with **empty** DB; do not use personal production data for testing this.
- [ ] MultiACE UI shows the correct inventory total from `spoolman_inventory`, not 0 g.
- [ ] Four RFID slots show exact unique matched Spoolman IDs **and** remaining grams/progress bars with `spoolman_auto=False`; unmatched RFID tags must remain unmatched, and no undesired second-row data must appear.
- [ ] ACE preload/load/unload and toolhead status function correctly; no duplicated services or port conflicts.
- [ ] Shut down/start the printer **twice** (cold boot), recheck UI, API, mode, spool data and four slot grams, and confirm no persistence replay overwrites the integrated package.
- [ ] Restore/rollback path is verified and documented. Physical in-print runout and TTC-under-load tests are logged as **tested** or **not tested** accurately; never infer physical performance from QA alone.

Record build commit, firmware SHA256, device firmware version, test date, firmware installation path, screenshots, results and any unresolved issues in a release-validation note.

## Security, source and publishing gate

- [ ] Audit `git` history and candidate artifacts for sensitive data, RFID UIDs, DB files, tokens and printer-specific configuration.
- [ ] Check licensing and distribution permissions of **every bundled component** (PAXX and multiACE GPL-3.0; Spoolman MIT; any bundled platform/stock binary components need a separate redistribution review). Preserve upstream notices and offer corresponding source and build scripts together with distributed binaries.
- [ ] Update README and installation/recovery docs from historical “source-review only” statements to a precise, truthful **Snapmaker U1 / PAXX 2.0** compatibility description, preserving PAXX/decay71/donkie credits.
- [ ] Freeze a versioned source commit and image hash; build or attach a publicly accessible, long-retention firmware `.bin` to **GitHub Releases**, **not** a short-lived 3-day Actions artifact.
- [ ] Publish the stable release notes with test matrix, limitations, upgrade/clean-install guidance, rollback steps, SHA256 and links to corresponding source/licenses.
- [ ] Publish directly as a stable GitHub Release **only after** the native #49 image has passed real-device upgrade/first-boot/cold-boot checks and release/legal/security gates have been documented.

## Important distinctions

*The source repository itself is already public; the **firmware binary** has not yet been published as a GitHub Release.*

Successful CI, a correct SHA256, and successful in-place hotfixes are **necessary but not sufficient** proof that a binary is ready for general users. The purpose of the #49 flash is to eliminate exactly that gap, **not to wait without making progress**.
