# Validation and field evidence — 2026-11-11

## Environment

Snapmaker U1, PAXX `2.0.0-paxx12-24-417e639`, MultiACE `1.27b` with Enhanced changes, ACE 1 (Gen1), Spoolman. This repository snapshot is copied from a working printer rather than a clean fresh installation.

## Static checks performed on this export

* Python source syntax: **PASS** (using Python compiler / parser; no module imports or live execution).
* JSON parsing: **PASS** (all exported `.json`).
* Shell `sh -n` syntax: **PASS** for exported shell/service scripts.
* JavaScript syntax: **PASS** for the principal `app.js` using Node.js v22.
* SHA256 source integrity manifest: generated for every included copied file.
* Focused scan for embedded private keys, GitHub tokens, AWS access-key IDs and Bearer authorization literals: no hits in scanned text. **This is not a complete third-party security audit.**

## Previously reported physical observations

* User-reported tool-change / TTC work: **11/11 successful print-start tests** in the existing installed environment. This is operational evidence, not proof that PAXX 2.1.0 will behave identically.
* Cold boot on 2026-11-01: core Klipper and MultiACE file SHA256 values remained stable; Klipper and MultiACE started automatically, according to previous live tests.
* RFID/Spoolman: Gen1 ACE and the existing Web application were tested with tagged spools. This does not establish compatibility with all ACE generations/firmware versions.
* Recovery standard V3.1: syntax and marker checks passed; complete V3.1 archive production/restore must be tested separately.

## Outstanding tests before offering an installable release

1. Install/rollback on a separate or fully backed-up compatible printer.
2. Dependency packaging, post-install cold boot and recovery archive verification.
3. MultiACE/Spoolman startup ordering and no duplicate port listeners.
4. ACE Gen1/Gen2, RFID, Auto Load, Auto Replenish, print start, multi-head TTC under live workloads.
5. PAXX 2.1.0 managed profile compatibility (not yet tested).

No user identities, RFID UIDs, private settings, source credentials or print histories are included in the source package.
