# Third-party source, license and attribution notices

**Applies to:** Snapmaker U1 PAXX 2.0 + MultiACE Enhanced `v2.0.0-enhanced.1`.

The project builds a single device firmware image from pinned upstream projects and publishes its own integration sources. This is **not** an official firmware from any of the upstream maintainers. Component trademarks belong to their respective owners.

| Component | Pinned source / commit | Reported upstream license |
|---|---|---|
| PAXX Extended Firmware | [v2.0.0-paxx12-24](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/tree/417e6394f62366e010a3f76f8e567f67db770165) · `417e6394f62366e010a3f76f8e567f67db770165` | GPL-3.0 |
| decay71 multiACE | [v1.27b](https://github.com/decay71/multiACE/tree/a1a7b91b1fd297c1486a13ea22c61e01499a196d) · `a1a7b91b1fd297c1486a13ea22c61e01499a196d` | GPL-3.0 |
| Donkie Spoolman | [v0.27.1](https://github.com/Donkie/Spoolman/tree/ff8efd517b76a4b2783f29c89e9b9fbcd8cd167b) · `ff8efd517b76a4b2783f29c89e9b9fbcd8cd167b` | MIT |
| MultiACE Enhanced additions | [This project's corresponding source commit](https://github.com/atikturk/multiace-enhanced/tree/9be7c886786a5c7249e1218beb90f3d0561351ea) | GPL-3.0 (repo `LICENSE`), while component-specific upstream notices remain applicable |
| Vue.js runtime | Local `vue.global.prod.js` is taken from pinned decay71 source; Vue.js | MIT |

The upstream repositories and selected license files were checked on 2026-11-22. Their complete license texts are available via the original source links above, and this repository includes the GPL-3.0 text in [LICENSE](../LICENSE). The MIT notices required by bundled open-source components must be retained when copying or redistributing those components; refer to their original distribution trees and license files, including [Spoolman LICENSE](https://github.com/Donkie/Spoolman/blob/v0.27.1/LICENSE).

**Source and reproducibility:** The public sources for Enhanced changes are in this repository. The [firmware builder](../.github/workflows/paxx20-candidate.yml) clones the pinned upstream source tags, layers our files via [stage_overlay.py](../packaging/paxx20/stage_overlay.py) and [finalize_overlay.py](../packaging/paxx20/finalize_overlay.py), and builds with the upstream `PROFILE=extended-enhanced`. PAXX's stock Snapmaker firmware input is declared in [upstream `vars.mk`](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/blob/v2.0.0-paxx12-24/vars.mk):

- Firmware: `U1_2.0.0.205_20260914173503_upgrade.bin`
- SHA256: `e6269eb0f1d9e8da74173e9da6350a14b18dd2fe5c4e8f2cabc48b0cdaf2aad7`

## Proprietary Snapmaker firmware: separate redistribution permission required

**Important outstanding license gate for the full 332 MB combined firmware image.** Verifying GPL-3.0/MIT licenses for PAXX's integration, multiACE, Spoolman and Vue **does not** authorize copying or distributing Snapmaker's distinct proprietary firmware, GUI and system services.

Snapmaker's official [U1 Terms of Use](https://www.snapmaker.com/terms-of-use) section 6.4.4 identifies these non-open-source components as proprietary and grants a personal, non-transferable license; section 6.4 restricts unauthorized redistribution. The [Snapmaker community team's explanation](https://forum.snapmaker.com/t/u1-custom-firmware-and-toolkit/40500/6) also states that proprietary files must not be included in shared toolkits and discusses distributing proprietary code only with authorization.

The PAXX project publicly distributes modified combined firmware, but that fact **alone does not establish written sublicensing permission for an independent downstream project**. We have not verified written authorization from Snapmaker for this project's independent redistribution of the complete PAXX-based `.bin`.

**Publication consequence:** The GitHub Release containing the complete firmware remains an **unpublished draft pending explicit confirmation** that Snapmaker proprietary components may lawfully be redistributed in this project, either from Snapmaker or from rights holders able to grant such permission. The open-source Enhanced source code and build recipes may remain public under their respective licenses. A safer alternative, absent permission, is publication of open-source patches and build instructions that have individual owners download official firmware themselves without this project distributing proprietary bytes.

This is not a claim that PAXX or any other developer lacks permission. It is an explicit record of what has and has not been verified **for this repo's distribution**.

**Stock firmware / bundled dependencies:** The device base image also contains Snapmaker-supplied and other bundled system components. The original manufacturer terms and component-specific licenses are not replaced by this project's GPL-3.0 license. The upstream PAXX project distributes a combined U1 firmware image; this project retains that packaging approach and its source/build correspondence. Third-party binary-only parts must be used and redistributed in accordance with the relevant manufacturer permissions; this notice is **not** a representation that all non-open-source system components are GPL-licensed.

**No operator secrets included by design:** The integration workflow sources a repository/clean upstream checkout and does not include the developer printer's `/oem` backup archives, private SQLite spool data, NFC tag identifiers, Wi-Fi settings, SSH keys or user printer configuration. Release auditing should include **both the source tree and image**; never ship field backups as extras.

## Full credits

- **PAXX** for Snapmaker U1 Extended Firmware and its firmware build platform.
- **decay71** for multiACE, the ACE engine and Web foundations.
- **donkie** for Spoolman and the community tooling ecosystem.

See [CREDITS.md](../CREDITS.md) for the full acknowledgements and links. The firmware remains an independent community project, without any implied upstream sponsorship or warranty.
