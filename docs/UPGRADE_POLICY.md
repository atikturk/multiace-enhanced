# MultiACE Enhanced — upgrade and persistence policy

## Non-negotiable source of truth

The **last verified, printer-tested MultiACE Enhanced state** is the starting point for each upgrade. A newer decay71/multiACE/PAXX release is an *upstream change source*, **not** a drop-in replacement for our validated Web UI or Klipper/Enhanced code.

1. Capture the current live source files, persistent active payload, service scripts, configuration, and SHA256 manifest before upgrading.
2. Archive the whole verified release with a unique tag/version and validate its recovery archive.
3. Obtain upstream as a separate snapshot or Git branch. Generate a file-level diff against the version previously integrated.
4. Port upstream fixes and new functionality to the Enhanced code **selectively**. Do not replace a whole frontend/backend directory to incorporate one upstream change. Resolve conflicts explicitly.
5. Validate syntax, Web rendering in all four languages, API compatibility, Klipper integration, TTC/Auto Replenish, RFID/Spoolman, and cold boot as applicable.
6. Only after validation, promote the live verified release to **persistent active** as a matching versioned snapshot. Record hashes. Do not promote an untested upstream snapshot.
7. On failure, roll back the *entire matching release* (frontend, backend, catalogs, relevant firmware integration), not an arbitrary mixture of versions.

## Confirmed drift on 2026-11-11

- Live `/home/lava/multiace_web/frontend/index.html` was dated Oct 31; the persistent active version was dated Oct 5. The live page includes additional Enhanced toolhead states.
- The live English, German and Chinese catalogs were behind the independently maintained persistent active catalogs. Verified catalogs have now been reconstructed and merged.
- In the published `recovery/apply.sh`, `restore_web_tree` compares **only `app.js`** as a representative hash. When the representative matches baseline, it copies **the entire frontend directory**, including `index.html`, even if other files differ. This is **not** a safe per-file version gate.

## Required persistence-manager correction

Before shipping another Enhanced release, replace single-representative tree replacement with one of:

- **Preferred:** full tree manifest/sha256 verification for a release-locked frontend and backend; allow replacement only when the destination matches the known upstream baseline **as a whole** or the full Enhanced active tree.
- Or: file-by-file restore with exact baseline or absent-target checks and explicit reporting of conflicts, never overwriting a divergent unrecognized file.

A successful check of `app.js` must **not** authorize overwriting a modified `index.html`. On incompatible files, stop and log/require explicit rebase; do not silently flatten the directory.

## Language policy

- Four catalogs: `en.json`, `tr.json`, `de.json`, `zh.json`.
- Compare all keys and template placeholders. Missing non-English keys can fall back to English, but no raw translation keys or Turkish-only strings are allowed in other locales.
- Do not embed user-facing Turkish/English strings directly in Vue templates. Use `t('...')` keys.
- Translate only UI labels, not user-defined RFID filament/spool material metadata.

## Release gate

Do **not** mark an update complete until:

- printer-tested live frontend/backend and persistent active payload are identical **for the managed components**,
- generated SHA256 manifest is checked,
- all four languages render correctly,
- recovery archive is validated,
- cold-boot restore is tested, and
- differences against the last verified Enhanced release are documented.

This policy applies to PAXX and decay71 upstream releases alike.
