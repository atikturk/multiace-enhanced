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

The script will be published after reviewing its dependencies, backup paths, and compatibility requirements.

## Validation

The V3.1 script has passed shell syntax validation and standard marker checks.

Full execution and archive verification results will be documented separately.

## Important

Recovery packages must be checked for compatibility before being applied to a printer.

## Documentation Status

Detailed backup and restoration instructions are under development.
