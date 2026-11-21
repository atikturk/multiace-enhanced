# MultiACE Enhanced — Changelog

Development history and improvements for MultiACE Enhanced on Snapmaker U1.

## Unreleased — Active Development

### Time To Close (TTC) & Printing Reliability
- **TTC means Time To Close, not Tool Change.** Documented the tested development-side Klipper DRIP timing values (`DRIP_SEGMENT_TIME = 0.100`, `DRIP_TIME = 0.350`) and the operator's initial 11 consecutive successful print starts, followed by **no recurrence on any subsequent prints on the development printer** (post-fix print count not recorded). The corresponding stock/PAXX baseline diff remains to be verified. See [TTC technical note](TTC_TIME_TO_CLOSE.md).
- Enhanced filament loading and unloading behavior.
- Investigated and corrected multi-material printing issues.
- Validated consecutive printing operations.

### Auto Replenish
- Improved Auto Replenish integration.
- Enhanced compatibility with MultiACE filament management.
- Added workflow stability improvements.

### RFID & Filament Management
- Enhanced RFID tag identification and decoding.
- Improved compatibility with ACE Pro RFID communication.
- Added support for customized filament identification.
- Improved handling of RFID tags without matching Spoolman records.
- Investigated RFID identification conflicts involving multiple tags on one spool.

### Spoolman Integration
- Improved MultiACE and Spoolman interoperability.
- Enhanced filament metadata handling.
- Improved identification of unregistered filament spools.
- Validated Spoolman service availability and startup behavior.

### MultiACE Web Interface
- Improved frontend and backend integration.
- Enhanced filament identification display behavior.
- Improved handling of filament metadata.
- Maintained compatibility with existing MultiACE interface functions.

### Firmware Compatibility & Persistence
- Improved compatibility handling for PAXX firmware.
- Added validation mechanisms for modified system files.
- Improved persistence of MultiACE modifications across cold boots.
- Validated automatic startup of Klipper and MultiACE components.
- Enhanced firmware modification safety checks.

### Backup & Recovery
- Developed backup and recovery procedures.
- Added SHA256 file integrity verification.
- Implemented firmware compatibility and rollback checks.
- Added isolated firmware safety self-tests.
- Prepared Full Recovery Standard V3.1 for PAXX 2.0.
- Added single-pass recovery archive verification.

### Testing & Validation
- Tested enhanced MultiACE functionality on Snapmaker U1.
- Performed cold-boot persistence verification.
- Validated critical file integrity across restarts.
- Tested RFID and Spoolman integration.
- Performed multi-material printing reliability tests.

---

## Release History

No public release has been published yet.

Version numbers and release dates will be assigned to verified distribution packages.

## Notes

This changelog currently summarizes development work performed on the test printer.

Individual changes will receive more detailed version history as the project files are reviewed and prepared for public distribution.

---

**MultiACE Enhanced — Snapmaker U1**
