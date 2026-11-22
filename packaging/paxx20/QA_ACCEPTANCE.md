# PAXX 2.0 Enhanced one-bin: release acceptance gates

**Target:** Snapmaker U1, pinned PAXX `v2.0.0-paxx12-24`, decay71 multiACE `v1.27b`, bundled Donkie Spoolman `v0.27.1`.

This checklist is a **gate**, not a statement that any listed test has passed.
The CI image is an integration prototype until an operator records both the
offline and physical results.

## Offline gates (GitHub Actions)

- [ ] Pin and SHA-check the vendor stock `U1_2.0.0.205` firmware using PAXX `vars.mk`.
- [ ] Generate a complete UPFILE `.bin` with the PAXX overlay builder (ARM64).
- [ ] Record PAXX-to-Enhanced TTC `toolhead.py` baseline values, full diff and SHA256.
- [ ] Bake Enhanced backend's own ARM64 dependency tree; import full FastAPI app.
- [ ] Bake Spoolman v0.27.1 backend's isolated dependency tree and built Svelte UI.
- [ ] Confirm rootfs includes executable S49/S58/S98/S99, ACE templates and an nginx route.
- [ ] Simulate first-boot PAXX S49 configuration seeding.
- [ ] Simulate S58 ACE activation with **unaltered PAXX original file backup**.
- [ ] Start the actual Spoolman service under ARM64 emulation, check `/api/v1/health`,
      `/api/v1/info`, empty `/api/v1/spool`, the new SQLite DB and restart.
- [ ] Record the completed image SHA256/size and ensure it fits U1 partitions.
- [ ] Review bundled source/license credits and verify no user spool database,
      passwords or NFC IDs were included.

Passing these shows *software integration in an emulated rootfs*, NOT that
flashing or ACE operations are safe on the user's hardware.

## Physical acceptance (operator required, never automated)

**Before touching a printer:** retain a known-good PAXX 2.0 .bin and an
off-printer tested full backup; document the installed firmware and active
Spoolman database location. A full backup's checksum verification does
**not** by itself prove that a restore procedure works.

1. Validate an image on a clean or dedicated test U1 before upgrading a
   personalized printer. Existing `/oem/.debug` overlay and
   `/oem/multiace_persist/apply.sh` may shadow baked new files; do not
   assume a direct in-place upgrade preserves or replaces their behavior.
2. Flash from FAT32 USB via Settings → About → Firmware Version → Local Update,
   following PAXX/Snapmaker's installation guidance.
3. On first boot confirm: no Klipper config error, one Enhanced Web backend on
   loopback :7126, exactly one Spoolman server on :7912, and Web /multiace/
   works. Check `/api/v1/health` and confirm no old Spoolman service owns 7912.
4. Confirm first-boot empty Spoolman database, and that the printer's existing
   user database was NOT silently overwritten. On upgrades, verify the
   `spoolman.before-enhanced-v0271.db` backup if an older DB existed.
5. Verify all four locales, ACE connected/disconnected startup, unload/load,
   RFID matched and unmatched behavior, and that the empty secondary display
   line for unmatched/unregistered spools remains unchanged.
6. Verify Auto Replenish, print-start Z homing/probing TTC, several actual
   prints and two full power-off cold boots. Capture logs and hashes.
7. Try normal-mode fallback and restoration of the known-good firmware and
   saved user configuration on a test device before release.
8. Only after these checks: remove the test-only label, publish a versioned
   `.bin` with SHA256, known-good rollback image and exact hardware support
   statement. Request maintainers' review; do not imply official PAXX or
   decay71 endorsement.

## Commands for a supervised post-flash check

```sh
cat /etc/BUILD_VERSION
/etc/init.d/S99spoolman status
/etc/init.d/S98multiace-web status
wget -qO- http://127.0.0.1:7912/api/v1/health
wget -qO- http://127.0.0.1:7912/api/v1/info
grep -E '^DRIP_(SEGMENT_TIME|TIME) =' /home/lava/klipper/klippy/toolhead.py
grep -F 'include ../ace.cfg' /home/lava/printer_data/config/extended/klipper/90_multiace.cfg
```

Do not perform this on a running print. No SSH install should be needed to
bring up services; the commands are diagnostic only.
