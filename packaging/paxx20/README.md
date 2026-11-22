# PAXX 2.0 + MultiACE Enhanced + Spoolman — Combined Firmware

**Status: release engineering / not installable yet.** This directory is preparation for a SINGLE USB-upgrade `.bin`, not a released firmware image. Do not flash a generated candidate on a production printer until the gates below pass.

## Pinned starting points

| Component | Baseline |
|---|---|
| PAXX Extended Firmware | [`v2.0.0-paxx12-24`](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/releases/tag/v2.0.0-paxx12-24); built on stock U1 `2.0.0.205` |
| MultiACE upstream | [decay71/multiACE `v1.27b`](https://github.com/decay71/multiACE/releases/tag/v1.27b) — original base of the reviewed Enhanced snapshot |
| MultiACE Enhanced | This repository's `main`, exported from a working PAXX 2.0 printer; see [SOURCE_MANIFEST](../../docs/SOURCE_MANIFEST.md) |
| Spoolman server | [Donkie/Spoolman](https://github.com/Donkie/Spoolman), exact compatible version and deployment not yet pinned |

**Important:** PAXX 2.0 has Spoolman **integration** in Firmware Config / Filament Manager, but that is not evidence a standalone Spoolman **server** is already deployed on a fresh printer. This project must supply and initialize a clean persistent Spoolman service. The developer's own printer has an additional customized server in `/oem/multiace_persist` — do not distribute its database or personal runtime state.

**Spoolman packaging discovery (2026-11-21):** current upstream Spoolman v0.27.1's `scripts/start.sh` requires its own `.venv` and `.env`; the repo-only source is NOT runnable immediately after copying. Its exported `requirements.txt` pins `websockets==15.0.1`, while the Enhanced Web requirements specify `websockets>=11,<14`. Build the Web service and Spoolman in **separate Python environments** with a persistent Spoolman data directory. The exact version to ship must pass the real PAXX 2.0 U1 runtime tests; a working printer's private runtime files are not an appropriate substitute.

## Target user experience

1. Download one signed/checksummed `U1_extended-multiace-enhanced_2.0.0-..._upgrade.bin` from *our* GitHub Releases (NOT YET PRESENT).
2. Copy it to FAT32 USB, select `Settings > About > Firmware Version > Local Update`.
3. At first boot, initialize **one** MultiACE instance, Web UI at `/multiace/`, configuration defaults, and local Spoolman server with an EMPTY database (no personal printer data).
4. Confirm Klipper, ACE connection, TTC, Auto Replenish, RFID/Spoolman, four interface languages, and cold-boot persistence.
5. Supply a matching rollback path and checksums.

## Architecture for the PAXX 2.0 build

PAXX uses a modular overlay builder, `make build PROFILE=extended[-mod]`:
[Makefile](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/blob/v2.0.0-paxx12-24/Makefile);
[development guide](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/blob/v2.0.0-paxx12-24/docs/development.md).

Create `overlays/mods/enhanced/9x-multiace-enhanced/` and build with `PROFILE=extended-enhanced` in PAXX's Docker environment. The overlay must include:

- Compatible Enhanced Klipper extras, kinematics, toolhead modifications and module-switch boot order.
- The matching upstream MultiACE source, configuration templates, and generated launcher files; **never assume that merely copying `ace.py` activates the system**.
- Complete Enhanced Web, frontend/backend, nginx proxy, runtime Python dependencies, and an authenticated API path.
- No more than one backend listening on port 7126; correct `S58`, Klipper and Web startup sequencing.
- A separately packaged and version-pinned Spoolman server with persistent state, clean initial DB, port 7912 and start/stop recovery.
- PAXX 2.0 startup/overlay persistence rules; NEVER distribute the developer's persistent payload, snapshots, saved NFC UIDs, passwords, printer config, Spoolman DB, SSH files or recovery archives.
- All original copyright notices and compatible component licenses; indicate that this is an independent, unofficial PAXX/decay71 community build.

## Release blockers (all required)

- [ ] Confirm exact PAXX 2.0 base firmware checksum and reproducible custom image build.
- [ ] Confirm the published Enhanced code snapshot matches the intended field-tested runtime; document any changes after that validation.
- [ ] Implement clean-first-boot ACE config generation and auto-start **without a post-flash SSH installation step**.
- [ ] Package, run and cold-boot a *fresh, empty* Spoolman server in its own Python environment; confirm persistence, `.env` generation, API health and separation from the Enhanced Web dependencies.
- [ ] Verify Nginx Web access, all four languages, and Python dependencies on the actual firmware image.
- [ ] Test empty printer/ACE disconnected behavior, then Gen1 ACE attached with preload/load/unload.
- [ ] Reproduce physical TTC, in-print Auto Replenish, RFID/Spoolman matched and unmatched tags.
- [ ] Verify cold boot twice; test installation on a clean PAXX 2.0 printer or isolated test machine.
- [ ] Verify exact SHA256 and a practical rollback path; scan repository **and Git history** for secrets/personal data.
- [ ] Publish only after tests, with versioned `.bin` and a precise compatibility statement.

## Current files and limits

The public repository has **source code** and the Android writer debug APK, **not** a ready printer firmware image. The existing `docs/INSTALLATION.md` is intentionally incomplete. Do not advertise this branch as a downloadable firmware until the above gates pass.

We are tracking the PAXX 2.1 stable transition separately. The PAXX 2.1 **managed MultiACE** profile has different service/mount ownership and must not be used as a drop-in replacement for this PAXX 2.0 layout.

## Credit

Thanks to PAXX, decay71, donkie and upstream contributors. See [CREDITS.md](../../CREDITS.md).
