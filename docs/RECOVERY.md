# MultiACE Enhanced — Backup and Recovery

## Overview

MultiACE Enhanced includes a backup and recovery system designed to preserve customized components on the Snapmaker U1.

The system is intended to support firmware compatibility checks, file integrity verification, and recovery of modified components.

## Recovery Standard

**MULTIACE_FULL_RECOVERY_STANDARD_V3_1_PAXX20**

The recovery system has been prepared for the PAXX 2.0 environment.

### Features

- Full recovery archive creation
- SHA256 integrity verification
- Single-pass archive validation
- Backup of selected MultiACE and Klipper components
- Recovery preparation for firmware changes
- Persistent modification management

## Recovery Script

Location on the development printer:

`/oem/multiace_persist/recovery/make_full_recovery.sh`

The script is tracked in this repository as [`recovery/make_full_recovery.sh`](../recovery/make_full_recovery.sh). Printer-local script revisions and dependencies must be compared before use.

## Validation

The V3.1 script has passed shell syntax validation and standard marker checks.

Full execution and archive verification **PASSED on 2026-11-12** for the printer snapshot recorded in [`VALIDATION_20261112.md`](VALIDATION_20261112.md). The checked archive contains 9,517 regular files (230,288,451 bytes; approx. 220 MiB), with SHA256 `ab22434dace0244918095e35f5b2e69f30a3df81998bf575c6c3771f48564481`.

**Not yet established:** a real archive restore/rollback rehearsal or post-promotion Auto Replenish cold-boot revalidation. Successful archive integrity checks are not a restore test.

## Important

Recovery packages must be checked for compatibility before being applied to a printer.

## Documentation Status

Detailed backup and restoration instructions are under development.
